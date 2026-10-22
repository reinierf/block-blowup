import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { completesALine, fitsAnywhere, rowsFromBoard } from '../../src/game/bitboard';
import { DEAL_NODE_BUDGET, FAMILY_WEIGHTS, MAX_REDRAWS, MERCY_BOOST } from '../../src/game/config';
import { Generator, shapeWeights } from '../../src/game/generator';
import { PIECE_COLORS, SHAPES, type ShapeFamily } from '../../src/game/pieces';
import { Mulberry32 } from '../../src/game/rng';
import { canPlaceAll } from '../../src/game/solver';
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
const ctx = { score: 0, handsWithoutClear: 0 };

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

  it('shows up in the dealt pieces', () => {
    const count = (score: number) => {
      const g = new Generator(new Mulberry32(1).next);
      let hard = 0;
      for (let i = 0; i < 400; i++) {
        hard += g
          .deal(EMPTY, { score, handsWithoutClear: 0 })
          .shapes.filter((s) => ['square3', 'line5', 'bigL', 'SZ'].includes(s.family)).length;
      }
      return hard;
    };
    expect(count(100_000)).toBeGreaterThan(count(0) * 1.8);
  });
});

describe('Generator.deal', () => {
  it('never deals a dead hand (property)', () => {
    fc.assert(
      fc.property(
        arbBoard,
        fc.nat(2 ** 31),
        fc.nat(10_000),
        fc.nat(4),
        (board, seed, score, dry) => {
          const rows = rowsFromBoard(board);
          const { shapes } = new Generator(new Mulberry32(seed).next).deal(rows, {
            score,
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
      g.deal(EMPTY, { score: 1e6, handsWithoutClear: 0 }),
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
      score: 0,
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
      score: 0,
      handsWithoutClear: 5,
    });
    expect(info).toMatchObject({ mercy: false, mercyReason: 'drought' });
  });

  it(`boosts line-completing pieces about ${MERCY_BOOST}×`, () => {
    const share = (handsWithoutClear: number) => {
      const g = new Generator(new Mulberry32(9).next);
      let completing = 0;
      let total = 0;
      for (let i = 0; i < 600; i++) {
        for (const s of g.deal(nearLine, { score: 0, handsWithoutClear }).shapes) {
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
