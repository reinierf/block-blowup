import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  canPlaceRows,
  completesALine,
  filledCount,
  fitsAnywhere,
  placeRows,
  rowsFromBoard,
  shapeMasks,
} from '../../src/game/bitboard';
import { SHAPES } from '../../src/game/pieces';
import { boardFrom, shape } from '../helpers/boards';
import { arbBoard } from '../helpers/random-boards';

describe('bitboard', () => {
  it('converts a board to row masks (bit x = column x)', () => {
    const b = boardFrom(['#......#', ...Array<string>(6).fill('........'), '########']);
    expect(rowsFromBoard(b)).toEqual([0b10000001, 0, 0, 0, 0, 0, 0, 0xff]);
    expect(filledCount(rowsFromBoard(b))).toBe(10);
  });

  it('builds shape masks per shape row', () => {
    expect(shapeMasks(shape('T-down'))).toEqual([0b010, 0b111]);
    expect(shapeMasks(shape('line5-v'))).toEqual([1, 1, 1, 1, 1]);
  });

  it('agrees with Board.canPlace everywhere (property)', () => {
    fc.assert(
      fc.property(arbBoard, fc.constantFrom(...SHAPES), (board, s) => {
        const rows = rowsFromBoard(board);
        for (let oy = -1; oy <= 8; oy++) {
          for (let ox = -1; ox <= 8; ox++) {
            expect(canPlaceRows(rows, s, ox, oy)).toBe(board.canPlace(s, ox, oy));
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('places and clears exactly like Board (property)', () => {
    fc.assert(
      fc.property(arbBoard, fc.constantFrom(...SHAPES), (board, s) => {
        const rows = rowsFromBoard(board);
        for (let oy = 0; oy + s.height <= 8; oy++) {
          for (let ox = 0; ox + s.width <= 8; ox++) {
            if (!board.canPlace(s, ox, oy)) continue;
            const copy = boardFrom(board.grid.map((r) => r.map((c) => (c ? '#' : '.')).join('')));
            copy.place(s, ox, oy, 'p');
            const { rows: fr, cols: fc_ } = copy.fullLines();
            copy.clearLines(fr, fc_);
            const result = placeRows(rows, s, ox, oy);
            expect(result.rows).toEqual(rowsFromBoard(copy));
            expect(result.lines).toBe(fr.length + fc_.length);
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it('fitsAnywhere / completesALine', () => {
    const rows = rowsFromBoard(
      boardFrom([
        '.#######',
        '########'.replace(/#$/, '.'),
        '#.#.#.#.',
        '.#.#.#.#',
        '#.#.#.#.',
        '.#.#.#.#',
        '#.#.#.#.',
        '.#.#.#.#',
      ]),
    );
    expect(fitsAnywhere(rows, shape('single'))).toBe(true);
    expect(fitsAnywhere(rows, shape('square2'))).toBe(false);
    expect(completesALine(rows, shape('single'))).toBe(true);
    expect(completesALine(rows, shape('line2-h'))).toBe(false);
  });
});
