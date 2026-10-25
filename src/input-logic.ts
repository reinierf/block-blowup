// src/input-logic.ts
// Pure geometry for drag & drop: where a dragged piece is drawn and which board cell it
// would land on. No DOM, so it is unit-tested directly (tests/module/input-logic.test.ts).

import type { Shape } from './game/pieces';
import type { Layout } from './render/layout';

export const INPUT = {
  /** On touch, the piece floats this many board cells above the finger (tune on a phone). */
  touchLiftCells: 2.6,
  /**
   * On touch, upward finger movement (from where the drag started) moves the piece this
   * many times as far, so it reaches the board with a shorter swipe. Downward is 1:1.
   */
  touchUpGain: 2.0,
  /**
   * On touch, sideways finger movement (from where the drag started) moves the piece this
   * many times as far, in both directions, so a short swipe also reaches the board's sides.
   */
  touchSideGain: 1.4,
  /** Seconds for a picked-up piece to grow from tray size to board size. */
  liftSeconds: 0.12,
  /**
   * How far (in board cells) the piece's top-left may overhang the board and still snap.
   * 0.5 means "over the board or within about half a cell of it".
   */
  dropTolerance: 0.5,
  /**
   * While the piece is over no legal spot, the last legal target stays active until the
   * piece's top-left is more than this many board cells from it, so small overshoots and
   * jitter don't lose the drop.
   */
  holdCells: 1.5,
} as const;

export interface Point {
  x: number;
  y: number;
}

/**
 * Top-left of the dragged piece (board-cell sized) for a pointer position. `start` is the
 * pointer position where the drag began; on touch, movement above it and to either side
 * of it is amplified.
 */
export function pieceOrigin(
  layout: Layout,
  shape: Shape,
  pointer: Point,
  isTouch: boolean,
  start: Point = pointer,
): Point {
  const cell = layout.board.cell;
  const w = shape.width * cell;
  const h = shape.height * cell;
  if (!isTouch) return { x: pointer.x - w / 2, y: pointer.y - h / 2 };
  const x = start.x + (pointer.x - start.x) * INPUT.touchSideGain;
  const dy = pointer.y - start.y;
  const y = start.y + (dy < 0 ? dy * INPUT.touchUpGain : dy);
  return { x: x - w / 2, y: y - h - cell * INPUT.touchLiftCells };
}

/**
 * The board cell the piece's top-left would snap to, or null when the piece is too far
 * from the board (it then returns to the tray on release, and no ghost is shown).
 */
export function dropTarget(
  layout: Layout,
  shape: Shape,
  origin: Point,
  boardSize = 8,
): { col: number; row: number } | null {
  const { x, y, cell } = layout.board;
  const fx = (origin.x - x) / cell;
  const fy = (origin.y - y) / cell;
  const tol = INPUT.dropTolerance;
  if (fx < -tol || fy < -tol) return null;
  if (fx > boardSize - shape.width + tol || fy > boardSize - shape.height + tol) return null;
  const col = Math.min(boardSize - shape.width, Math.max(0, Math.round(fx)));
  const row = Math.min(boardSize - shape.height, Math.max(0, Math.round(fy)));
  return { col, row };
}

/**
 * Whether a previously legal `target` should still be held for a piece drawn at `origin`:
 * the piece's top-left is within `INPUT.holdCells` (straight-line distance) of the
 * target cell's top-left.
 */
export function holdsTarget(
  layout: Layout,
  origin: Point,
  target: { col: number; row: number },
): boolean {
  const { x, y, cell } = layout.board;
  const dx = (origin.x - x) / cell - target.col;
  const dy = (origin.y - y) / cell - target.row;
  return Math.hypot(dx, dy) <= INPUT.holdCells;
}
