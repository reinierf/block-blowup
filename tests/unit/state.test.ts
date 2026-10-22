import { describe, expect, it } from 'vitest';
import { Game, GameStatus } from '../../src/game/state';
import { lcg } from '../../src/sim/lcg';
import { boardToAscii, shape } from '../helpers/boards';

/** A game whose board and hand are set by hand. Hand entries are shape names or null. */
function setup(rows: string[], hand: (string | null)[]): Game {
  const game = new Game({ rng: lcg(1) });
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      game.board.grid[y]![x] = ch === '.' ? null : 'c';
    });
  });
  game.hand = hand.map((name, i) =>
    name === null ? null : { uid: 1000 + i, shape: shape(name), color: `color${i}` },
  );
  return game;
}

const EMPTY = Array<string>(8).fill('........');

/** Bottom row full except the first `gap` cells. */
function bottomRowGap(gap: number): string[] {
  return [...EMPTY.slice(0, 7), '.'.repeat(gap) + '#'.repeat(8 - gap)];
}

describe('Game: new game', () => {
  it('starts PLAYING on an empty board with a full hand and zeroed counters', () => {
    const g = new Game({ rng: lcg(5) });
    expect(g.status).toBe(GameStatus.PLAYING);
    expect(g.board.isEmpty()).toBe(true);
    expect(g.hand.every((p) => p !== null)).toBe(true);
    expect([g.score, g.combo, g.bestCombo]).toEqual([0, 0, 0]);
  });

  it('colours each hand piece by its shape id and gives each a unique uid', () => {
    const g = new Game({ rng: lcg(5) });
    const uids = g.hand.map((p) => p!.uid);
    expect(new Set(uids).size).toBe(3);
  });

  it('reset() starts over', () => {
    const g = setup(bottomRowGap(1), ['single', 'single', 'single']);
    g.placeAt(0, 0, 7);
    expect(g.score).toBeGreaterThan(0);
    g.reset();
    expect(g.board.isEmpty()).toBe(true);
    expect([g.score, g.combo, g.bestCombo]).toEqual([0, 0, 0]);
    expect(g.status).toBe(GameStatus.PLAYING);
  });
});

describe('Game: placement', () => {
  it('rejects illegal placements and leaves state untouched', () => {
    const g = setup(['#.......', ...EMPTY.slice(1)], ['square2', null, 'single']);
    expect(g.canPlace(0, 0, 0)).toBe(false);
    expect(g.placeAt(0, 0, 0)).toBeNull(); // overlap
    expect(g.placeAt(0, 7, 0)).toBeNull(); // off the edge
    expect(g.placeAt(1, 3, 3)).toBeNull(); // empty slot
    expect(g.canPlace(1, 3, 3)).toBe(false);
    expect(g.score).toBe(0);
    expect(g.hand[0]).not.toBeNull();
  });

  it('places a piece, scores its cells and empties its slot', () => {
    const g = setup(EMPTY, ['T-up', 'single', 'single']);
    expect(g.canPlace(0, 2, 3)).toBe(true);
    const r = g.placeAt(0, 2, 3)!;
    expect(r).toEqual({
      placedCells: [
        [2, 3],
        [3, 3],
        [4, 3],
        [3, 4],
      ],
      clearedCells: [],
      rows: [],
      cols: [],
      lines: 0,
      combo: 0,
      points: 4,
      gameOver: false,
    });
    expect(g.score).toBe(4);
    expect(g.hand[0]).toBeNull();
    expect(g.board.grid[3]![2]).toBe('color0');
  });

  it('clears a line and reports the cleared cells with their colours', () => {
    const g = setup(bottomRowGap(2), ['line2-h', 'single', 'single']);
    const r = g.placeAt(0, 0, 7)!;
    expect(r.rows).toEqual([7]);
    expect(r.cols).toEqual([]);
    expect(r.lines).toBe(1);
    expect(r.combo).toBe(1);
    expect(r.points).toBe(2 + 10);
    expect(r.clearedCells).toHaveLength(8);
    expect(r.clearedCells.slice(0, 3)).toEqual([
      { x: 0, y: 7, color: 'color0' },
      { x: 1, y: 7, color: 'color0' },
      { x: 2, y: 7, color: 'c' },
    ]);
    expect(g.board.isEmpty()).toBe(true);
  });

  it('clears a row and a column together, sharing the crossing cell', () => {
    const rows = [
      '#.......',
      '#.......',
      '#.......',
      '#.......',
      '#.......',
      '#.......',
      '#.......',
      '.#######',
    ];
    const g = setup(rows, ['single', 'single', 'single']);
    const r = g.placeAt(0, 0, 7)!;
    expect(r.rows).toEqual([7]);
    expect(r.cols).toEqual([0]);
    expect(r.lines).toBe(2);
    expect(r.clearedCells).toHaveLength(15);
    expect(r.points).toBe(1 + 40);
    expect(g.board.isEmpty()).toBe(true);
  });

  it('caps line points at 4+ lines (160) for big multi-line clears', () => {
    // Rows 0–2 and columns 0–2 are full except the top-left 3×3 square, so a square3 at
    // (0, 0) completes 3 rows and 3 columns at once.
    const rows = [
      '...#####',
      '...#####',
      '...#####',
      '###.....',
      '###.....',
      '###.....',
      '###.....',
      '###.....',
    ];
    const g = setup(rows, ['square3', 'single', 'single']);
    const r = g.placeAt(0, 0, 0)!;
    expect(r.lines).toBe(6);
    expect(r.points).toBe(9 + 160);
    expect(g.board.isEmpty()).toBe(true);
  });
});

describe('Game: combo (current fork behaviour)', () => {
  it('builds on consecutive clears and resets on the first non-clearing move', () => {
    const rows = [
      '.#######',
      '.#######',
      '.#######',
      '........',
      '........',
      '........',
      '........',
      '........',
    ];
    const g = setup(rows, ['single', 'single', 'single']);

    const r1 = g.placeAt(0, 0, 0)!;
    expect([r1.combo, r1.points]).toEqual([1, 1 + 10]);
    const r2 = g.placeAt(1, 0, 1)!;
    expect([r2.combo, r2.points]).toEqual([2, 1 + 15]);
    const r3 = g.placeAt(2, 0, 2)!;
    expect([r3.combo, r3.points]).toEqual([3, 1 + 20]);
    expect(g.bestCombo).toBe(3);

    // The hand was refilled after the third placement; replace it to control the next move.
    g.hand = [{ uid: 1, shape: shape('single'), color: 'x' }, null, null];
    const r4 = g.placeAt(0, 4, 4)!;
    expect([r4.combo, r4.points]).toEqual([0, 1]);
    expect(g.combo).toBe(0);
    expect(g.bestCombo).toBe(3);
    expect(g.score).toBe(11 + 16 + 21 + 1);
  });
});

describe('Game: hand refill and game over', () => {
  it('deals a new hand only after all three pieces are placed', () => {
    const g = setup(EMPTY, ['single', 'single', 'single']);
    g.placeAt(0, 0, 0);
    expect(g.hand.filter((p) => p !== null)).toHaveLength(2);
    g.placeAt(1, 2, 0);
    expect(g.hand.filter((p) => p !== null)).toHaveLength(1);
    g.placeAt(2, 4, 0);
    expect(g.hand.every((p) => p !== null)).toBe(true);
  });

  it('pieces can be placed in any order', () => {
    const g = setup(EMPTY, ['single', 'line2-h', 'square2']);
    expect(g.placeAt(2, 0, 0)).not.toBeNull();
    expect(g.placeAt(0, 4, 4)).not.toBeNull();
    expect(g.placeAt(1, 6, 6)).not.toBeNull();
  });

  it('ends the game when no remaining hand piece fits anywhere', () => {
    // Checkerboard-ish board: only isolated single holes remain.
    const rows = [
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
    ];
    const g = setup(rows, ['single', 'line2-h', null]);
    const r = g.placeAt(0, 1, 0)!;
    expect(r.gameOver).toBe(true);
    expect(g.status).toBe(GameStatus.GAME_OVER);
    expect(g.hasAnyMove()).toBe(false);
  });

  it('keeps playing while at least one hand piece still fits', () => {
    const rows = [
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#..',
    ];
    const g = setup(rows, ['single', 'line2-h', 'square3']);
    const r = g.placeAt(0, 1, 0)!;
    expect(r.gameOver).toBe(false); // line2-h fits in the bottom-right corner
    expect(g.status).toBe(GameStatus.PLAYING);
  });

  it('checks the freshly dealt hand for game over (it can be dead on arrival)', () => {
    // Only isolated single holes remain, and seed 1's second hand (T-up, line2-h, square3)
    // has no single, so the game ends right after the refill.
    const rows = [
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
    ];
    const g = setup(rows, [null, null, 'single']);
    const r = g.placeAt(2, 1, 0)!;
    expect(g.hand.map((p) => p?.shape.name)).toEqual(['T-up', 'line2-h', 'square3']);
    expect(r.gameOver).toBe(true);
    expect(g.status).toBe(GameStatus.GAME_OVER);
  });

  it('board after a clear keeps unrelated cells', () => {
    const g = setup(bottomRowGap(1), ['single', 'single', 'single']);
    g.board.grid[0]![0] = 'keep';
    g.placeAt(0, 0, 7);
    expect(boardToAscii(g.board)).toEqual(['#.......', ...EMPTY.slice(1)]);
  });
});
