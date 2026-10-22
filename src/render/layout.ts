// src/render/layout.ts
// Mobile-first geometry for a viewport (CSS px), shared by the renderer, the input layer
// and the DOM HUD so they always agree. Portrait phone first: HUD on top, the board as
// wide as the screen allows minus a gutter, the tray of three pieces in thumb reach.
// Wider screens centre the same column; there is no separate landscape layout.

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export const LAYOUT = {
  /** Side gutter between the screen (or column) edge and the board. */
  gutter: 16,
  /** Column width cap on tablets, landscape and desktop. */
  maxColumn: 480,
  hudHeight: 64,
  /** Minimum gap between HUD and board, and between board and tray. */
  gap: 12,
  /** Tray blocks are this fraction of a board cell. */
  trayScale: 0.5,
  /** The longest piece is 5 cells; slots must fit it at tray scale. */
  maxPieceCells: 5,
  /** Padding inside a tray slot around the piece. */
  slotPadding: 8,
  /** Minimum touch target (CSS px). */
  minTouch: 44,
  /** Share of spare vertical space placed above the board (the rest goes to the tray). */
  spareAboveBoard: 0.35,
} as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HandSlot extends Rect {
  index: number;
  /** Centre of the slot. */
  cx: number;
  cy: number;
}

export interface Layout {
  width: number;
  height: number;
  /** The safe area: the viewport minus the insets. */
  safe: Rect;
  /** The centred content column. */
  column: Rect;
  hud: Rect;
  board: { x: number; y: number; size: number; cell: number };
  hand: { cell: number; slots: HandSlot[] };
}

export function computeLayout(width: number, height: number, insets: Insets = NO_INSETS): Layout {
  const L = LAYOUT;
  const safe: Rect = {
    x: insets.left,
    y: insets.top,
    w: Math.max(0, width - insets.left - insets.right),
    h: Math.max(0, height - insets.top - insets.bottom),
  };
  const colW = Math.min(safe.w, L.maxColumn);
  const column: Rect = { x: safe.x + (safe.w - colW) / 2, y: safe.y, w: colW, h: safe.h };
  const hud: Rect = { x: column.x, y: column.y, w: colW, h: L.hudHeight };

  // Board size: limited by width (gutters) and by height (HUD, gaps, and a tray tall
  // enough for a 5-cell piece at tray scale).
  const traySlotPad = 2 * L.slotPadding;
  const trayPerBoard = (L.maxPieceCells * L.trayScale) / 8; // tray piece height per board px
  const availH = column.h - L.hudHeight - 2 * L.gap - traySlotPad;
  const byWidth = colW - 2 * L.gutter;
  const byHeight = availH / (1 + trayPerBoard);
  const boardSize = Math.max(0, Math.floor(Math.min(byWidth, byHeight)));
  const cell = boardSize / 8;

  const slotW = colW / 3;
  const trayCell = Math.min(cell * L.trayScale, (slotW - traySlotPad) / L.maxPieceCells);
  const minTrayH = Math.max(L.maxPieceCells * trayCell + traySlotPad, L.minTouch);

  const spare = Math.max(0, availH + traySlotPad - boardSize - minTrayH);
  const boardY = hud.y + hud.h + L.gap + spare * L.spareAboveBoard;
  const trayY = boardY + boardSize + L.gap;
  const trayH = column.y + column.h - trayY;

  const slots = [0, 1, 2].map((index): HandSlot => ({
    index,
    x: column.x + index * slotW,
    y: trayY,
    w: slotW,
    h: trayH,
    cx: column.x + (index + 0.5) * slotW,
    cy: trayY + trayH / 2,
  }));

  return {
    width,
    height,
    safe,
    column,
    hud,
    board: { x: column.x + (colW - boardSize) / 2, y: boardY, size: boardSize, cell },
    hand: { cell: trayCell, slots },
  };
}

/** Index of the tray slot containing (x, y), or -1. */
export function slotAt(layout: Layout, x: number, y: number): number {
  for (const s of layout.hand.slots) {
    if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return s.index;
  }
  return -1;
}
