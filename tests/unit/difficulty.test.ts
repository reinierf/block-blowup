import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ASSIST_MAX, DIFFICULTY_CURVE } from '../../src/game/config';
import {
  assistChance,
  assistGenerosity,
  difficultyFor,
  pSolvable,
} from '../../src/game/difficulty';

describe('difficultyFor', () => {
  it('hits every point of the curve and interpolates between them', () => {
    for (const [score, d] of DIFFICULTY_CURVE) expect(difficultyFor(score)).toBeCloseTo(d);
    expect(difficultyFor(750)).toBeCloseTo(0.1);
    expect(difficultyFor(3000)).toBeCloseTo(0.325);
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

describe('assistChance', () => {
  const calm = { difficulty: 0, fill: 0, handsWithoutClear: 0, combo: 0 };

  it('falls from 0.6 at difficulty 0 to 0.15 at difficulty 1 on a calm board', () => {
    expect(assistChance(calm)).toEqual({ p: 0.6, reason: 'base' });
    expect(assistChance({ ...calm, difficulty: 0.5 }).p).toBeCloseTo(0.375);
    expect(assistChance({ ...calm, difficulty: 1 }).p).toBeCloseTo(0.15);
  });

  it('adds a fill term above half full, a drought term and a combo term', () => {
    const hard = { ...calm, difficulty: 1 };
    expect(assistChance({ ...hard, fill: 0.5 }).p).toBeCloseTo(0.15);
    expect(assistChance({ ...hard, fill: 0.75 })).toMatchObject({ reason: 'fill' });
    expect(assistChance({ ...hard, fill: 0.75 }).p).toBeCloseTo(0.45);
    expect(assistChance({ ...hard, handsWithoutClear: 2 })).toMatchObject({ reason: 'drought' });
    expect(assistChance({ ...hard, handsWithoutClear: 2 }).p).toBeCloseTo(0.55);
    expect(assistChance({ ...hard, combo: 4 })).toMatchObject({ reason: 'combo' });
    expect(assistChance({ ...hard, combo: 4 }).p).toBeCloseTo(0.45);
  });

  it(`is capped at ${ASSIST_MAX}`, () => {
    expect(assistChance({ ...calm, combo: 1, handsWithoutClear: 3 }).p).toBe(ASSIST_MAX);
  });

  it('stays in (0, max], rises with need and falls with difficulty (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.nat(5),
        fc.nat(5),
        (difficulty, fill, handsWithoutClear, combo) => {
          const input = { difficulty, fill, handsWithoutClear, combo };
          const { p } = assistChance(input);
          expect(p).toBeGreaterThan(0);
          expect(p).toBeLessThanOrEqual(ASSIST_MAX);
          const more = (change: Partial<typeof input>) => assistChance({ ...input, ...change }).p;
          expect(more({ handsWithoutClear: handsWithoutClear + 1 })).toBeGreaterThanOrEqual(p);
          expect(more({ fill: Math.min(1, fill + 0.1) })).toBeGreaterThanOrEqual(p);
          expect(more({ difficulty: Math.min(1, difficulty + 0.1) })).toBeLessThanOrEqual(p);
        },
      ),
    );
  });
});

describe('assistGenerosity', () => {
  it('goes from 1.5 at difficulty 0 to 0 at difficulty 1', () => {
    expect(assistGenerosity(0)).toBe(1.5);
    expect(assistGenerosity(0.5)).toBeCloseTo(0.75);
    expect(assistGenerosity(1)).toBe(0);
  });
});
