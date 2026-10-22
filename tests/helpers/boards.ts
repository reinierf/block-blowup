import { Board } from '../../src/game/board';
import { SHAPES, type Shape } from '../../src/game/pieces';

/** Build a board from ASCII rows: '.' = empty, '#' = filled with color 'c', any other char = that color. */
export function boardFrom(rows: string[]): Board {
  const board = new Board(rows.length);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      board.grid[y]![x] = ch === '.' ? null : ch === '#' ? 'c' : ch;
    });
  });
  return board;
}

/** Render a board back to ASCII ('#' filled, '.' empty). */
export function boardToAscii(board: Board): string[] {
  return board.grid.map((row) => row.map((c) => (c === null ? '.' : '#')).join(''));
}

export function shape(name: string): Shape {
  const s = SHAPES.find((sh) => sh.name === name);
  if (!s) throw new Error(`Unknown shape ${name}`);
  return s;
}
