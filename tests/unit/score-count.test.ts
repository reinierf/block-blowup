import { describe, expect, it } from 'vitest';
import { SCORE_COUNT, ScoreCounter } from '../../src/feedback/score-count';

const { placeStep, pause } = SCORE_COUNT;

/** Tick in small frames for `seconds`, recording every value shown. */
function run(c: ScoreCounter, seconds: number, dt = 0.01): number[] {
  const seen: number[] = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) if (c.tick(dt)) seen.push(c.shown);
  return seen;
}

describe('ScoreCounter', () => {
  it('counts placement points one at a time, the first at once', () => {
    const c = new ScoreCounter(10);
    c.add(4, 4);
    expect(c.tick(0.001)).toBe(true);
    expect(c.shown).toBe(11);
    expect(run(c, placeStep * 3 + 0.001, placeStep / 4)).toEqual([12, 13, 14]);
    expect(run(c, 1)).toEqual([]);
  });

  it('pauses after the placement points, then counts up the clear points', () => {
    const c = new ScoreCounter(0);
    c.add(3, 23);
    run(c, placeStep * 2 + 0.001, placeStep / 4);
    expect(c.shown).toBe(3);
    expect(run(c, pause - 0.02)).toEqual([]);
    expect(c.shown).toBe(3);
    run(c, 1);
    expect(c.shown).toBe(23);
  });

  it('the clear points count up monotonically and take well under a second', () => {
    const c = new ScoreCounter(0);
    c.add(5, 505);
    const seen = run(c, placeStep * 5 + pause + 0.6, 1 / 60);
    expect(seen.at(-1)).toBe(505);
    expect(seen.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThan(seen[i - 1]!);
  });

  it('a new move finishes the previous count at once', () => {
    const c = new ScoreCounter(0);
    c.add(4, 40);
    c.tick(0.001);
    c.add(2, 2);
    expect(c.shown).toBe(40);
    run(c, 1);
    expect(c.shown).toBe(42);
  });

  it('skip and reset jump straight to the target', () => {
    const c = new ScoreCounter(0);
    c.add(9, 109);
    expect(c.skip()).toBe(true);
    expect(c.shown).toBe(109);
    expect(c.skip()).toBe(false);
    c.add(3, 3);
    c.reset(7);
    expect(c.shown).toBe(7);
    expect(run(c, 1)).toEqual([]);
  });
});
