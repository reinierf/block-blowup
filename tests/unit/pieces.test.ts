import { describe, expect, it } from 'vitest';
import { FAMILY_WEIGHTS } from '../../src/game/config';
import { SHAPES } from '../../src/game/pieces';

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

  it('puts every shape in a family that has generator weights', () => {
    const families = new Set(SHAPES.map((s) => s.family));
    expect([...families].sort()).toEqual(Object.keys(FAMILY_WEIGHTS).sort());
    const count = (f: string) => SHAPES.filter((s) => s.family === f).length;
    expect([count('single'), count('line5'), count('corner'), count('SZ'), count('bigL')]).toEqual([
      1, 2, 4, 4, 4,
    ]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(SHAPES)).toBe(true);
    expect(Object.isFrozen(SHAPES[0])).toBe(true);
    expect(Object.isFrozen(SHAPES[0]!.cells)).toBe(true);
  });
});
