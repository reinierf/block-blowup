import { describe, expect, it } from 'vitest';
import {
  LAYOUT,
  NO_INSETS,
  computeLayout,
  slotAt,
  type Insets,
  type Rect,
} from '../../src/render/layout';

const VIEWPORTS: { name: string; w: number; h: number; insets: Insets }[] = [
  { name: '360×640 (small Android)', w: 360, h: 640, insets: NO_INSETS },
  {
    name: '390×844 (iPhone 14, notch)',
    w: 390,
    h: 844,
    insets: { top: 47, right: 0, bottom: 34, left: 0 },
  },
  { name: '412×915 (Pixel 7)', w: 412, h: 915, insets: { top: 24, right: 0, bottom: 0, left: 0 } },
  {
    name: '768×1024 (tablet)',
    w: 768,
    h: 1024,
    insets: { top: 24, right: 0, bottom: 20, left: 0 },
  },
  {
    name: '844×390 (phone landscape)',
    w: 844,
    h: 390,
    insets: { top: 0, right: 47, bottom: 21, left: 47 },
  },
  { name: '1440×900 (desktop)', w: 1440, h: 900, insets: NO_INSETS },
];

const inside = (r: Rect, outer: Rect, eps = 1e-6) =>
  r.x >= outer.x - eps &&
  r.y >= outer.y - eps &&
  r.x + r.w <= outer.x + outer.w + eps &&
  r.y + r.h <= outer.y + outer.h + eps;

describe.each(VIEWPORTS)('layout at $name', ({ w, h, insets }) => {
  const l = computeLayout(w, h, insets);
  const board: Rect = { x: l.board.x, y: l.board.y, w: l.board.size, h: l.board.size };

  it('fits the board inside the safe area, with the side gutter', () => {
    expect(l.board.size).toBeGreaterThan(0);
    expect(inside(board, l.safe)).toBe(true);
    expect(l.board.x - l.column.x).toBeGreaterThanOrEqual(LAYOUT.gutter - 1e-6);
    expect(l.board.cell).toBeCloseTo(l.board.size / 8);
  });

  it('keeps the HUD and every tray slot inside the safe area', () => {
    expect(inside(l.hud, l.safe)).toBe(true);
    for (const s of l.hand.slots) expect(inside(s, l.safe)).toBe(true);
  });

  it('stacks HUD, board and tray without overlap', () => {
    expect(l.board.y).toBeGreaterThanOrEqual(l.hud.y + l.hud.h);
    for (const s of l.hand.slots) expect(s.y).toBeGreaterThanOrEqual(l.board.y + l.board.size);
  });

  it('gives tray slots touch targets of at least 44×44 px', () => {
    for (const s of l.hand.slots) {
      expect(s.w).toBeGreaterThanOrEqual(LAYOUT.minTouch);
      expect(s.h).toBeGreaterThanOrEqual(LAYOUT.minTouch);
    }
  });

  it('fits a 5-cell piece in a tray slot', () => {
    const piece = LAYOUT.maxPieceCells * l.hand.cell;
    for (const s of l.hand.slots) {
      expect(piece).toBeLessThanOrEqual(s.w);
      expect(piece).toBeLessThanOrEqual(s.h);
    }
  });

  it('centres the column', () => {
    const left = l.column.x - l.safe.x;
    const right = l.safe.x + l.safe.w - (l.column.x + l.column.w);
    expect(left).toBeCloseTo(right);
  });
});

describe('layout specifics', () => {
  it('portrait phones use the full width minus the gutters', () => {
    const l = computeLayout(390, 844, { top: 47, right: 0, bottom: 34, left: 0 });
    expect(l.board.size).toBe(390 - 2 * LAYOUT.gutter);
  });

  it('caps the column on wide screens', () => {
    const l = computeLayout(1440, 900);
    expect(l.column.w).toBe(LAYOUT.maxColumn);
  });

  it('shrinks the board to the height in landscape', () => {
    const l = computeLayout(844, 390, { top: 0, right: 47, bottom: 21, left: 47 });
    expect(l.board.size).toBeLessThan(390 - LAYOUT.hudHeight);
  });

  it('slotAt hit-tests whole slots, not just the piece cells', () => {
    const l = computeLayout(390, 844);
    for (const s of l.hand.slots) {
      expect(slotAt(l, s.x + 1, s.y + 1)).toBe(s.index);
      expect(slotAt(l, s.x + s.w - 1, s.y + s.h - 1)).toBe(s.index);
    }
    expect(slotAt(l, l.board.x + 5, l.board.y + 5)).toBe(-1);
  });
});
