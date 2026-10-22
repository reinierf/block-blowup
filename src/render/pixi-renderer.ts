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
import { GAME_OVER, gameOverAt, type GameOverFrame } from '../feedback/game-over';
import { radialSpawns, spawnsOnCentreLine, type Spawn } from '../feedback/particles';
import { FEEDBACK, type FeedbackPlan } from '../feedback/plan';
import type { Game, TurnResult } from '../game/state';
import type { DragState } from '../input';
import { INPUT } from '../input-logic';
import { trayCellFor, type Layout } from './layout';
import type { GameOverCallbacks, Renderer, RendererOptions } from './renderer';
import { hexToNumber, shade, theme } from './theme';

/** Gap between neighbouring cells, as a fraction of a cell. */
const CELL_GAP = 0.06;

/** Tray pieces that fit nowhere: dimmed and desaturated. */
const UNPLACEABLE_ALPHA = 0.35;
const UNPLACEABLE_TINT = 0x8a8f99;

/** Particle drag (1/s): speed falls by e^-k per second, so a burst spreads, slows and fades. */
const PARTICLE_DRAG = 3;

/** Newly dealt tray pieces pop in (scale 0 → slight overshoot → 1), with a white puff. */
const DEAL_POP = {
  seconds: 0.3,
  /** Delay between the three slots. */
  stagger: 0.07,
  /** Back-ease strength: higher overshoots more (1.2 ≈ 6%). */
  overshoot: 1.2,
  particlesPerCell: 2,
  particleSpeed: 80,
  particleSeconds: 0.5,
};

/** Back-out ease: 0 → 1, overshooting slightly before settling. */
const easeOutBack = (t: number, k: number) => 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2;

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
  layer: ParticleContainer;
}
interface Popup {
  kind: 'popup';
  t: number;
  dur: number;
  node: Container;
  y0: number;
}
interface Glow {
  kind: 'glow';
  t: number;
  dur: number;
  g: Graphics;
}
type Effect = Flash | Burst | Popup | Glow;

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
  const particleProps = { position: true, color: true, vertex: false, rotation: false };
  const particles = new ParticleContainer({ dynamicProperties: particleProps });
  /** Behind the tray: the deal puff. */
  const trayParticles = new ParticleContainer({ dynamicProperties: particleProps });
  const dragLayer = new Container();
  const popupLayer = new Container();
  boardLayer.addChild(panel, cellLayer, ghostLayer, flashLayer);
  app.stage.addChild(boardLayer, trayParticles, trayLayer, particles, dragLayer, popupLayer);

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

  function blockColor(color: string): string {
    if (color === GREY) return theme.gameOverBlock;
    return theme.blocks[color as keyof typeof theme.blocks] ?? theme.textSecondary;
  }

  /** Bevelled block: lighter top-left edge, darker bottom-right, soft gloss. */
  function blockTexture(color: string): Texture {
    let tex = blockTextures.get(color);
    if (!tex && layout) {
      const hex = blockColor(color);
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
    clearEffects(true);
  }

  // --- Tray and drag piece ---------------------------------------------------------------

  let trayKeys: string[] = [];
  /** Tray cell size for the current hand (see trayCellFor). */
  let trayCell = 0;
  /** Piece uids in the tray last frame; a uid not in it is newly dealt. */
  let trayUids = new Set<number>();
  /** Running pop-ins: piece uid → seconds since its pop started (negative while delayed). */
  const pops = new Map<number, number>();

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

  function drawTray(
    game: Game,
    drag: DragState | null,
    dt: number,
    over: GameOverFrame | null,
  ): void {
    const l = layout!;
    for (const [uid, t] of pops) {
      if (t + dt >= DEAL_POP.seconds) pops.delete(uid);
      else pops.set(uid, t + dt);
    }
    const keys = l.hand.slots.map((s) => {
      const piece = game.hand[s.index];
      return piece ? `${layoutVersion}:${piece.uid}` : '';
    });
    if (keys.join('|') !== trayKeys.join('|')) {
      // A new deal (or layout) brings keys not seen before: size the tray for that hand.
      // Placing a piece only removes keys, so the rest keep their size.
      if (keys.some((k) => k && !trayKeys.includes(k))) {
        trayCell = trayCellFor(
          l,
          game.hand.flatMap((p) => (p ? [p.shape] : [])),
        );
      }
      trayKeys = keys;
      trayLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
      for (const s of l.hand.slots) {
        const piece = game.hand[s.index];
        const c = piece
          ? pieceContainer(piece.shape.cells, piece.color, trayCell)
          : new Container();
        if (piece) {
          // Pivot on the piece's centre, so the pop-in scales it in place.
          const w = piece.shape.width * trayCell;
          const h = piece.shape.height * trayCell;
          c.pivot.set(w / 2, h / 2);
          c.position.set(s.cx, s.cy);
          if (!trayUids.has(piece.uid) && !opts.freezeAnimations) {
            pops.set(piece.uid, -s.index * DEAL_POP.stagger);
            const n = piece.shape.cells.length * DEAL_POP.particlesPerCell;
            const spawns = spawnsOnCentreLine(piece.shape.cells, n, Math.random);
            effects.push({
              kind: 'burst',
              t: 0,
              dur: DEAL_POP.particleSeconds,
              layer: trayParticles,
              parts: burst(spawns, DEAL_POP.particleSpeed, {
                x0: s.cx - w / 2,
                y0: s.cy - h / 2,
                unit: trayCell,
                layer: trayParticles,
                tint: hexToNumber(theme.dealSparkle),
              }),
            });
          }
        }
        trayLayer.addChild(c);
      }
      trayUids = new Set(game.hand.flatMap((p) => (p ? [p.uid] : [])));
    }
    trayLayer.children.forEach((c, i) => {
      const t = pops.get(game.hand[i]?.uid ?? -1);
      c.scale.set(
        t === undefined ? 1 : t <= 0 ? 0 : easeOutBack(t / DEAL_POP.seconds, DEAL_POP.overshoot),
      );
      c.visible = !drag || drag.handIndex !== i;
      const fits = game.pieceFits(i);
      // Game over: the leftover pieces turn red and wiggle, to show they fit nowhere.
      const stuck = !fits && !!over?.revealed;
      c.alpha = fits ? 1 : stuck ? 0.9 : UNPLACEABLE_ALPHA;
      const tint = fits ? 0xffffff : stuck ? hexToNumber(theme.ghostInvalid) : UNPLACEABLE_TINT;
      for (const sp of c.children) (sp as Sprite).tint = tint;
      const s = l.hand.slots[i]!;
      c.position.set(s.cx + (stuck ? over.wiggle * trayCell : 0), s.cy);
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
    const trayScale = trayCell / l.board.cell;
    const fromX = slot.cx - (drag.shape.width * trayCell) / 2;
    const fromY = slot.cy - (drag.shape.height * trayCell) / 2;
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

  const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  /** Pseudo-colour for blocks greyed out by the game-over sequence. */
  const GREY = '__grey';
  let shake = { amp: 0, t: 0 };
  /** The running (or finished) game-over sequence; see feedback/game-over.ts. */
  let gameOver: {
    t: number;
    /** Filled cells (row*8+col) in the order they grey. */
    order: number[];
    reduceMotion: boolean;
    onReveal: (() => void) | null;
    onDone: (() => void) | null;
    /** "No space left!", created when the reveal starts (and again after a resize). */
    banner: Container | null;
  } | null = null;

  function label(text: string, size: number, color: string): Text {
    return new Text({
      text,
      style: {
        fontFamily: FONT,
        fontWeight: '800',
        fontSize: Math.round(size),
        fill: hexToNumber(color),
      },
      anchor: 0.5,
    });
  }

  /** Every block colour, for multicoloured particles. */
  const particleTints = Object.values(theme.blocks).map(hexToNumber);

  /**
   * One particle per spawn, each in a random block colour unless `tint` is given. Spawns
   * are in cells of `unit` px from (x0, y0); by default board cells on the board.
   */
  function burst(
    spawns: readonly Spawn[],
    speed: number,
    o: { x0?: number; y0?: number; unit?: number; layer?: ParticleContainer; tint?: number } = {},
  ): Burst['parts'] {
    const parts: Burst['parts'] = [];
    const b = layout!.board;
    const { x0: bx = b.x, y0: by = b.y, unit: cell = b.cell, layer = particles } = o;
    for (const sp of spawns) {
      const tint = o.tint ?? particleTints[Math.floor(Math.random() * particleTints.length)]!;
      const size = (cell * (0.12 + Math.random() * 0.14)) / 8;
      const p = new Particle({
        texture: particleTexture,
        x: bx + sp.x * cell,
        y: by + sp.y * cell,
        scaleX: size,
        scaleY: size,
        anchorX: 0.5,
        anchorY: 0.5,
        tint,
      });
      layer.addParticle(p);
      // No gravity: drag slows them as they fade.
      const v = speed * (0.4 + Math.random() * 0.6);
      parts.push({ p, vx: sp.dx * v, vy: sp.dy * v });
    }
    return parts;
  }

  function playEffects(result: TurnResult, plan: FeedbackPlan): void {
    if (opts.freezeAnimations || !layout) return;
    const b = layout.board;
    const s = b.cell * (1 - 2 * CELL_GAP);

    if (plan.dropParticlesPerCell > 0) {
      // A small puff off the placed piece; slower and shorter-lived than a line clear.
      const cells = result.placedCells;
      const n = Math.round(cells.length * plan.dropParticlesPerCell);
      const parts = burst(spawnsOnCentreLine(cells, n, Math.random), 150);
      effects.push({ kind: 'burst', t: 0, dur: 0.55, parts, layer: particles });
    }

    if (result.clearedCells.length > 0) {
      const sprites = result.clearedCells.map((c) => {
        const sp = new Sprite(flashTexture);
        sp.anchor.set(0.5);
        const p = cellPos(c.x, c.y);
        sp.position.set(p.x + s / 2, p.y + s / 2);
        flashLayer.addChild(sp);
        return sp;
      });
      effects.push({ kind: 'flash', t: 0, dur: 0.28, sprites });

      const cells = result.clearedCells.map((c): [number, number] => [c.x, c.y]);
      const n = cells.length * plan.particlesPerCell;
      const parts = burst(spawnsOnCentreLine(cells, n, Math.random), 260);
      effects.push({ kind: 'burst', t: 0, dur: 0.9, parts, layer: particles });
    }

    if (plan.popup) {
      // Popup at the centre of the cleared cells, kept inside the board horizontally.
      const node = new Container();
      const lines: Text[] = [];
      if (plan.popup.praise) lines.push(label(plan.popup.praise, b.cell * 0.85, theme.accent));
      lines.push(label(plan.popup.points, b.cell * 0.7, theme.text));
      if (plan.popup.combo) lines.push(label(plan.popup.combo, b.cell * 0.5, theme.accent));
      let y = 0;
      for (const t of lines) {
        t.y = y + t.height / 2;
        y += t.height * 0.95;
        node.addChild(t);
      }
      node.pivot.set(0, y / 2);
      const half = Math.max(...lines.map((t) => t.width)) / 2;
      const px = Math.min(Math.max(b.x + plan.popup.x * b.cell, b.x + half), b.x + b.size - half);
      node.position.set(px, b.y + plan.popup.y * b.cell);
      popupLayer.addChild(node);
      effects.push({ kind: 'popup', t: 0, dur: 1.0, node, y0: node.y });
    }

    if (plan.shake > 0) shake = { amp: plan.shake, t: 0 };

    if (plan.celebrate) {
      const pad = b.cell * 0.18;
      const g = new Graphics()
        .roundRect(b.x - pad, b.y - pad, b.size + 2 * pad, b.size + 2 * pad, b.cell * 0.3)
        .fill(hexToNumber(theme.accent));
      g.alpha = 0;
      flashLayer.addChild(g);
      effects.push({ kind: 'glow', t: 0, dur: 0.9, g });
      const parts = burst(radialSpawns(4, 4, plan.particlesPerCell * 20, Math.random), 520);
      effects.push({ kind: 'burst', t: 0, dur: 1.2, parts, layer: particles });
    }
  }

  /**
   * Game over: a pause, then the banner and the red leftover pieces (`onReveal`), then the
   * filled blocks turn grey one by one, then `onDone` (the score screen).
   */
  function playGameOver(game: Game, cb: GameOverCallbacks): void {
    const order: number[] = [];
    game.board.grid.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c !== null) order.push(y * 8 + x);
      }),
    );
    gameOver = { t: 0, order, banner: null, ...cb };
    if (opts.freezeAnimations || !layout) skipGameOver();
  }

  /** Jump to the end of the game-over sequence (a tap); does nothing when none is running. */
  function skipGameOver(): void {
    if (!gameOver?.onDone) return;
    gameOver.t = Infinity;
    finishGameOver();
  }

  /** Fire the sequence's callbacks that are due, each once. */
  function finishGameOver(): void {
    const g = gameOver!;
    const f = gameOverAt(g.t, g.order.length, g.reduceMotion);
    lastSignature = '';
    if (f.revealed && g.onReveal) {
      const reveal = g.onReveal;
      g.onReveal = null;
      reveal();
    }
    if (f.phase === 'done' && g.onDone) {
      const done = g.onDone;
      g.onDone = null;
      done();
    }
  }

  function drawBanner(f: GameOverFrame): void {
    const g = gameOver!;
    if (f.banner <= 0) return;
    const b = layout!.board;
    if (!g.banner) {
      const size = Math.round(b.cell * 0.75);
      g.banner = new Container();
      g.banner.addChild(
        new Text({
          text: GAME_OVER.bannerText,
          style: {
            fontFamily: FONT,
            fontWeight: '800',
            fontSize: size,
            fill: hexToNumber(theme.text),
            stroke: { color: hexToNumber(theme.boardPanel), width: size * 0.18, join: 'round' },
          },
          anchor: 0.5,
        }),
      );
      // Never wider than the board.
      g.banner.scale.set(Math.min(1, (b.size * 0.94) / g.banner.width));
      popupLayer.addChild(g.banner);
    }
    const p = f.banner;
    const drop = g.reduceMotion ? 0 : b.cell * 1.2 * (1 - easeOutBack(p, DEAL_POP.overshoot));
    g.banner.position.set(b.x + b.size / 2, b.y + b.size / 2 - drop);
    g.banner.alpha = Math.min(1, p * 2);
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
        const drag = Math.exp(-PARTICLE_DRAG * dt);
        for (const part of e.parts) {
          part.vx *= drag;
          part.vy *= drag;
          part.p.x += part.vx * dt;
          part.p.y += part.vy * dt;
          part.p.alpha = 1 - p;
        }
      } else if (e.kind === 'popup') {
        e.node.y = e.y0 - layout!.board.cell * 0.9 * easeOut(p);
        e.node.alpha = Math.min(1, (1 - p) * 2.2);
        e.node.scale.set(p < 0.12 ? 0.7 + (p / 0.12) * 0.3 : 1);
      } else {
        // Board-clear glow: quick rise, slow fade; gentle (no full-screen flash).
        e.g.alpha = 0.28 * (p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85);
      }
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      if (effects[i]!.t >= effects[i]!.dur) disposeEffect(effects.splice(i, 1)[0]!);
    }

    if (shake.amp > 0) {
      shake.t += dt;
      const k = 1 - shake.t / FEEDBACK.shakeSeconds;
      if (k <= 0) {
        shake.amp = 0;
        app.stage.position.set(0, 0);
      } else {
        const a = shake.amp * k;
        app.stage.position.set((Math.random() * 2 - 1) * a, (Math.random() * 2 - 1) * a);
      }
    }

    if (gameOver?.onDone) {
      gameOver.t += dt;
      finishGameOver();
    }
  }

  function animating(): boolean {
    return effects.length > 0 || pops.size > 0 || shake.amp > 0 || lift < 1 || !!gameOver?.onDone;
  }

  function disposeEffect(e: Effect): void {
    if (e.kind === 'flash') e.sprites.forEach((sp) => sp.destroy());
    else if (e.kind === 'burst') e.parts.forEach((part) => e.layer.removeParticle(part.p));
    else if (e.kind === 'popup') e.node.destroy({ children: true });
    else e.g.destroy();
  }

  /** Drop running effects; a resize keeps the game-over sequence going (redrawn to size). */
  function clearEffects(keepGameOver = false): void {
    effects.splice(0).forEach(disposeEffect);
    shake = { amp: 0, t: 0 };
    app.stage.position.set(0, 0);
    gameOver?.banner?.destroy({ children: true });
    if (gameOver) gameOver.banner = null;
    if (!keepGameOver) gameOver = null;
    lastSignature = '';
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
    if (sig === lastSignature && !animating()) return false;
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
    const over = gameOver
      ? gameOverAt(gameOver.t, gameOver.order.length, gameOver.reduceMotion)
      : null;
    if (over) {
      for (const i of gameOver!.order.slice(0, over.greyed)) {
        cellSprites[i]!.texture = blockTexture(GREY);
      }
      drawBanner(over);
    }
    drawGhost(drag);
    drawTray(game, drag, dt, over);
    drawDrag(drag, dt);
    updateEffects(dt);
    app.renderer.render(app.stage);
    return true;
  }

  return {
    canvas,
    resize,
    frame,
    playEffects,
    playGameOver,
    skipGameOver,
    clearEffects: () => clearEffects(),
  };
}
