import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Mulberry32 } from '../../src/game/rng';
import { SAVE_VERSION, parseSavedGame, restoreGame, saveGame } from '../../src/game/save';
import { Game, GameStatus } from '../../src/game/state';

/** All legal moves in a stable order. */
function legalMoves(game: Game): [number, number, number][] {
  const moves: [number, number, number][] = [];
  game.hand.forEach((p, i) => {
    if (!p) return;
    for (let oy = 0; oy + p.shape.height <= 8; oy++) {
      for (let ox = 0; ox + p.shape.width <= 8; ox++) {
        if (game.board.canPlace(p.shape, ox, oy)) moves.push([i, ox, oy]);
      }
    }
  });
  return moves;
}

/** Everything observable about a game, for comparing two games. */
function observe(game: Game) {
  return {
    board: game.board.grid,
    hand: game.hand.map((p) => (p ? [p.shape.name, p.color] : null)),
    score: game.score,
    combo: game.combo,
    movesSinceClear: game.movesSinceClear,
    bestCombo: game.bestCombo,
    handsWithoutClear: game.handsWithoutClear,
    handHadClear: game.handHadClear,
    status: game.status,
  };
}

describe('save / restore', () => {
  it('save → JSON → restore → continue plays exactly like never saving (property)', () => {
    fc.assert(
      fc.property(
        fc.nat(2 ** 31),
        fc.nat(2 ** 31),
        fc.integer({ min: 0, max: 40 }),
        (seed, moveSeed, saveAt) => {
          const rngA = new Mulberry32(seed);
          const a = new Game({ rng: rngA.next });
          const pickA = new Mulberry32(moveSeed);

          // Play to the save point.
          for (let n = 0; n < saveAt && a.status === GameStatus.PLAYING; n++) {
            const m = legalMoves(a);
            const [i, x, y] = m[Math.floor(pickA.next() * m.length)]!;
            a.placeAt(i, x, y);
          }

          // Save through JSON (as storage does) and restore into a fresh game.
          const json = JSON.stringify(saveGame(a, rngA.state));
          const saved = parseSavedGame(JSON.parse(json))!;
          expect(saved).not.toBeNull();
          const rngB = new Mulberry32(saved.rngState);
          const b = restoreGame(saved, rngB.next);
          expect(observe(b)).toEqual(observe(a));

          // Continue both with the same move choices.
          const pickB = new Mulberry32(pickA.state);
          for (let n = 0; n < 60 && a.status === GameStatus.PLAYING; n++) {
            const ma = legalMoves(a);
            const mb = legalMoves(b);
            expect(mb).toEqual(ma);
            const k = Math.floor(pickA.next() * ma.length);
            expect(Math.floor(pickB.next() * mb.length)).toBe(k);
            const ra = a.placeAt(...ma[k]!)!;
            const rb = b.placeAt(...mb[k]!)!;
            expect({ ...rb, deal: null }).toEqual({ ...ra, deal: null });
            expect(observe(b)).toEqual(observe(a));
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('restoring draws nothing from the RNG', () => {
    const rng = new Mulberry32(5);
    const g = new Game({ rng: rng.next });
    const saved = saveGame(g, rng.state);
    const fresh = new Mulberry32(saved.rngState);
    restoreGame(saved, fresh.next);
    expect(fresh.state).toBe(saved.rngState);
  });

  it('the restored game does not share arrays with the save', () => {
    const rng = new Mulberry32(5);
    const saved = saveGame(new Game({ rng: rng.next }), rng.state);
    const g = restoreGame(saved, new Mulberry32(saved.rngState).next);
    g.board.grid[0]![0] = 'red';
    expect(saved.board[0]![0]).toBeNull();
  });
});

describe('parseSavedGame', () => {
  const rng = new Mulberry32(9);
  const valid = () => JSON.parse(JSON.stringify(saveGame(new Game({ rng: rng.next }), 123)));

  it('accepts a valid save', () => {
    expect(parseSavedGame(valid())).not.toBeNull();
    expect(valid().v).toBe(SAVE_VERSION);
  });

  it.each([
    ['null', null],
    ['a string', 'save'],
    ['an array', []],
    ['an old version', { ...valid(), v: 0 }],
    ['a future version', { ...valid(), v: 2 }],
    ['a bad RNG state', { ...valid(), rngState: -1 }],
    ['a huge RNG state', { ...valid(), rngState: 2 ** 33 }],
    ['a fractional score', { ...valid(), score: 1.5 }],
    ['a negative combo', { ...valid(), combo: -1 }],
    ['a missing field', { ...valid(), bestCombo: undefined }],
    ['a bad status', { ...valid(), status: 'paused' }],
    ['a short board', { ...valid(), board: valid().board.slice(1) }],
    [
      'a bad cell',
      {
        ...valid(),
        board: valid().board.map((r: unknown[], y: number) => (y ? r : [1, ...r.slice(1)])),
      },
    ],
    ['an unknown shape', { ...valid(), hand: [{ shape: 'hexagon', color: 'red' }, null, null] }],
    ['an empty colour', { ...valid(), hand: [{ shape: 'single', color: '' }, null, null] }],
    ['an empty hand', { ...valid(), hand: [null, null, null] }],
    ['a two-slot hand', { ...valid(), hand: valid().hand.slice(1) }],
  ])('rejects %s', (_, data) => {
    expect(parseSavedGame(data)).toBeNull();
  });
});
