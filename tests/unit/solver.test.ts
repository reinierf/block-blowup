import { describe, expect, it } from 'vitest';
import { rowsFromBoard } from '../../src/game/bitboard';
import { canPlaceAll } from '../../src/game/solver';
import { boardFrom, shape } from '../helpers/boards';

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
