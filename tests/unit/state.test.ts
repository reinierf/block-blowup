import { describe, expect, it } from 'vitest';
import { ASSIST_COMBO_GAIN } from '../../src/game/config';
import { assistChance } from '../../src/game/difficulty';
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
      movesSinceClear: 1,
      allClear: false,
      praise: null,
      points: 4,
      deal: null,
      gameOver: false,
    });
    expect(g.score).toBe(4);
    expect(g.hand[0]).toBeNull();
    expect(g.board.grid[3]![2]).toBe('color0');
  });

  it('clears a line and reports the cleared cells with their colours', () => {
    // A stray cell in the top-right corner keeps this from being a board clear.
    const g = setup(['.......#', ...bottomRowGap(2).slice(1)], ['line2-h', 'single', 'single']);
    const r = g.placeAt(0, 0, 7)!;
    expect(r.rows).toEqual([7]);
    expect(r.cols).toEqual([]);
    expect(r.lines).toBe(1);
    expect(r.combo).toBe(1);
    expect(r.points).toBe(2 + 40);
    expect(r.allClear).toBe(false);
    expect(r.praise).toBeNull();
    expect(r.clearedCells).toHaveLength(8);
    expect(r.clearedCells.slice(0, 3)).toEqual([
      { x: 0, y: 7, color: 'color0' },
      { x: 1, y: 7, color: 'color0' },
      { x: 2, y: 7, color: 'c' },
    ]);
    expect(boardToAscii(g.board)).toEqual(['.......#', ...EMPTY.slice(1)]);
  });

  it('clears a row and a column together, sharing the crossing cell (and the board)', () => {
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
    expect(r.praise).toBe('Good');
    expect(r.allClear).toBe(true);
    expect(r.points).toBe(1 + 80 + 600);
    expect(g.board.isEmpty()).toBe(true);
  });

  it('scores a 6-line clear from the line table', () => {
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
    expect(r.praise).toBe('Amazing');
    expect(r.allClear).toBe(true);
    expect(r.points).toBe(9 + 1200 + 600);
    expect(g.board.isEmpty()).toBe(true);
  });

  it('multiplies the board-clear bonus by the combo multiplier', () => {
    const rows = [
      '.#######',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '.#######',
    ];
    const g = setup(rows, ['single', 'single', 'single']);
    const r1 = g.placeAt(0, 0, 0)!;
    expect([r1.combo, r1.allClear, r1.points]).toEqual([1, false, 1 + 40]);
    const r2 = g.placeAt(1, 0, 7)!;
    expect([r2.combo, r2.allClear, r2.points]).toEqual([2, true, 1 + 60 + 900]);
  });
});

describe('Game: combo with a grace window (COMBO_GRACE = 3)', () => {
  /** Place a single at (x, y), giving the game a fresh one-piece hand first. */
  function single(g: Game, x: number, y: number) {
    g.hand = [{ uid: 1, shape: shape('single'), color: 'x' }, null, null];
    const r = g.placeAt(0, x, y)!;
    return { combo: r.combo, movesSinceClear: r.movesSinceClear, points: r.points };
  }

  const rows = [
    '.#######',
    '.#######',
    '.#######',
    '.#######',
    '........',
    '........',
    '........',
    '........',
  ];

  it('builds on consecutive clears', () => {
    const g = setup(rows, []);
    expect(single(g, 0, 0)).toEqual({ combo: 1, movesSinceClear: 0, points: 1 + 40 });
    expect(single(g, 0, 1)).toEqual({ combo: 2, movesSinceClear: 0, points: 1 + 60 });
    expect(single(g, 0, 2)).toEqual({ combo: 3, movesSinceClear: 0, points: 1 + 80 });
    expect(g.bestCombo).toBe(3);
  });

  it('survives up to two misses, and a clear within the window extends the streak', () => {
    const g = setup(rows, []);
    single(g, 0, 0);
    single(g, 0, 1);
    single(g, 0, 2);
    expect(single(g, 4, 5)).toEqual({ combo: 3, movesSinceClear: 1, points: 1 });
    expect(single(g, 5, 5)).toEqual({ combo: 3, movesSinceClear: 2, points: 1 });
    expect(single(g, 0, 3)).toEqual({ combo: 4, movesSinceClear: 0, points: 1 + 100 });
    expect(g.bestCombo).toBe(4);
  });

  it('resets on the third miss in a row', () => {
    const g = setup(rows, []);
    single(g, 0, 0);
    single(g, 0, 1);
    expect(single(g, 4, 6)).toEqual({ combo: 2, movesSinceClear: 1, points: 1 });
    expect(single(g, 5, 6)).toEqual({ combo: 2, movesSinceClear: 2, points: 1 });
    expect(single(g, 6, 6)).toEqual({ combo: 0, movesSinceClear: 3, points: 1 });
    expect(single(g, 7, 6)).toEqual({ combo: 0, movesSinceClear: 4, points: 1 });
    // The next clear starts a new streak at 1.
    expect(single(g, 0, 2)).toEqual({ combo: 1, movesSinceClear: 0, points: 1 + 40 });
    expect(g.bestCombo).toBe(2);
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

  it('never deals a dead hand, even when only single holes are left', () => {
    // Under the fork's bag this board ended the game on a fresh hand (no single in it).
    // The generator's hard fairness rule now guarantees a piece that fits: on this board
    // only a single or a diagonal can.
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
    expect(r.deal).not.toBeNull();
    const fitting = g.hand.filter((_, i) => g.pieceFits(i)).map((p) => p!.shape.family);
    expect(fitting.length).toBeGreaterThan(0);
    for (const f of fitting) expect(['single', 'diag2', 'diag3', 'diag4']).toContain(f);
    expect(r.gameOver).toBe(false);
    expect(g.status).toBe(GameStatus.PLAYING);
  });

  it('reports the deal in the turn result only when a new hand is dealt', () => {
    const g = setup(EMPTY, ['single', 'single', 'single']);
    expect(g.lastDeal).not.toBeNull();
    expect(g.placeAt(0, 0, 0)!.deal).toBeNull();
    expect(g.placeAt(1, 2, 0)!.deal).toBeNull();
    const r = g.placeAt(2, 4, 0)!;
    expect(r.deal).toBe(g.lastDeal);
    expect(r.deal).toMatchObject({ requireSolvable: true, solvable: true, mercy: false });
    expect(r.deal!.difficulty).toBeCloseTo(0.0004); // score 3 on the difficulty curve
  });

  it('passes the running combo to the generator, for the assist', () => {
    const calm = setup(EMPTY, ['single', 'single', 'single']);
    calm.placeAt(0, 0, 0);
    calm.placeAt(1, 2, 0);
    // No clear in that hand: base 0.6 + drought 0.2.
    expect(calm.placeAt(2, 4, 0)!.deal!.assistP).toBeCloseTo(0.8);

    const g = setup(bottomRowGap(1), ['single', 'single', 'single']);
    g.placeAt(0, 0, 7); // completes row 7: combo 1
    g.placeAt(1, 2, 0);
    const r = g.placeAt(2, 4, 0)!;
    expect(r.combo).toBe(1);
    // A clear in that hand (it empties the board, so the all-clear bonus lifts difficulty a
    // little), combo running: the combo term is added on top of the base.
    const { difficulty } = r.deal!;
    const noCombo = assistChance({ difficulty, fill: 2 / 64, handsWithoutClear: 0, combo: 0 });
    expect(r.deal!.assistP - noCombo.p).toBeCloseTo(ASSIST_COMBO_GAIN);
  });

  it('counts hands in a row without a clear, for the mercy rule', () => {
    const g = setup(bottomRowGap(1), ['single', 'single', 'single']);
    const playHand = (clearFirst: boolean) => {
      g.hand = ['single', 'single', 'single'].map((n, i) => ({
        uid: i,
        shape: shape(n),
        color: 'x',
      }));
      g.placeAt(0, clearFirst ? 0 : 3, clearFirst ? 7 : 3);
      g.placeAt(1, 3, 1);
      g.placeAt(2, 5, 1);
      g.board.grid[1]!.fill(null); // keep the board roomy
      g.board.grid[3]!.fill(null);
    };
    playHand(false);
    expect(g.handsWithoutClear).toBe(1);
    playHand(false);
    expect(g.handsWithoutClear).toBe(2);
    expect(g.lastDeal!.mercyReason).toBe('drought');
    g.board.grid[7] = [null, 'c', 'c', 'c', 'c', 'c', 'c', 'c'];
    playHand(true);
    expect(g.handsWithoutClear).toBe(0);
  });

  it('board after a clear keeps unrelated cells', () => {
    const g = setup(bottomRowGap(1), ['single', 'single', 'single']);
    g.board.grid[0]![0] = 'keep';
    g.placeAt(0, 0, 7);
    expect(boardToAscii(g.board)).toEqual(['#.......', ...EMPTY.slice(1)]);
  });
});
