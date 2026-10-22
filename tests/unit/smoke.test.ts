import { describe, expect, it } from 'vitest';
import { Game, GameStatus } from '../../src/game/state';

/** Small deterministic LCG for tests (same one the simulation harness uses). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('Game (smoke)', () => {
  it('starts a playable game with a full hand', () => {
    const game = new Game({ rng: lcg(1) });
    expect(game.status).toBe(GameStatus.PLAYING);
    expect(game.score).toBe(0);
    expect(game.hand.every((p) => p !== null)).toBe(true);
    expect(game.board.isEmpty()).toBe(true);
  });

  it('deals the same hand for the same seed', () => {
    const names = (g: Game) => g.hand.map((p) => p?.shape.name);
    expect(names(new Game({ rng: lcg(42) }))).toEqual(names(new Game({ rng: lcg(42) })));
  });
});
