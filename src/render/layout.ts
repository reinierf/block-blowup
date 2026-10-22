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
  /** Extra space reserved between the HUD and the board, for the large score. */
  scoreHeight: 56,
  /** Minimum gap between HUD and board, and between board and tray. */
  gap: 12,
  /** Tray blocks are at least this fraction of a board cell (room is reserved for it). */
  trayScale: 0.5,
  /** Tray blocks grow up to this fraction when the hand's largest piece still fits a slot. */
  trayScaleMax: 0.65,
  /** The longest piece is 5 cells; slots must fit it at tray scale. */
  maxPieceCells: 5,
  /** Padding inside a tray slot around the piece. */
  slotPadding: 8,
  /** Minimum touch target (CSS px). */
  minTouch: 44,
  /** Share of spare vertical space placed above the board (the rest goes to the tray). */
  spareAboveBoard: 0.35,
  /**
   * How much closer to the board the tray pieces sit than the slot centre: their centre
   * line moves this fraction of the way from the slot centre toward the board's bottom.
   * Never so far that a 5-cell piece would leave its slot.
   */
  trayPull: 0.4,
} as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HandSlot extends Rect {
  index: number;
  /** Where the piece is centred: the slot's horizontal centre, pulled up toward the board. */
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
  /** From the viewport top to the board top; the score is centred in it. */
  score: Rect;
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

  // Board size: limited by width (gutters) and by height (HUD, score band, gaps, and a
  // tray tall enough for a 5-cell piece at tray scale).
  const traySlotPad = 2 * L.slotPadding;
  const trayPerBoard = (L.maxPieceCells * L.trayScale) / 8; // tray piece height per board px
  const availH = column.h - L.hudHeight - L.scoreHeight - 2 * L.gap - traySlotPad;
  const byWidth = colW - 2 * L.gutter;
  const byHeight = availH / (1 + trayPerBoard);
  const boardSize = Math.max(0, Math.floor(Math.min(byWidth, byHeight)));
  const cell = boardSize / 8;

  const slotW = colW / 3;
  const trayCell = Math.min(cell * L.trayScale, (slotW - traySlotPad) / L.maxPieceCells);
  const minTrayH = Math.max(L.maxPieceCells * trayCell + traySlotPad, L.minTouch);

  const spare = Math.max(0, availH + traySlotPad - boardSize - minTrayH);
  const boardY = hud.y + hud.h + L.gap + L.scoreHeight + spare * L.spareAboveBoard;
  const score: Rect = { x: column.x, y: 0, w: colW, h: boardY };
  const trayY = boardY + boardSize + L.gap;
  const trayH = column.y + column.h - trayY;
  const boardBottom = boardY + boardSize;
  const pieceY = Math.max(
    trayY + minTrayH / 2,
    boardBottom + (L.gap + trayH / 2) * (1 - L.trayPull),
  );

  const slots = [0, 1, 2].map((index): HandSlot => ({
    index,
    x: column.x + index * slotW,
    y: trayY,
    w: slotW,
    h: trayH,
    cx: column.x + (index + 0.5) * slotW,
    cy: pieceY,
  }));

  return {
    width,
    height,
    safe,
    column,
    hud,
    score,
    board: { x: column.x + (colW - boardSize) / 2, y: boardY, size: boardSize, cell },
    hand: { cell: trayCell, slots },
  };
}

/**
 * Tray cell size for a hand: up to `trayScaleMax` of a board cell, shrunk so the hand's
 * widest and tallest pieces fit a slot around its piece centre, never below `hand.cell`
 * (the size the layout reserves room for). One size for the whole hand.
 */
export function trayCellFor(
  layout: Layout,
  shapes: readonly { width: number; height: number }[],
): number {
  const s = layout.hand.slots[0]!;
  const roomW = s.w - 2 * LAYOUT.slotPadding;
  const roomH = 2 * (Math.min(s.cy - s.y, s.y + s.h - s.cy) - LAYOUT.slotPadding);
  let cell = layout.board.cell * LAYOUT.trayScaleMax;
  for (const p of shapes) cell = Math.min(cell, roomW / p.width, roomH / p.height);
  return Math.max(layout.hand.cell, cell);
}

/** Index of the tray slot containing (x, y), or -1. */
export function slotAt(layout: Layout, x: number, y: number): number {
  for (const s of layout.hand.slots) {
    if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return s.index;
  }
  return -1;
}
