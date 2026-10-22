import { describe, expect, it } from 'vitest';
import {
  SPAWN_SPREAD,
  centreLine,
  radialSpawns,
  spawnsOnCentreLine,
} from '../../src/feedback/particles';
import { Mulberry32 } from '../../src/game/rng';
import { shape } from '../helpers/boards';

const cellsOf = (name: string) => shape(name).cells.map(([x, y]) => [x, y] as [number, number]);
const rand = () => new Mulberry32(7).next;

describe('centreLine', () => {
  it('is the ring through the outer cell centres of a 3×3 square, without the inner cross', () => {
    const edges = centreLine(cellsOf('square3'));
    expect(edges).toHaveLength(8);
    for (const e of edges) {
      // Every edge lies on the ring x or y = 0.5 / 2.5 and has exactly one open side.
      const onRing = [e.ax, e.bx, e.ay, e.by].some((v) => v === 0.5 || v === 2.5);
      expect(onRing).toBe(true);
      expect(e.normals).toHaveLength(1);
    }
  });

  it('is a segment open on both sides for a straight line', () => {
    const edges = centreLine(cellsOf('line3-h'));
    expect(edges).toHaveLength(2);
    for (const e of edges)
      expect(e.normals).toEqual([
        [0, -1],
        [0, 1],
      ]);
  });

  it('is empty for a single cell', () => {
    expect(centreLine([[3, 4]])).toEqual([]);
  });
});

describe('spawnsOnCentreLine', () => {
  it.each(['square2', 'square3', 'L-1', 'T-up', 'line5-v', 'bigL-2'])(
    '%s: spawns on the centre line and always flies away from it',
    (name) => {
      const cells = cellsOf(name);
      const edges = centreLine(cells);
      const spawns = spawnsOnCentreLine(cells, 200, rand());
      expect(spawns).toHaveLength(200);
      for (const s of spawns) {
        expect(Math.hypot(s.dx, s.dy)).toBeCloseTo(1);
        // On some edge, heading out through one of its open sides (within the spread).
        const ok = edges.some((e) => {
          const onEdge =
            Math.min(e.ax, e.bx) - 1e-9 <= s.x &&
            s.x <= Math.max(e.ax, e.bx) + 1e-9 &&
            Math.min(e.ay, e.by) - 1e-9 <= s.y &&
            s.y <= Math.max(e.ay, e.by) + 1e-9;
          return (
            onEdge &&
            e.normals.some(([nx, ny]) => s.dx * nx + s.dy * ny >= Math.cos(SPAWN_SPREAD) - 1e-9)
          );
        });
        expect(ok).toBe(true);
      }
    },
  );

  it('never spawns from the middle of a 3×3 square', () => {
    for (const s of spawnsOnCentreLine(cellsOf('square3'), 300, rand())) {
      expect(Math.max(Math.abs(s.x - 1.5), Math.abs(s.y - 1.5))).toBeCloseTo(1);
    }
  });

  it('bursts a single cell from its centre', () => {
    for (const s of spawnsOnCentreLine([[3, 4]], 10, rand())) {
      expect([s.x, s.y]).toEqual([3.5, 4.5]);
      expect(Math.hypot(s.dx, s.dy)).toBeCloseTo(1);
    }
  });

  it('spreads a cleared row along its length, flying up or down', () => {
    const row = Array.from({ length: 8 }, (_, x) => [x, 7] as [number, number]);
    const spawns = spawnsOnCentreLine(row, 400, rand());
    for (const s of spawns) {
      expect(s.y).toBe(7.5);
      expect(Math.abs(s.dy)).toBeGreaterThanOrEqual(Math.cos(SPAWN_SPREAD) - 1e-9);
    }
    const xs = spawns.map((s) => s.x);
    expect(Math.min(...xs)).toBeLessThan(1.5);
    expect(Math.max(...xs)).toBeGreaterThan(6.5);
  });
});

describe('radialSpawns', () => {
  it('starts every particle at the point, in unit directions', () => {
    const spawns = radialSpawns(4, 4, 50, rand());
    expect(spawns).toHaveLength(50);
    for (const s of spawns) {
      expect([s.x, s.y]).toEqual([4, 4]);
      expect(Math.hypot(s.dx, s.dy)).toBeCloseTo(1);
    }
  });
});
