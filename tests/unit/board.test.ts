import { describe, expect, it } from 'vitest';
import { Board } from '../../src/game/board';
import { boardFrom, boardToAscii, shape } from '../helpers/boards';

describe('Board', () => {
  it('starts empty, 8×8 by default', () => {
    const b = new Board();
    expect(b.size).toBe(8);
    expect(b.grid).toHaveLength(8);
    expect(b.grid.every((r) => r.length === 8)).toBe(true);
    expect(b.isEmpty()).toBe(true);
  });

  it('reports bounds and free cells', () => {
    const b = boardFrom(['#.', '..']);
    expect(b.inBounds(0, 0)).toBe(true);
    expect(b.inBounds(1, 1)).toBe(true);
    expect(b.inBounds(-1, 0)).toBe(false);
    expect(b.inBounds(0, 2)).toBe(false);
    expect(b.isFree(0, 0)).toBe(false);
    expect(b.isFree(1, 0)).toBe(true);
    expect(b.isFree(2, 0)).toBe(false); // out of bounds is never free
    expect(b.isEmpty()).toBe(false);
  });

  describe('canPlace', () => {
    const b = boardFrom([
      '........',
      '.#......',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]);

    it('accepts a placement on empty in-bounds cells', () => {
      expect(b.canPlace(shape('square2'), 2, 0)).toBe(true);
      expect(b.canPlace(shape('line5-h'), 3, 7)).toBe(true);
    });

    it('rejects overlap with a filled cell', () => {
      expect(b.canPlace(shape('square2'), 0, 0)).toBe(false);
      expect(b.canPlace(shape('single'), 1, 1)).toBe(false);
    });

    it('allows a shape whose empty bounding-box cell covers a filled cell', () => {
      // corner-br = ['.X', 'XX']: its top-left box cell is empty.
      expect(b.canPlace(shape('corner-br'), 1, 1)).toBe(true);
    });

    it('rejects placements that hang off any edge', () => {
      expect(b.canPlace(shape('line5-h'), 4, 0)).toBe(false);
      expect(b.canPlace(shape('line5-v'), 0, 4)).toBe(false);
      expect(b.canPlace(shape('single'), -1, 0)).toBe(false);
      expect(b.canPlace(shape('single'), 0, -1)).toBe(false);
    });
  });

  it('place() writes the value into every shape cell', () => {
    const b = new Board(4);
    b.place(shape('T-down'), 1, 1, 'red');
    expect(boardToAscii(b)).toEqual(['....', '..#.', '.###', '....']);
    expect(b.grid[1]![2]).toBe('red');
  });

  describe('fullLines / clearLines', () => {
    it('finds no lines on a partial board', () => {
      expect(boardFrom(['###.', '....', '#...', '#...']).fullLines()).toEqual({
        rows: [],
        cols: [],
      });
    });

    it('finds full rows and full columns together', () => {
      const b = boardFrom(['####', '#..#', '####', '#..#']);
      expect(b.fullLines()).toEqual({ rows: [0, 2], cols: [0, 3] });
    });

    it('clears a crossing row and column, counting the shared cell once', () => {
      const b = boardFrom(['#...', '####', '#...', '#..#']);
      const { rows, cols } = b.fullLines();
      expect(rows).toEqual([1]);
      expect(cols).toEqual([0]);
      expect(b.clearLines(rows, cols)).toBe(4 + 4 - 1);
      expect(boardToAscii(b)).toEqual(['....', '....', '....', '...#']);
    });

    it('clearing an empty line clears nothing', () => {
      const b = new Board(4);
      expect(b.clearLines([0], [1])).toBe(0);
    });

    it('reset() empties the board', () => {
      const b = boardFrom(['##', '##']);
      b.reset();
      expect(b.isEmpty()).toBe(true);
    });
  });
});
