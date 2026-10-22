// src/render/layout.ts
// Computes board + hand geometry for a given viewport (in CSS pixels).
// Shared by the renderer and the input layer so they always agree on hit-testing.

const BOARD_CELLS = 8;

export interface HandSlot {
  index: number;
  /** Center x of the slot. */
  cx: number;
  /** Center y of the slot. */
  cy: number;
  w: number;
  h: number;
}

export interface Layout {
  width: number;
  height: number;
  board: { x: number; y: number; size: number; cell: number };
  hand: { top: number; areaH: number; slotW: number; cell: number; slots: HandSlot[] };
}

/**
 * @param width  viewport width in CSS px
 * @param height viewport height in CSS px
 */
export function computeLayout(width: number, height: number): Layout {
  const boardSize = Math.min(width * 0.94, height * 0.6);
  const cell = boardSize / BOARD_CELLS;
  const boardX = (width - boardSize) / 2;
  const boardY = Math.max(height * 0.05, 8);

  const handTop = boardY + boardSize + cell * 0.8;
  const handAreaH = Math.max(cell * 2, height - handTop - 8);
  const slotW = width / 3;
  // Hand blocks are smaller; ensure a 5-wide piece fits and slots aren't too tall.
  const handCell = Math.min(cell * 0.62, slotW / 5.6, handAreaH / 6);

  const slots = [0, 1, 2].map((i): HandSlot => ({
    index: i,
    cx: (i + 0.5) * slotW,
    cy: handTop + handAreaH / 2,
    w: slotW,
    h: handAreaH,
  }));

  return {
    width,
    height,
    board: { x: boardX, y: boardY, size: boardSize, cell },
    hand: { top: handTop, areaH: handAreaH, slotW, cell: handCell, slots },
  };
}
