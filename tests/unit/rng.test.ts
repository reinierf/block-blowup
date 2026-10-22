import { describe, expect, it } from 'vitest';
import { Mulberry32, weightedIndex } from '../../src/game/rng';

describe('Mulberry32', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = new Mulberry32(42);
    const b = new Mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a.next());
    expect(Array.from({ length: 1000 }, () => b.next())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(new Mulberry32(43).next()).not.toBe(xs[0]);
  });

  it('pins the first outputs for seed 1', () => {
    const r = new Mulberry32(1);
    expect([r.next(), r.next(), r.next()]).toMatchInlineSnapshot(`
      [
        0.6270739405881613,
        0.002735721180215478,
        0.5274470399599522,
      ]
    `);
  });

  it('resumes from a saved state', () => {
    const r = new Mulberry32(7);
    r.next();
    r.next();
    const resumed = new Mulberry32(r.state);
    expect([resumed.next(), resumed.next()]).toEqual([r.next(), r.next()]);
  });

  it('`next` works as a detached function', () => {
    const next = new Mulberry32(3).next;
    expect(next()).toBe(new Mulberry32(3).next());
  });

  it('is roughly uniform', () => {
    const r = new Mulberry32(99);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 20000; i++) buckets[Math.floor(r.next() * 10)]!++;
    for (const b of buckets) expect(b).toBeGreaterThan(1800);
  });
});

describe('weightedIndex', () => {
  it('picks in proportion to weight and never picks a zero weight', () => {
    const r = new Mulberry32(5);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) counts[weightedIndex([1, 0, 3], r.next)]!++;
    expect(counts[1]).toBe(0);
    expect(counts[2]! / counts[0]!).toBeGreaterThan(2.7);
    expect(counts[2]! / counts[0]!).toBeLessThan(3.3);
  });

  it('returns -1 when every weight is zero', () => {
    expect(weightedIndex([0, 0], () => 0.5)).toBe(-1);
    expect(weightedIndex([], () => 0.5)).toBe(-1);
  });

  it('handles an RNG value at the very top of the range', () => {
    expect(weightedIndex([1, 1, 0], () => 0.9999999999999999)).toBe(1);
  });
});
