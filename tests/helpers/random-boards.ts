import fc from 'fast-check';
import { Board } from '../../src/game/board';

/**
 * Arbitrary realistic board: each cell filled with probability `density`, then full rows
 * and columns cleared (a real board never keeps a full line after a turn).
 */
export const arbBoard = fc
  .record({
    density: fc.double({ min: 0, max: 0.85, noNaN: true }),
    bits: fc.array(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), {
      minLength: 64,
      maxLength: 64,
    }),
  })
  .map(({ density, bits }) => {
    const board = new Board(8);
    bits.forEach((b, i) => {
      if (b < density) board.grid[Math.floor(i / 8)]![i % 8] = 'c';
    });
    const { rows, cols } = board.fullLines();
    board.clearLines(rows, cols);
    return board;
  });
