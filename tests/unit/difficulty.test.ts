import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_CURVE } from '../../src/game/config';
import { difficultyFor, pSolvable } from '../../src/game/difficulty';

describe('difficultyFor', () => {
  it('hits every point of the curve and interpolates between them', () => {
    for (const [score, d] of DIFFICULTY_CURVE) expect(difficultyFor(score)).toBeCloseTo(d);
    expect(difficultyFor(250)).toBeCloseTo(0.1);
    expect(difficultyFor(1000)).toBeCloseTo(0.325);
  });

  it('clamps below and above the curve', () => {
    expect(difficultyFor(-50)).toBe(0);
    expect(difficultyFor(1_000_000)).toBe(1);
  });

  it('accepts a custom curve', () => {
    expect(
      difficultyFor(5, [
        [0, 0],
        [10, 1],
      ]),
    ).toBe(0.5);
  });

  it('never decreases with score and stays in [0, 1] (property)', () => {
    fc.assert(
      fc.property(fc.nat(20_000), fc.nat(20_000), (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(difficultyFor(lo)).toBeLessThanOrEqual(difficultyFor(hi));
        expect(difficultyFor(hi)).toBeGreaterThanOrEqual(0);
        expect(difficultyFor(hi)).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe('pSolvable', () => {
  it('tapers from 1.0 at difficulty 0 to 0.7 at difficulty 1', () => {
    expect(pSolvable(0)).toBe(1);
    expect(pSolvable(0.5)).toBeCloseTo(0.85);
    expect(pSolvable(1)).toBeCloseTo(0.7);
  });
});
