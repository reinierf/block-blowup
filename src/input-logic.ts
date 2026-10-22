// src/input-logic.ts
// Pure geometry for drag & drop: where a dragged piece is drawn and which board cell it
// would land on. No DOM, so it is unit-tested directly (tests/module/input-logic.test.ts).

import type { Shape } from './game/pieces';
import type { Layout } from './render/layout';

export const INPUT = {
  /** On touch, the piece floats this many board cells above the finger (tune on a phone). */
  touchLiftCells: 2.2,
  /**
   * On touch, upward finger movement (from where the drag started) moves the piece this
   * many times as far, so it reaches the board with a shorter swipe. Downward is 1:1.
   */
  touchUpGain: 1.25,
  /** Seconds for a picked-up piece to grow from tray size to board size. */
  liftSeconds: 0.12,
  /**
   * How far (in board cells) the piece's top-left may overhang the board and still snap.
   * 0.5 means "over the board or within about half a cell of it".
   */
  dropTolerance: 0.5,
} as const;

export interface Point {
  x: number;
  y: number;
}

/**
 * Top-left of the dragged piece (board-cell sized) for a pointer position. `startY` is the
 * pointer's y where the drag began; on touch, movement above it is amplified.
 */
export function pieceOrigin(
  layout: Layout,
  shape: Shape,
  pointer: Point,
  isTouch: boolean,
  startY = pointer.y,
): Point {
  const cell = layout.board.cell;
  const w = shape.width * cell;
  const h = shape.height * cell;
  if (!isTouch) return { x: pointer.x - w / 2, y: pointer.y - h / 2 };
  const dy = pointer.y - startY;
  const y = startY + (dy < 0 ? dy * INPUT.touchUpGain : dy);
  return { x: pointer.x - w / 2, y: y - h - cell * INPUT.touchLiftCells };
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
