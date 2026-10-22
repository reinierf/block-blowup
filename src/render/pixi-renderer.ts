// src/render/pixi-renderer.ts
// PixiJS (WebGL, WebGPU where available) implementation of the Renderer interface.
// Block textures are baked once per colour and cell size, so a frame is just sprites.

import {
  Application,
  Container,
  Graphics,
  Particle,
  ParticleContainer,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import type { Game, TurnResult } from '../game/state';
import type { DragState } from '../input';
import { INPUT } from '../input-logic';
import type { Layout } from './layout';
import type { Renderer, RendererOptions } from './renderer';
import { hexToNumber, shade, theme } from './theme';

/** Gap between neighbouring cells, as a fraction of a cell. */
const CELL_GAP = 0.06;

/** Tray pieces that fit nowhere: dimmed and desaturated. */
const UNPLACEABLE_ALPHA = 0.35;
const UNPLACEABLE_TINT = 0x8a8f99;

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

interface Flash {
  kind: 'flash';
  t: number;
  dur: number;
  sprites: Sprite[];
}
interface Burst {
  kind: 'burst';
  t: number;
  dur: number;
  parts: { p: Particle; vx: number; vy: number }[];
}
interface Popup {
  kind: 'popup';
  t: number;
  dur: number;
  text: Text;
  y0: number;
}
type Effect = Flash | Burst | Popup;

export async function createPixiRenderer(
  host: HTMLElement,
  opts: RendererOptions,
): Promise<Renderer> {
  const app = new Application();
  await app.init({
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, opts.maxResolution),
    width: host.clientWidth || 1,
    height: host.clientHeight || 1,
    autoStart: false,
    sharedTicker: false,
  });
  const canvas = app.canvas;
  canvas.id = 'game';
  host.appendChild(canvas);

  const boardLayer = new Container();
  const panel = new Graphics();
  const cellLayer = new Container();
  const ghostLayer = new Container();
  const flashLayer = new Container();
  const trayLayer = new Container();
  const particles = new ParticleContainer({
    dynamicProperties: { position: true, color: true, vertex: false, rotation: false },
  });
  const dragLayer = new Container();
  const popupLayer = new Container();
  boardLayer.addChild(panel, cellLayer, ghostLayer, flashLayer);
  app.stage.addChild(boardLayer, trayLayer, particles, dragLayer, popupLayer);

  let layout: Layout | null = null;
  let layoutVersion = 0;
  let cellSprites: Sprite[] = [];
  const blockTextures = new Map<string, Texture>();
  let emptyTexture = Texture.EMPTY;
  let flashTexture = Texture.EMPTY;
  let particleTexture = Texture.EMPTY;
  const effects: Effect[] = [];

  // --- Textures ------------------------------------------------------------------------

  function bake(draw: (g: Graphics) => void): Texture {
    const g = new Graphics();
    draw(g);
    const tex = app.renderer.generateTexture({ target: g, resolution: app.renderer.resolution });
    g.destroy();
    return tex;
  }

  /** Bevelled block: lighter top-left edge, darker bottom-right, soft gloss. */
  function blockTexture(color: string): Texture {
    let tex = blockTextures.get(color);
    if (!tex && layout) {
      const hex = theme.blocks[color as keyof typeof theme.blocks] ?? theme.textSecondary;
      const s = layout.board.cell * (1 - 2 * CELL_GAP);
      const r = s * 0.16;
      const b = Math.max(1, s * 0.09);
      tex = bake((g) => {
        g.roundRect(0, 0, s, s, r).fill(shade(hex, -theme.bevelDark));
        g.roundRect(0, 0, s - b, s - b, r).fill(shade(hex, theme.bevelLight));
        g.roundRect(b, b, s - 2 * b, s - 2 * b, r * 0.75).fill(hexToNumber(hex));
        g.roundRect(b * 1.6, b * 1.4, s - 3.2 * b, (s - 2 * b) * 0.38, r * 0.5).fill({
          color: 0xffffff,
          alpha: theme.gloss,
        });
      });
      blockTextures.set(color, tex);
    }
    return tex ?? Texture.EMPTY;
  }

  function rebuildTextures(): void {
    for (const t of blockTextures.values()) t.destroy(true);
    blockTextures.clear();
    for (const t of [emptyTexture, flashTexture, particleTexture]) {
      if (t !== Texture.EMPTY) t.destroy(true);
    }
    if (!layout) return;
    const s = layout.board.cell * (1 - 2 * CELL_GAP);
    emptyTexture = bake((g) =>
      g.roundRect(0, 0, s, s, s * 0.16).fill(hexToNumber(theme.emptyCell)),
    );
    flashTexture = bake((g) => g.roundRect(0, 0, s, s, s * 0.16).fill(hexToNumber(theme.text)));
    particleTexture = bake((g) => g.rect(0, 0, 8, 8).fill(0xffffff));
  }

  // --- Layout --------------------------------------------------------------------------

  function cellPos(col: number, row: number): { x: number; y: number } {
    const b = layout!.board;
    return { x: b.x + col * b.cell + b.cell * CELL_GAP, y: b.y + row * b.cell + b.cell * CELL_GAP };
  }

  function resize(next: Layout): void {
    layout = next;
    layoutVersion++;
    app.renderer.resize(next.width, next.height);
    rebuildTextures();

    const b = next.board;
    const pad = b.cell * 0.18;
    panel
      .clear()
      .roundRect(b.x - pad, b.y - pad, b.size + 2 * pad, b.size + 2 * pad, b.cell * 0.3)
      .fill(hexToNumber(theme.boardPanel))
      .stroke({ color: shade(theme.boardPanel, -0.35), width: 2, alpha: 0.6, alignment: 1 });

    cellLayer.removeChildren().forEach((c) => c.destroy());
    cellSprites = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const sp = new Sprite(emptyTexture);
        const p = cellPos(col, row);
        sp.position.set(p.x, p.y);
        cellLayer.addChild(sp);
        cellSprites.push(sp);
      }
    }
    trayKeys = [];
    dragKey = '';
    clearEffects();
  }

  // --- Tray and drag piece ---------------------------------------------------------------

  let trayKeys: string[] = [];

  function pieceContainer(
    cells: readonly (readonly [number, number])[],
    color: string,
    cell: number,
  ): Container {
    const c = new Container();
    const tex = blockTexture(color);
    const scale = cell / layout!.board.cell;
    for (const [cx, cy] of cells) {
      const sp = new Sprite(tex);
      sp.scale.set(scale);
      sp.position.set(cx * cell + cell * CELL_GAP, cy * cell + cell * CELL_GAP);
      c.addChild(sp);
    }
    return c;
  }

  function drawTray(game: Game, drag: DragState | null): void {
    const l = layout!;
    const keys = l.hand.slots.map((s) => {
      const piece = game.hand[s.index];
      return piece ? `${layoutVersion}:${piece.uid}` : '';
    });
    if (keys.join('|') !== trayKeys.join('|')) {
      trayKeys = keys;
      trayLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
      for (const s of l.hand.slots) {
        const piece = game.hand[s.index];
        const c = piece
          ? pieceContainer(piece.shape.cells, piece.color, l.hand.cell)
          : new Container();
        if (piece) {
          c.position.set(
            s.cx - (piece.shape.width * l.hand.cell) / 2,
            s.cy - (piece.shape.height * l.hand.cell) / 2,
          );
        }
        trayLayer.addChild(c);
      }
    }
    trayLayer.children.forEach((c, i) => {
      c.visible = !drag || drag.handIndex !== i;
      const fits = game.pieceFits(i);
      c.alpha = fits ? 1 : UNPLACEABLE_ALPHA;
      for (const sp of c.children) (sp as Sprite).tint = fits ? 0xffffff : UNPLACEABLE_TINT;
    });
  }

  let dragKey = '';
  /** 0 → 1 while a picked-up piece grows from tray size to board size. */
  let lift = 1;

  function drawDrag(drag: DragState | null, dt: number): void {
    const key = drag ? `${layoutVersion}:${drag.handIndex}:${drag.shape.id}:${drag.color}` : '';
    if (key !== dragKey) {
      dragKey = key;
      lift = opts.freezeAnimations ? 1 : 0;
      dragLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
      if (drag)
        dragLayer.addChild(pieceContainer(drag.shape.cells, drag.color, layout!.board.cell));
    } else if (drag) {
      lift = Math.min(1, lift + dt / INPUT.liftSeconds);
    }
    if (!drag) return;
    // Interpolate from where the piece sits in the tray to where it follows the pointer.
    const l = layout!;
    const slot = l.hand.slots[drag.handIndex]!;
    const trayScale = l.hand.cell / l.board.cell;
    const fromX = slot.cx - (drag.shape.width * l.hand.cell) / 2;
    const fromY = slot.cy - (drag.shape.height * l.hand.cell) / 2;
    const e = easeOut(lift);
    dragLayer.scale.set(trayScale + (1 - trayScale) * e);
    dragLayer.position.set(fromX + (drag.originX - fromX) * e, fromY + (drag.originY - fromY) * e);
  }

  /** Cells (index row*8+col) whose texture the line preview overrides this frame. */
  const previewed = new Set<number>();

  const ghostPool: Sprite[] = [];

  function drawGhost(drag: DragState | null): void {
    let used = 0;
    if (drag?.target) {
      const tex = drag.valid ? blockTexture(drag.color) : flashTexture;
      for (const [cx, cy] of drag.shape.cells) {
        let sp = ghostPool[used];
        if (!sp) {
          sp = new Sprite();
          ghostPool.push(sp);
          ghostLayer.addChild(sp);
        }
        sp.texture = tex;
        sp.tint = drag.valid ? 0xffffff : hexToNumber(theme.ghostInvalid);
        const inLine =
          drag.preview?.rows.includes(drag.target.row + cy) ||
          drag.preview?.cols.includes(drag.target.col + cx);
        sp.alpha = drag.valid ? (inLine ? 0.9 : 0.4) : 0.35;
        const p = cellPos(drag.target.col + cx, drag.target.row + cy);
        sp.position.set(p.x, p.y);
        sp.visible = true;
        used++;
      }
    }
    for (let i = used; i < ghostPool.length; i++) ghostPool[i]!.visible = false;
  }

  // --- Effects -------------------------------------------------------------------------

  function playEffects(result: TurnResult): void {
    if (opts.freezeAnimations || !layout || result.clearedCells.length === 0) return;
    const b = layout.board;
    const s = b.cell * (1 - 2 * CELL_GAP);

    const sprites = result.clearedCells.map((c) => {
      const sp = new Sprite(flashTexture);
      sp.anchor.set(0.5);
      const p = cellPos(c.x, c.y);
      sp.position.set(p.x + s / 2, p.y + s / 2);
      flashLayer.addChild(sp);
      return sp;
    });
    effects.push({ kind: 'flash', t: 0, dur: 0.28, sprites });

    const parts: Burst['parts'] = [];
    for (const c of result.clearedCells) {
      const p = cellPos(c.x, c.y);
      const tint = hexToNumber(
        theme.blocks[c.color as keyof typeof theme.blocks] ?? theme.textSecondary,
      );
      for (let i = 0; i < 3; i++) {
        const size = (b.cell * (0.12 + Math.random() * 0.14)) / 8;
        const particle = new Particle({
          texture: particleTexture,
          x: p.x + s / 2,
          y: p.y + s / 2,
          scaleX: size,
          scaleY: size,
          anchorX: 0.5,
          anchorY: 0.5,
          tint,
        });
        particles.addParticle(particle);
        parts.push({ p: particle, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 240 - 40 });
      }
    }
    effects.push({ kind: 'burst', t: 0, dur: 0.9, parts });

    const text = new Text({
      text: `+${result.points}`,
      style: {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        fontWeight: '800',
        fontSize: Math.round(b.cell * 0.85),
        fill: hexToNumber(theme.accent),
      },
      anchor: 0.5,
    });
    text.position.set(b.x + b.size / 2, b.y + b.size / 2);
    popupLayer.addChild(text);
    effects.push({ kind: 'popup', t: 0, dur: 0.9, text, y0: text.y });
  }

  function updateEffects(dt: number): void {
    for (const e of effects) {
      e.t += dt;
      const p = Math.min(1, e.t / e.dur);
      if (e.kind === 'flash') {
        for (const sp of e.sprites) {
          sp.alpha = 0.85 * (1 - p);
          sp.scale.set(1 - p * 0.45);
        }
      } else if (e.kind === 'burst') {
        for (const part of e.parts) {
          part.vy += 900 * dt;
          part.p.x += part.vx * dt;
          part.p.y += part.vy * dt;
          part.p.alpha = 1 - p;
        }
      } else {
        e.text.y = e.y0 - layout!.board.cell * 1.1 * p;
        e.text.alpha = Math.min(1, (1 - p) * 1.8);
      }
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      if (effects[i]!.t >= effects[i]!.dur) disposeEffect(effects.splice(i, 1)[0]!);
    }
  }

  function disposeEffect(e: Effect): void {
    if (e.kind === 'flash') e.sprites.forEach((sp) => sp.destroy());
    else if (e.kind === 'burst') e.parts.forEach((part) => particles.removeParticle(part.p));
    else e.text.destroy();
  }

  function clearEffects(): void {
    effects.splice(0).forEach(disposeEffect);
  }

  // --- Frame ---------------------------------------------------------------------------

  let lastSignature = '';

  /** Everything that can change the picture, except running effects. */
  function signature(game: Game, drag: DragState | null): string {
    const hand = game.hand.map((p) => p?.uid ?? '-').join(',');
    const d = drag
      ? `${drag.handIndex}:${drag.originX}:${drag.originY}:${drag.target?.col}:${drag.target?.row}:${drag.valid}`
      : '';
    return `${layoutVersion}|${game.score}|${game.status}|${hand}|${d}`;
  }

  function frame(game: Game, drag: DragState | null, dt: number): boolean {
    if (!layout) return false;
    const sig = signature(game, drag);
    if (sig === lastSignature && effects.length === 0 && lift >= 1) return false;
    lastSignature = sig;
    // Line-clear preview: existing cells in lines the drop would complete take on the
    // dragged piece's colour.
    previewed.clear();
    if (drag?.valid && drag.preview) {
      for (const [x, y] of drag.preview.cells) previewed.add(y * 8 + x);
    }
    const grid = game.board.grid;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const i = row * 8 + col;
        const color = previewed.has(i) && grid[row]![col] ? drag!.color : grid[row]![col];
        cellSprites[i]!.texture = color ? blockTexture(color) : emptyTexture;
      }
    }
    drawGhost(drag);
    drawTray(game, drag);
    drawDrag(drag, dt);
    updateEffects(dt);
    app.renderer.render(app.stage);
    return true;
  }

  return { canvas, resize, frame, playEffects, clearEffects };
}
