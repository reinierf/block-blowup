import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canPlaceRows, placeRows, rowsFromBoard, type Rows } from '../../src/game/bitboard';
import { SHAPES, type Shape } from '../../src/game/pieces';
import { canPlaceAll, searchHand, type HandGoal } from '../../src/game/solver';
import { boardFrom, shape } from '../helpers/boards';
import { arbBoard } from '../helpers/random-boards';

const rows = (ascii: string[]) => rowsFromBoard(boardFrom(ascii));
const shapes = (...names: string[]) => names.map(shape);
const BIG = 100_000;

describe('canPlaceAll', () => {
  it('an empty board takes any hand', () => {
    const r = canPlaceAll(
      rows(Array<string>(8).fill('........')),
      shapes('square3', 'square3', 'line5-h'),
      BIG,
    );
    expect(r).toMatchObject({ solvable: true, exhausted: false });
  });

  it('an empty hand is trivially solvable', () => {
    expect(canPlaceAll(rows(Array<string>(8).fill('#.......')), [], BIG).solvable).toBe(true);
  });

  it('finds a hand that only fits because a clear in between makes room', () => {
    // No horizontal gap is longer than 2, so line3-h fits nowhere at first. line2-h at
    // (0, 7) completes row 7, which clears and leaves room for line3-h. The hand lists
    // line3-h first, so the solver has to try the other order.
    const board = [
      '#######.',
      '.#######',
      '.#######',
      '.#######',
      '.#######',
      '.#######',
      '.#######',
      '..######',
    ];
    expect(canPlaceAll(rows(board), shapes('line3-h'), BIG).solvable).toBe(false);
    expect(canPlaceAll(rows(board), shapes('line3-h', 'line2-h'), BIG).solvable).toBe(true);
  });

  it('reports an unsolvable hand when the pieces cannot all fit', () => {
    const board = [
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
    ];
    expect(canPlaceAll(rows(board), shapes('single', 'single', 'line2-h'), BIG)).toMatchObject({
      solvable: false,
      exhausted: false,
    });
    expect(canPlaceAll(rows(board), shapes('single', 'single', 'single'), BIG).solvable).toBe(true);
  });

  it('stops at the node budget and reports it', () => {
    const board = [
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
    ];
    const r = canPlaceAll(rows(board), shapes('single', 'single', 'line2-h'), 10);
    expect(r).toEqual({ solvable: false, nodes: 10, exhausted: true });
  });

  it('tries identical pieces in one order only', () => {
    const empty = rows(Array<string>(8).fill('........'));
    const twice = canPlaceAll(empty, shapes('single', 'single'), BIG);
    expect(twice.solvable).toBe(true);
    expect(twice.nodes).toBe(2);
  });
});

/** Exhaustive reference search on row arrays (no packing, no pruning, no budget). */
function bruteForce(rows: Rows, hand: readonly Shape[], goal: HandGoal, cleared = false): boolean {
  if ((!goal.clear || cleared) && (!goal.placeAll || hand.length === 0)) return true;
  for (let i = 0; i < hand.length; i++) {
    const s = hand[i]!;
    const rest = hand.filter((_, j) => j !== i);
    for (let oy = 0; oy + s.height <= 8; oy++) {
      for (let ox = 0; ox + s.width <= 8; ox++) {
        if (!canPlaceRows(rows, s, ox, oy)) continue;
        const next = placeRows(rows, s, ox, oy);
        if (bruteForce(next.rows, rest, goal, cleared || next.lines > 0)) return true;
      }
    }
  }
  return false;
}

describe('searchHand', () => {
  const nearRow = rows(['######..', ...Array<string>(7).fill('........')]);

  it('with no goal succeeds without searching', () => {
    const r = searchHand(nearRow, shapes('square3'), BIG, { placeAll: false, clear: false });
    expect(r).toEqual({ found: true, nodes: 0, exhausted: false });
  });

  it('finds a clear made by one piece, or set up by one piece for another', () => {
    const clear = { placeAll: false, clear: true };
    expect(searchHand(nearRow, shapes('line2-h'), BIG, clear).found).toBe(true);
    expect(searchHand(nearRow, shapes('single'), BIG, clear).found).toBe(false);
    // Neither single completes row 0 alone; together they do.
    expect(searchHand(nearRow, shapes('single', 'single'), BIG, clear).found).toBe(true);
    // Stacked or side by side, two 3×3 squares never fill 8 cells of a row or column.
    expect(searchHand(nearRow, shapes('square3', 'square3'), BIG, clear).found).toBe(false);
  });

  it('with placeAll and clear, needs both in one line of play', () => {
    // A 2×2 gap top right over a checkerboard. square2 fills the gap and clears rows 0 and
    // 1; only then does line5-h fit. line2-v and a single fit but clear nothing.
    const board = rows([
      '######..',
      '######..',
      ...Array.from({ length: 6 }, (_, y) => (y % 2 ? '.#.#.#.#' : '#.#.#.#.')),
    ]);
    const both = { placeAll: true, clear: true };
    expect(searchHand(board, shapes('line5-h', 'square2'), BIG, both).found).toBe(true);
    expect(searchHand(board, shapes('line5-h', 'line2-v'), BIG, both).found).toBe(false);
    expect(searchHand(board, shapes('single'), BIG, both).found).toBe(false);
    const placeOnly = { placeAll: true, clear: false };
    expect(searchHand(board, shapes('single'), BIG, placeOnly).found).toBe(true);
  });

  it('agrees with an exhaustive search for every goal (property)', () => {
    fc.assert(
      fc.property(
        arbBoard,
        fc.array(fc.constantFrom(...SHAPES), { minLength: 1, maxLength: 2 }),
        fc.boolean(),
        fc.boolean(),
        (board, hand, placeAll, clear) => {
          const r = rowsFromBoard(board);
          const goal = { placeAll, clear };
          expect(searchHand(r, hand, 1e9, goal).found).toBe(bruteForce(r, hand, goal));
        },
      ),
      { numRuns: 300 },
    );
  });
});
