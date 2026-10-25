import { describe, expect, it } from 'vitest';
import {
  LAYOUT,
  NO_INSETS,
  computeLayout,
  fitScale,
  slotAt,
  trayCellFor,
  type HandSlot,
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
    expect(l.board.y).toBeGreaterThanOrEqual(l.hud.y + l.hud.h + LAYOUT.scoreHeight);
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

  it('puts the score band between the HUD and the board, centred on the board', () => {
    expect(l.score.y).toBeCloseTo(l.hud.y + l.hud.h);
    expect(l.score.y + l.score.h).toBeCloseTo(l.board.y);
    expect(l.score.x + l.score.w / 2).toBeCloseTo(l.board.x + l.board.size / 2);
  });

  it('leaves room for the 62 px score without shrinking it', () => {
    expect(l.score.h).toBeGreaterThanOrEqual(62);
  });

  it('keeps a 5-cell piece inside its slot, centred where the tray draws it', () => {
    const half = (LAYOUT.maxPieceCells * l.hand.cell) / 2;
    for (const s of l.hand.slots) {
      expect(s.cy - half).toBeGreaterThanOrEqual(s.y - 1e-6);
      expect(s.cy + half).toBeLessThanOrEqual(s.y + s.h + 1e-6);
    }
  });

  it('sizes every hand so its pieces fit their slots, between the min and max tray scale', () => {
    const hands = [
      [{ width: 1, height: 1 }],
      [
        { width: 2, height: 2 },
        { width: 3, height: 1 },
      ],
      [{ width: 3, height: 3 }],
      [
        { width: 5, height: 1 },
        { width: 1, height: 1 },
      ],
      [{ width: 1, height: 5 }],
    ];
    for (const hand of hands) {
      const c = trayCellFor(l, hand);
      expect(c).toBeGreaterThanOrEqual(l.hand.cell);
      expect(c).toBeLessThanOrEqual(l.board.cell * LAYOUT.trayScaleMax + 1e-9);
      for (const p of hand) {
        for (const s of l.hand.slots) {
          expect(p.width * c).toBeLessThanOrEqual(s.w + 1e-6);
          expect(s.cy - (p.height * c) / 2).toBeGreaterThanOrEqual(s.y - 1e-6);
          expect(s.cy + (p.height * c) / 2).toBeLessThanOrEqual(s.y + s.h + 1e-6);
        }
      }
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

  it('pulls the tray pieces toward the board on a tall phone', () => {
    // Pixel 7: tall enough that the 5-cell limit doesn't cap the pull (it does on an iPhone 14).
    const l = computeLayout(412, 915, { top: 24, right: 0, bottom: 0, left: 0 });
    const boardBottom = l.board.y + l.board.size;
    for (const s of l.hand.slots) {
      const centred = s.y + s.h / 2;
      expect(s.cy - boardBottom).toBeCloseTo((centred - boardBottom) * (1 - LAYOUT.trayPull));
    }
  });

  it('grows small hands by 30% on a phone, and shrinks a hand with a 5-long piece', () => {
    const l = computeLayout(390, 844, { top: 47, right: 0, bottom: 34, left: 0 });
    const small = trayCellFor(l, [
      { width: 3, height: 2 },
      { width: 2, height: 2 },
    ]);
    expect(small).toBeCloseTo(l.board.cell * LAYOUT.trayScaleMax);
    expect(small / l.hand.cell).toBeGreaterThan(1.25);
    const long = trayCellFor(l, [
      { width: 5, height: 1 },
      { width: 2, height: 2 },
    ]);
    expect(long).toBeLessThan(small);
    expect(long).toBeGreaterThanOrEqual(l.hand.cell);
  });

  it('fits the score inside its band whatever its size, never enlarging it', () => {
    // Short phone, no spare height: the tightest band (Fairphone-like, browser bars shown).
    const l = computeLayout(360, 600);
    // The minimum band, give or take the board's whole-pixel rounding.
    expect(l.score.h).toBeGreaterThanOrEqual(LAYOUT.scoreHeight + LAYOUT.gap);
    expect(l.score.h).toBeLessThan(LAYOUT.scoreHeight + LAYOUT.gap + 2);
    // At least 17 px between the 62 px score and the board, even on the tightest layout.
    expect((l.score.h - 62) / 2).toBeGreaterThanOrEqual(17);
    expect(fitScale(100, 62, l.score)).toBe(1);
    // Text scaling at 130%: 62 px renders as ~81 px and must shrink back into the band.
    const k = fitScale(120, 81, l.score);
    expect(81 * k).toBeLessThanOrEqual(l.score.h + 1e-9);
    expect(l.score.y + (l.score.h + 81 * k) / 2).toBeLessThanOrEqual(l.board.y + 1e-9);
    // A very long score is limited by the width instead.
    expect(400 * fitScale(400, 62, l.score)).toBeLessThanOrEqual(l.score.w + 1e-9);
    expect(fitScale(0, 0, l.score)).toBe(1);
  });

  it('caps the column on wide screens', () => {
    const l = computeLayout(1440, 900);
    expect(l.column.w).toBe(LAYOUT.maxColumn);
  });

  it('shrinks the board to the height in landscape', () => {
    const l = computeLayout(844, 390, { top: 0, right: 47, bottom: 21, left: 47 });
    expect(l.board.size).toBeLessThan(390 - LAYOUT.hudHeight - LAYOUT.scoreHeight);
  });

  it('slotAt hit-tests whole slots, not just the piece cells', () => {
    const l = computeLayout(390, 844);
    for (const s of l.hand.slots) {
      expect(slotAt(l, s.x + 1, s.y + 1)).toBe(s.index);
      expect(slotAt(l, s.x + s.w - 1, s.y + s.h - 1)).toBe(s.index);
    }
    expect(slotAt(l, l.board.x + 5, l.board.y + 5)).toBe(-1);
  });

  it('slotAt extends the tray from the board bottom to the screen edges', () => {
    const l = computeLayout(844, 390, { top: 0, right: 47, bottom: 21, left: 47 });
    const boardBottom = l.board.y + l.board.size;
    expect(slotAt(l, l.hand.slots[1]!.cx, boardBottom)).toBe(1);
    expect(slotAt(l, l.hand.slots[1]!.cx, boardBottom - 1)).toBe(-1);
    expect(slotAt(l, 0, l.height - 1)).toBe(0); // left of the column, in the inset
    expect(slotAt(l, l.width - 1, l.height - 1)).toBe(2);
    expect(slotAt(l, l.width - 1, l.height)).toBe(-1);
  });

  it("slotAt shares an empty slot's area between its neighbours", () => {
    const l = computeLayout(390, 844);
    const [a, b, c] = l.hand.slots as [HandSlot, HandSlot, HandSlot];
    const y = b.cy;
    const mid = (a.cx + c.cx) / 2;
    expect(slotAt(l, b.cx - 1, y, [true, false, true])).toBe(0);
    expect(slotAt(l, mid - 1, y, [true, false, true])).toBe(0);
    expect(slotAt(l, mid + 1, y, [true, false, true])).toBe(2);
    expect(slotAt(l, c.x + 1, y, [true, true, false])).toBe(1);
    expect(slotAt(l, a.x + 1, y, [false, true, true])).toBe(1);
  });

  it('slotAt gives a lone piece the whole tray, and nothing when the hand is empty', () => {
    const l = computeLayout(390, 844);
    const y = l.hand.slots[0]!.cy;
    for (const x of [0, l.width / 2, l.width - 1]) {
      expect(slotAt(l, x, y, [false, false, true])).toBe(2);
      expect(slotAt(l, x, y, [true, false, false])).toBe(0);
      expect(slotAt(l, x, y, [false, false, false])).toBe(-1);
    }
  });
});
