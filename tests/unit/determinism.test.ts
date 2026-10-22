import { describe, expect, it } from 'vitest';
import { playGame } from '../../src/sim/simulate';

describe('determinism', () => {
  it('the same seed and the same (bot) moves produce an identical game log', () => {
    for (const seed of [1, 2, 99, 12345]) {
      const a = playGame(seed);
      const b = playGame(seed);
      expect(b.log).toEqual(a.log);
      expect(b.score).toBe(a.score);
    }
  });

  it('different seeds produce different games', () => {
    expect(playGame(1).log).not.toEqual(playGame(2).log);
  });

  it('pins the outcome of seed 1', () => {
    const g = playGame(1);
    expect({ moves: g.moves, score: g.score, bestCombo: g.bestCombo }).toMatchInlineSnapshot(`
      {
        "bestCombo": 9,
        "moves": 62,
        "score": 849,
      }
    `);
  });
});
