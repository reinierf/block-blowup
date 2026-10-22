import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SHAPES } from '../../src/game/pieces';
import { Game } from '../../src/game/state';
import { lcg } from '../../src/sim/lcg';
import { boardFrom, boardToAscii, shape } from '../helpers/boards';
import { arbBoard } from '../helpers/random-boards';

const EMPTY = Array<string>(8).fill('........');

describe('Board.previewLines', () => {
  it('reports nothing for a placement that completes no line', () => {
    expect(boardFrom(EMPTY).previewLines(shape('square2'), 3, 3)).toEqual({
      rows: [],
      cols: [],
      cells: [],
    });
  });

  it('returns null for an illegal placement', () => {
    const b = boardFrom(['#.......', ...EMPTY.slice(1)]);
    expect(b.previewLines(shape('square2'), 0, 0)).toBeNull();
    expect(b.previewLines(shape('line5-h'), 4, 3)).toBeNull();
  });

  it('finds a completed row and lists its cells', () => {
    const b = boardFrom([...EMPTY.slice(0, 7), '##..####']);
    const p = b.previewLines(shape('line2-h'), 2, 7)!;
    expect(p.rows).toEqual([7]);
    expect(p.cols).toEqual([]);
    expect(p.cells).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((x) => [x, 7]));
  });

  it('handles a row and a column crossing, listing the shared cell once', () => {
    const b = boardFrom([
      '#.......',
      '#.......',
      '#.......',
      '#.......',
      '#.......',
      '#.......',
      '#.......',
      '.#######',
    ]);
    const p = b.previewLines(shape('single'), 0, 7)!;
    expect(p.rows).toEqual([7]);
    expect(p.cols).toEqual([0]);
    expect(p.cells).toHaveLength(15);
    expect(new Set(p.cells.map(([x, y]) => `${x},${y}`)).size).toBe(15);
  });

  it('finds several rows and columns at once', () => {
    const b = boardFrom([
      '...#####',
      '...#####',
      '...#####',
      '###.....',
      '###.....',
      '###.....',
      '###.....',
      '###.....',
    ]);
    const p = b.previewLines(shape('square3'), 0, 0)!;
    expect(p.rows).toEqual([0, 1, 2]);
    expect(p.cols).toEqual([0, 1, 2]);
    expect(p.cells).toHaveLength(64 - 25);
  });

  it('does not change the board', () => {
    const b = boardFrom([...EMPTY.slice(0, 7), '##..####']);
    const before = boardToAscii(b);
    b.previewLines(shape('line2-h'), 2, 7);
    expect(boardToAscii(b)).toEqual(before);
  });

  it('predicts exactly the lines placing would clear (property)', () => {
    fc.assert(
      fc.property(arbBoard, fc.constantFrom(...SHAPES), (board, s) => {
        for (let oy = 0; oy + s.height <= 8; oy++) {
          for (let ox = 0; ox + s.width <= 8; ox++) {
            const preview = board.previewLines(s, ox, oy);
            if (!board.canPlace(s, ox, oy)) {
              expect(preview).toBeNull();
              continue;
            }
            const copy = boardFrom(boardToAscii(board));
            copy.place(s, ox, oy, 'p');
            expect({ rows: preview!.rows, cols: preview!.cols }).toEqual(copy.fullLines());
          }
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe('Game.previewAt / pieceFits', () => {
  it('previews a hand piece and reports whether each piece fits anywhere', () => {
    const g = new Game({ rng: lcg(1) });
    g.board.grid = boardFrom([...EMPTY.slice(0, 7), '#######.']).grid;
    g.hand = [
      { uid: 1, shape: shape('single'), color: 'red' },
      { uid: 2, shape: shape('square3'), color: 'blue' },
      null,
    ];
    expect(g.previewAt(0, 7, 7)!.rows).toEqual([7]);
    expect(g.previewAt(2, 0, 0)).toBeNull();
    expect(g.pieceFits(0)).toBe(true);
    expect(g.pieceFits(2)).toBe(false);

    g.board.grid = boardFrom([
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
    ]).grid;
    expect(g.pieceFits(0)).toBe(true);
    expect(g.pieceFits(1)).toBe(false);
  });
});
