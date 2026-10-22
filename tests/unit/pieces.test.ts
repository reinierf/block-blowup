import { describe, expect, it } from 'vitest';
import { PALETTE, PieceBag, SHAPES, colorFor } from '../../src/game/pieces';
import { lcg } from '../../src/sim/lcg';

describe('SHAPES', () => {
  it('has the 33 shapes of the fork, with sequential ids and unique names', () => {
    expect(SHAPES).toHaveLength(33);
    expect(SHAPES.map((s) => s.id)).toEqual([...Array(33).keys()]);
    expect(new Set(SHAPES.map((s) => s.name)).size).toBe(33);
  });

  it('keeps every cell inside its bounding box and touches every edge', () => {
    for (const s of SHAPES) {
      const xs = s.cells.map(([x]) => x);
      const ys = s.cells.map(([, y]) => y);
      expect(Math.min(...xs), s.name).toBe(0);
      expect(Math.min(...ys), s.name).toBe(0);
      expect(Math.max(...xs), s.name).toBe(s.width - 1);
      expect(Math.max(...ys), s.name).toBe(s.height - 1);
    }
  });

  it('pins the cell counts per shape', () => {
    const counts = Object.fromEntries(SHAPES.map((s) => [s.name, s.cells.length]));
    expect(counts).toMatchObject({
      single: 1,
      'line2-h': 2,
      'line5-v': 5,
      square2: 4,
      square3: 9,
      'rect-2x3': 6,
      'corner-tl': 3,
      'L-1': 4,
      'T-up': 4,
      'S-h': 4,
      'bigL-1': 5,
    });
    expect(SHAPES.reduce((n, s) => n + s.cells.length, 0)).toBe(134);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(SHAPES)).toBe(true);
    expect(Object.isFrozen(SHAPES[0])).toBe(true);
    expect(Object.isFrozen(SHAPES[0]!.cells)).toBe(true);
  });
});

describe('colorFor', () => {
  it('maps shape id onto the palette, wrapping around', () => {
    expect(colorFor(SHAPES[0]!)).toBe(PALETTE[0]);
    expect(colorFor(SHAPES[16]!)).toBe(PALETTE[0]);
    expect(colorFor(SHAPES[17]!)).toBe(PALETTE[1]);
  });
});

describe('PieceBag', () => {
  it('deals every shape exactly once per 33 draws, then refills', () => {
    const bag = new PieceBag(SHAPES, lcg(7));
    for (let round = 0; round < 3; round++) {
      const ids = Array.from({ length: 33 }, () => bag.next().id).sort((a, b) => a - b);
      expect(ids).toEqual([...Array(33).keys()]);
    }
  });

  it('is deterministic for a given RNG', () => {
    const draw = (seed: number) => {
      const bag = new PieceBag(SHAPES, lcg(seed));
      return Array.from({ length: 10 }, () => bag.next().name);
    };
    expect(draw(3)).toEqual(draw(3));
    expect(draw(3)).not.toEqual(draw(4));
  });

  it('pins the first deal for seed 1', () => {
    const bag = new PieceBag(SHAPES, lcg(1));
    expect([bag.next().name, bag.next().name, bag.next().name]).toMatchInlineSnapshot(`
      [
        "line4-v",
        "rect-2x3",
        "corner-bl",
      ]
    `);
  });
});
