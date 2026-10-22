import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runSeeds } from '../../src/sim/simulate';
import {
  SNAPSHOT_SEEDS,
  compareSnapshots,
  currentSnapshot,
  type SimSnapshot,
} from '../../src/sim/snapshot';

const snapshot = JSON.parse(
  readFileSync(new URL('../sim-snapshot.json', import.meta.url), 'utf8'),
) as SimSnapshot;

describe('simulation regression', () => {
  it('stays within the tolerance bands of tests/sim-snapshot.json', () => {
    expect(snapshot.seeds).toEqual(SNAPSHOT_SEEDS);
    const problems = compareSnapshots(snapshot, currentSnapshot());
    expect(problems, 'run `npm run sim:update` if this balance change is intended').toEqual([]);
  });

  it('every simulated game ends cleanly, with a consistent log', () => {
    for (const g of runSeeds(SNAPSHOT_SEEDS.from, SNAPSHOT_SEEDS.to)) {
      expect(g.moves).toBeGreaterThan(0);
      expect(g.log.reduce((sum, e) => sum + e.points, 0)).toBe(g.score);
      expect(Math.max(...g.log.map((e) => e.combo))).toBe(g.bestCombo);
      expect(g.fill.every((f) => f >= 0 && f < 1)).toBe(true);
    }
  });
});
