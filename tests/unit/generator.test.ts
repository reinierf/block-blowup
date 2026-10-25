import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  completesALine,
  fitsAnywhere,
  maxLinesCleared,
  rowsFromBoard,
} from '../../src/game/bitboard';
import {
  ASSIST_HAND_FROM,
  DEAL_NODE_BUDGET,
  FAMILY_WEIGHTS,
  MAX_REDRAWS,
  MERCY_BOOST,
} from '../../src/game/config';
import { difficultyFor } from '../../src/game/difficulty';
import { Generator, shapeWeights, type GeneratorOptions } from '../../src/game/generator';
import { PIECE_COLORS, SHAPES, type ShapeFamily } from '../../src/game/pieces';
import { Mulberry32 } from '../../src/game/rng';
import { canPlaceAll, searchHand } from '../../src/game/solver';
import { boardFrom, shape } from '../helpers/boards';
import { arbBoard } from '../helpers/random-boards';

const EMPTY = rowsFromBoard(boardFrom(Array<string>(8).fill('........')));
const CHECKER = rowsFromBoard(
  boardFrom([
    '.#.#.#.#',
    '#.#.#.#.',
    '.#.#.#.#',
    '#.#.#.#.',
    '.#.#.#.#',
    '#.#.#.#.',
    '.#.#.#.#',
    '#.#.#.#.',
  ]),
);
const ctx = { linesCleared: 0, handsWithoutClear: 0 };
const assistOff: GeneratorOptions = { assistChance: () => ({ p: 0, reason: 'base' }) };
const assistOn: GeneratorOptions = { assistChance: () => ({ p: 1, reason: 'base' }) };

function familyShare(difficulty: number, families: ShapeFamily[]): number {
  const w = shapeWeights(difficulty);
  const total = w.reduce((a, b) => a + b, 0);
  return SHAPES.reduce((a, s, i) => a + (families.includes(s.family) ? w[i]! : 0), 0) / total;
}

describe('shapeWeights', () => {
  it("shares each family's weight equally between its orientations", () => {
    const w = shapeWeights(0);
    const corners = SHAPES.map((s, i) => (s.family === 'corner' ? w[i]! : 0)).filter((x) => x);
    expect(corners).toEqual([1.5, 1.5, 1.5, 1.5]);
    expect(corners.reduce((a, b) => a + b, 0)).toBe(FAMILY_WEIGHTS.corner[0]);
  });

  it('shifts weight from easy to hard pieces as difficulty rises', () => {
    const hard: ShapeFamily[] = ['square3', 'line5', 'bigL', 'SZ'];
    const easy: ShapeFamily[] = ['single', 'line2', 'square2', 'corner'];
    expect(familyShare(1, hard)).toBeGreaterThan(familyShare(0.5, hard));
    expect(familyShare(0.5, hard)).toBeGreaterThan(familyShare(0, hard));
    expect(familyShare(1, easy)).toBeLessThan(familyShare(0, easy));
  });

  it('deals diagonal pieces rarely at every difficulty', () => {
    const diagonals: ShapeFamily[] = ['diag2', 'diag3', 'diag4'];
    for (const d of [0, 0.5, 1]) {
      expect(familyShare(d, diagonals)).toBeGreaterThan(0);
      expect(familyShare(d, diagonals)).toBeLessThan(0.04);
    }
  });

  it('makes the 1×1 single rare early and never dealt at full difficulty', () => {
    const single = SHAPES.findIndex((s) => s.family === 'single');
    const share = (d: number) => {
      const w = shapeWeights(d);
      return w[single]! / w.reduce((a, b) => a + b, 0);
    };
    expect(share(0)).toBeGreaterThan(0);
    expect(share(0)).toBeLessThan(0.05);
    expect(share(0.5)).toBeLessThan(share(0));
    expect(share(1)).toBe(0);
  });

  it('shows up in the dealt pieces', () => {
    const count = (linesCleared: number) => {
      const g = new Generator(new Mulberry32(1).next);
      let hard = 0;
      for (let i = 0; i < 400; i++) {
        hard += g
          .deal(EMPTY, { linesCleared, handsWithoutClear: 0 })
          .shapes.filter((s) => ['square3', 'line5', 'bigL', 'SZ'].includes(s.family)).length;
      }
      return hard;
    };
    expect(count(1000)).toBeGreaterThan(count(0) * 1.8);
  });
});

describe('Generator.deal', () => {
  it('never deals a dead hand (property)', () => {
    fc.assert(
      fc.property(
        arbBoard,
        fc.nat(2 ** 31),
        fc.nat(100),
        fc.nat(4),
        (board, seed, linesCleared, dry) => {
          const rows = rowsFromBoard(board);
          const { shapes } = new Generator(new Mulberry32(seed).next).deal(rows, {
            linesCleared,
            handsWithoutClear: dry,
          });
          expect(shapes).toHaveLength(3);
          expect(shapes.some((s) => fitsAnywhere(rows, s))).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('never deals three identical pieces (property)', () => {
    fc.assert(
      fc.property(arbBoard, fc.nat(2 ** 31), (board, seed) => {
        const g = new Generator(new Mulberry32(seed).next);
        const rows = rowsFromBoard(board);
        for (let i = 0; i < 5; i++) {
          const [a, b, c] = g.deal(rows, ctx).shapes;
          expect(a === b && b === c).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('at difficulty 0 always requires a fully placeable hand, and reports honestly (property)', () => {
    fc.assert(
      fc.property(arbBoard, fc.nat(2 ** 31), (board, seed) => {
        const rows = rowsFromBoard(board);
        const { shapes, info } = new Generator(new Mulberry32(seed).next).deal(rows, ctx);
        expect(info.requireSolvable).toBe(true);
        expect(info.difficulty).toBe(0);
        const truth = canPlaceAll(rows, shapes, 1_000_000).solvable;
        if (info.solvable === true) expect(truth).toBe(true);
        if (info.fallback === 'none') expect(info.solvable).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('sometimes skips the solvability requirement at high difficulty', () => {
    const g = new Generator(new Mulberry32(3).next);
    const deals = Array.from({ length: 300 }, () =>
      g.deal(EMPTY, { linesCleared: 1000, handsWithoutClear: 0 }),
    );
    const skipped = deals.filter((d) => !d.info.requireSolvable).length;
    expect(skipped).toBeGreaterThan(50); // expected ≈ 30% of 300
    expect(skipped).toBeLessThan(130);
    expect(
      deals.filter((d) => !d.info.requireSolvable).every((d) => d.info.solvable === null),
    ).toBe(true);
  });

  it('gives the three pieces three different colours from the palette (property)', () => {
    fc.assert(
      fc.property(fc.nat(2 ** 31), (seed) => {
        const { colors } = new Generator(new Mulberry32(seed).next).deal(EMPTY, ctx);
        expect(colors).toHaveLength(3);
        expect(new Set(colors).size).toBe(3);
        for (const c of colors) expect(PIECE_COLORS).toContain(c);
      }),
    );
  });

  it('uses every colour over time', () => {
    const g = new Generator(new Mulberry32(4).next);
    const seen = new Set(Array.from({ length: 30 }, () => g.deal(EMPTY, ctx).colors).flat());
    expect(seen.size).toBe(PIECE_COLORS.length);
  });

  it('is deterministic per seed', () => {
    const names = (seed: number) => {
      const g = new Generator(new Mulberry32(seed).next);
      return Array.from({ length: 10 }, () => g.deal(EMPTY, ctx).shapes.map((s) => s.name));
    };
    expect(names(11)).toEqual(names(11));
    expect(names(11)).not.toEqual(names(12));
  });

  it('keeps every deal within the node budget (property)', () => {
    fc.assert(
      fc.property(arbBoard, fc.nat(2 ** 31), (board, seed) => {
        const { info } = new Generator(new Mulberry32(seed).next).deal(rowsFromBoard(board), ctx);
        expect(info.solverNodes).toBeLessThanOrEqual(DEAL_NODE_BUDGET);
        expect(info.redraws).toBeLessThanOrEqual(MAX_REDRAWS + 1);
      }),
      { numRuns: 200 },
    );
  });

  describe('fallbacks (RNG pinned to 0: always the first shape, then the second)', () => {
    const shapes = [shape('line2-h'), shape('square2'), shape('single')];
    const zero = () => 0;

    it('swaps in the smallest piece that fits when every hand is dead', () => {
      const { shapes: hand, info } = new Generator(zero, shapes).deal(CHECKER, ctx);
      expect(hand.map((s) => s.name)).toEqual(['single', 'line2-h', 'square2']);
      expect(info).toMatchObject({ fallback: 'swappedSmallest', redraws: MAX_REDRAWS + 1 });
    });

    it('accepts a placeable-but-unsolvable hand when nothing better turns up', () => {
      // line2-h fits in the bottom-right corner; square2 fits nowhere.
      const rows = CHECKER.slice();
      rows[7] = 0b00111111 & 0xff;
      expect(fitsAnywhere(rows, shape('line2-h'))).toBe(true);
      const { shapes: hand, info } = new Generator(zero, shapes).deal(rows, ctx);
      expect(hand.map((s) => s.name)).toEqual(['line2-h', 'line2-h', 'square2']);
      expect(info).toMatchObject({
        fallback: 'acceptedUnsolvable',
        solvable: false,
        redraws: MAX_REDRAWS + 1,
      });
    });
  });
});

describe('mercy rule', () => {
  // Low fill, but row 0 is two cells short at the right edge: only pieces with two adjacent
  // top-row cells that fit there (line2-h, square2, some corners, L's, rect-2x3, S-h)
  // complete a line.
  const nearLine = rowsFromBoard(boardFrom(['######..', ...Array<string>(7).fill('........')]));

  it('does not fire on a calm board', () => {
    const { info } = new Generator(new Mulberry32(1).next).deal(nearLine, ctx);
    expect(info).toMatchObject({ mercy: false, mercyReason: null });
  });

  it('fires after MERCY_HANDS hands without a clear', () => {
    const { info } = new Generator(new Mulberry32(1).next).deal(nearLine, {
      linesCleared: 0,
      handsWithoutClear: 2,
    });
    expect(info).toMatchObject({ mercy: true, mercyReason: 'drought' });
  });

  it('fires on a crowded board', () => {
    const crowded = rowsFromBoard(
      boardFrom([
        '#######.',
        '#######.',
        '#######.',
        '#######.',
        '#######.',
        '#######.',
        '##......',
        '........',
      ]),
    );
    const { info } = new Generator(new Mulberry32(1).next).deal(crowded, ctx);
    expect(info).toMatchObject({ mercy: true, mercyReason: 'fill' });
  });

  it('reports the reason but no boost when no piece could complete a line', () => {
    const { info } = new Generator(new Mulberry32(1).next).deal(EMPTY, {
      linesCleared: 0,
      handsWithoutClear: 5,
    });
    expect(info).toMatchObject({ mercy: false, mercyReason: 'drought' });
  });

  it(`boosts line-completing pieces about ${MERCY_BOOST}×`, () => {
    const share = (handsWithoutClear: number) => {
      // The assist would also deal line-completing pieces: measure the mercy rule alone.
      const g = new Generator(new Mulberry32(9).next, SHAPES, assistOff);
      let completing = 0;
      let total = 0;
      for (let i = 0; i < 600; i++) {
        for (const s of g.deal(nearLine, { linesCleared: 0, handsWithoutClear }).shapes) {
          total++;
          if (completesALine(nearLine, s)) completing++;
        }
      }
      return completing / total;
    };
    const calm = share(0);
    const mercy = share(2);
    expect(calm).toBeLessThan(0.4);
    expect(mercy).toBeGreaterThan(calm * 1.6);
  });
});

describe('assist', () => {
  // Row 0 is two cells short at the right edge (see the mercy rule tests).
  const nearLine = rowsFromBoard(boardFrom(['######..', ...Array<string>(7).fill('........')]));
  // Rows 0 and 1 both two short: square2 (and some others) clear 2 lines, line2-h clears 1.
  const nearTwo = rowsFromBoard(
    boardFrom(['######..', '######..', ...Array<string>(6).fill('........')]),
  );
  const HARD = 1000; // lines cleared at difficulty 1

  it('below ASSIST_HAND_FROM, deals a piece that clears whenever one exists (property)', () => {
    fc.assert(
      fc.property(arbBoard, fc.nat(2 ** 31), fc.nat(30), (board, seed, linesCleared) => {
        expect(difficultyFor(linesCleared)).toBeLessThan(ASSIST_HAND_FROM);
        const rows = rowsFromBoard(board);
        const { shapes, info } = new Generator(new Mulberry32(seed).next, SHAPES, assistOn).deal(
          rows,
          { linesCleared, handsWithoutClear: 0 },
        );
        const weights = shapeWeights(info.difficulty);
        const possible = SHAPES.some((s, i) => weights[i]! > 0 && completesALine(rows, s));
        expect(info.assist).toBe(true);
        expect(info.assistMode).toBe(possible ? 'piece' : 'none');
        if (possible) expect(shapes.some((s) => completesALine(rows, s))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('from ASSIST_HAND_FROM, deals a hand that can clear in some order, or falls back (property)', () => {
    fc.assert(
      fc.property(arbBoard, fc.nat(2 ** 31), (board, seed) => {
        const rows = rowsFromBoard(board);
        const { shapes, info } = new Generator(new Mulberry32(seed).next, SHAPES, assistOn).deal(
          rows,
          { linesCleared: HARD, handsWithoutClear: 0 },
        );
        const goal = { placeAll: info.requireSolvable, clear: true };
        if (info.assistMode === 'hand') {
          expect(searchHand(rows, shapes, 1e9, goal).found).toBe(true);
          expect(info.solvable).toBe(info.requireSolvable ? true : null);
        } else if (info.assistMode === 'pieceFallback') {
          expect(shapes.some((s) => completesALine(rows, s))).toBe(true);
        } else {
          // No dealable piece clears anything (the single isn't dealt at difficulty 1).
          expect(info.assistMode).toBe('none');
          const weights = shapeWeights(1);
          expect(SHAPES.some((s, i) => weights[i]! > 0 && completesALine(rows, s))).toBe(false);
        }
        expect(info.solverNodes).toBeLessThanOrEqual(DEAL_NODE_BUDGET);
      }),
      { numRuns: 200 },
    );
  });

  it('at high difficulty mostly helps with natural hands, not a handed-out piece', () => {
    const g = new Generator(new Mulberry32(5).next, SHAPES, assistOn);
    const modes = Array.from(
      { length: 200 },
      () => g.deal(nearLine, { linesCleared: HARD, handsWithoutClear: 0 }).info.assistMode,
    );
    expect(modes.filter((m) => m === 'hand').length).toBeGreaterThan(150);
    expect(modes.every((m) => m === 'hand' || m === 'pieceFallback')).toBe(true);
  });

  it('never helps when the roll misses', () => {
    const g = new Generator(new Mulberry32(6).next, SHAPES, assistOff);
    for (let i = 0; i < 50; i++) {
      for (const linesCleared of [0, HARD]) {
        expect(g.deal(nearLine, { linesCleared, handsWithoutClear: 0 }).info).toMatchObject({
          assist: false,
          assistMode: 'none',
          assistP: 0,
        });
      }
    }
  });

  it('always consumes the roll: with nothing to help, on and off deal the same hands', () => {
    // Nothing on an empty board clears with one piece, and below ASSIST_HAND_FROM no
    // whole-hand search runs.
    const names = (options: GeneratorOptions) => {
      const g = new Generator(new Mulberry32(7).next, SHAPES, options);
      return Array.from({ length: 30 }, () => g.deal(EMPTY, ctx).shapes.map((s) => s.name));
    };
    expect(names(assistOn)).toEqual(names(assistOff));
  });

  it('puts the helper piece in any slot equally often', () => {
    const g = new Generator(new Mulberry32(8).next, SHAPES, assistOn);
    const slots = [0, 0, 0];
    for (let i = 0; i < 3000; i++) {
      const { shapes } = g.deal(nearLine, ctx);
      const hits = shapes.map((s) => completesALine(nearLine, s));
      // With exactly one clearing piece in the hand, that piece is the helper.
      if (hits.filter(Boolean).length === 1) slots[hits.indexOf(true)]!++;
    }
    const total = slots[0]! + slots[1]! + slots[2]!;
    expect(total).toBeGreaterThan(1000);
    for (const n of slots) expect(n / total).toBeGreaterThan(0.3);
    for (const n of slots) expect(n / total).toBeLessThan(0.37);
  });

  it('favours multi-line helpers by lines ^ generosity at difficulty 0', () => {
    const lines = SHAPES.map((s) => maxLinesCleared(nearTwo, s));
    const w = shapeWeights(0);
    const helper = w.map((x, i) => (lines[i]! > 0 ? x * lines[i]! ** 1.5 : 0));
    const total = helper.reduce((a, b) => a + b, 0);
    const expected = helper.reduce((a, x, i) => a + (lines[i] === 2 ? x : 0), 0) / total;

    const g = new Generator(new Mulberry32(10).next, SHAPES, assistOn);
    let twoLine = 0;
    let seen = 0;
    for (let i = 0; i < 3000; i++) {
      const { shapes } = g.deal(nearTwo, ctx);
      const hits = shapes.filter((s) => lines[s.id]! > 0);
      if (hits.length !== 1) continue;
      seen++;
      if (lines[hits[0]!.id] === 2) twoLine++;
    }
    expect(expected).toBeGreaterThan(0.3);
    expect(twoLine / seen).toBeGreaterThan(expected - 0.05);
    expect(twoLine / seen).toBeLessThan(expected + 0.05);
  });

  it('reports the chance and its reason from the deal context', () => {
    const { info } = new Generator(new Mulberry32(1).next).deal(nearLine, {
      linesCleared: HARD,
      handsWithoutClear: 0,
      combo: 2,
    });
    expect(info.assistP).toBeCloseTo(0.65);
    expect(info.assistReason).toBe('combo');
  });

  it('helps on about pAssist of deals', () => {
    const g = new Generator(new Mulberry32(11).next);
    const deals = Array.from({ length: 1000 }, () => g.deal(nearLine, ctx).info);
    const hit = deals.filter((d) => d.assist).length;
    expect(hit).toBeGreaterThan(650); // expected 700 at difficulty 0
    expect(hit).toBeLessThan(750);
    expect(deals.filter((d) => d.assist).every((d) => d.assistMode === 'piece')).toBe(true);
  });
});
