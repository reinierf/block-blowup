// src/render/renderer.ts
// All canvas drawing: board, hand, drag piece, ghost preview, and transient effects.

import type { Board } from '../game/board';
import type { Shape } from '../game/pieces';
import type { Game } from '../game/state';
import type { DragState } from '../input';
import type { Layout } from './layout';

export interface Ghost {
  shape: Shape;
  ox: number;
  oy: number;
  valid: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
}

interface EffectBase {
  t: number;
  dur: number;
}

export type Effect =
  | (EffectBase & { type: 'flash'; cells: { x: number; y: number }[] })
  | (EffectBase & { type: 'burst'; parts: Particle[] })
  | (EffectBase & { type: 'popup'; x: number; y: number; text: string; sub: string });

/** Rounded-rectangle path (works everywhere, no ctx.roundRect dependency). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Lighten (amount > 0) or darken (amount < 0) a #rrggbb color. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amount >= 0) {
    r += (255 - r) * amount;
    g += (255 - g) * amount;
    b += (255 - b) * amount;
  } else {
    const k = 1 + amount;
    r *= k;
    g *= k;
    b *= k;
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** Draw one glossy rounded block. */
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  opts: { alpha?: number; radius?: number } = {},
): void {
  const alpha = opts.alpha ?? 1;
  const r = opts.radius ?? Math.max(3, w * 0.22);
  ctx.save();
  ctx.globalAlpha *= alpha;

  roundRect(ctx, x, y, w, h, r);
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, shade(color, 0.34));
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, shade(color, -0.2));
  ctx.fillStyle = grad;
  ctx.fill();

  // Top gloss highlight.
  roundRect(ctx, x + w * 0.18, y + h * 0.1, w * 0.64, h * 0.3, r * 0.55);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fill();

  ctx.restore();
}

/** Draw the board panel, its cells, and (if dragging) the placement ghost. */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  board: Board,
  layout: Layout,
  ghost: Ghost | null,
): void {
  const b = layout.board;
  const cell = b.cell;
  const g = cell * 0.06;

  // Panel behind the grid.
  roundRect(
    ctx,
    b.x - cell * 0.18,
    b.y - cell * 0.18,
    b.size + cell * 0.36,
    b.size + cell * 0.36,
    cell * 0.35,
  );
  ctx.fillStyle = 'rgba(10, 13, 22, 0.6)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.stroke();

  // Cells.
  for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      const px = b.x + x * cell + g;
      const py = b.y + y * cell + g;
      const s = cell - 2 * g;
      const color = board.grid[y]![x];
      if (color) {
        drawBlock(ctx, px, py, s, s, color);
      } else {
        roundRect(ctx, px, py, s, s, s * 0.2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
        ctx.fill();
      }
    }
  }

  // Ghost preview.
  if (ghost) {
    ctx.save();
    for (const [cx, cy] of ghost.shape.cells) {
      const x = ghost.ox + cx;
      const y = ghost.oy + cy;
      if (!board.inBounds(x, y)) continue;
      const px = b.x + x * cell + g;
      const py = b.y + y * cell + g;
      const s = cell - 2 * g;
      roundRect(ctx, px, py, s, s, s * 0.2);
      ctx.fillStyle = ghost.valid ? 'rgba(96, 220, 160, 0.45)' : 'rgba(255, 90, 90, 0.32)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = ghost.valid ? 'rgba(150, 255, 205, 0.9)' : 'rgba(255, 120, 120, 0.9)';
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Draw the hand pieces into their slots (skipping the slot currently being dragged). */
export function drawHand(
  ctx: CanvasRenderingContext2D,
  game: Game,
  layout: Layout,
  drag: DragState | null,
): void {
  const handCell = layout.hand.cell;
  const g = handCell * 0.06;
  for (const slot of layout.hand.slots) {
    if (drag && drag.handIndex === slot.index) continue;
    const piece = game.hand[slot.index];
    if (!piece) continue;
    const { shape, color } = piece;
    const ox = slot.cx - (shape.width * handCell) / 2;
    const oy = slot.cy - (shape.height * handCell) / 2;
    for (const [cx, cy] of shape.cells) {
      drawBlock(
        ctx,
        ox + cx * handCell + g,
        oy + cy * handCell + g,
        handCell - 2 * g,
        handCell - 2 * g,
        color,
      );
    }
  }
}

/** Draw the piece following the pointer, at full board block size. */
export function drawDraggingPiece(
  ctx: CanvasRenderingContext2D,
  drag: DragState,
  layout: Layout,
): void {
  const cell = layout.board.cell;
  const g = cell * 0.06;
  ctx.save();
  ctx.globalAlpha = 0.95;
  for (const [cx, cy] of drag.shape.cells) {
    drawBlock(
      ctx,
      drag.originX + cx * cell + g,
      drag.originY + cy * cell + g,
      cell - 2 * g,
      cell - 2 * g,
      drag.color,
    );
  }
  ctx.restore();
}

/** Draw transient effects (line-clear flash, particle burst, floating score popup). */
export function drawEffects(
  ctx: CanvasRenderingContext2D,
  effects: readonly Effect[],
  layout: Layout,
): void {
  const b = layout.board;
  const cell = b.cell;
  const g = cell * 0.06;

  for (const e of effects) {
    const p = Math.min(1, e.t / e.dur); // 0 → 1 over the effect's life

    if (e.type === 'flash') {
      const s = (cell - 2 * g) * (1 - p * 0.45);
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = '#ffffff';
      for (const c of e.cells) {
        const cx = b.x + c.x * cell + cell / 2;
        const cy = b.y + c.y * cell + cell / 2;
        roundRect(ctx, cx - s / 2, cy - s / 2, s, s, s * 0.2);
        ctx.fill();
      }
      ctx.restore();
    } else if (e.type === 'burst') {
      ctx.save();
      ctx.globalAlpha = 1 - p;
      for (const pt of e.parts) {
        ctx.fillStyle = pt.color || '#ffffff';
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      }
      ctx.restore();
    } else {
      const rise = cell * 1.1 * p;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - p) * 1.8);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fde68a';
      ctx.font = `800 ${Math.round(cell * 0.95)}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(e.text, e.x, e.y - rise);
      if (e.sub) {
        ctx.fillStyle = '#93c5fd';
        ctx.font = `800 ${Math.round(cell * 0.6)}px system-ui, -apple-system, sans-serif`;
        ctx.fillText(e.sub, e.x, e.y - rise + cell * 0.95);
      }
      ctx.restore();
    }
  }
}
