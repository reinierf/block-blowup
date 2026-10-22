import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runSeeds, summarize } from '../../src/sim/simulate';
import {
  SNAPSHOT_SEEDS,
  compareSnapshots,
  toSnapshot,
  type SimSnapshot,
} from '../../src/sim/snapshot';

const snapshot = JSON.parse(
  readFileSync(new URL('../sim-snapshot.json', import.meta.url), 'utf8'),
) as SimSnapshot;

describe('simulation regression', () => {
  const games = runSeeds(SNAPSHOT_SEEDS.from, SNAPSHOT_SEEDS.to);

  it('stays within the tolerance bands of tests/sim-snapshot.json', () => {
    expect(snapshot.seeds).toEqual(SNAPSHOT_SEEDS);
    const problems = compareSnapshots(snapshot, toSnapshot(summarize(games)));
    expect(problems, 'run `npm run sim:update` if this balance change is intended').toEqual([]);
  });

  it('no game ends on a dead fresh hand', () => {
    expect(games.filter((g) => g.diedOnFreshHand).map((g) => g.seed)).toEqual([]);
  });

  it('difficulty rises over the course of a game', () => {
    const long = games.filter((g) => g.moves >= 60);
    expect(long.length).toBeGreaterThan(10);
    for (const g of long) {
      for (let i = 1; i < g.difficulty.length; i++) {
        expect(g.difficulty[i]).toBeGreaterThanOrEqual(g.difficulty[i - 1]!);
      }
      expect(g.difficulty[59]!).toBeGreaterThan(g.difficulty[0]!);
    }
  });

  it('every simulated game ends cleanly, with a consistent log', () => {
    for (const g of games) {
      expect(g.moves).toBeGreaterThan(0);
      expect(g.log.reduce((sum, e) => sum + e.points, 0)).toBe(g.score);
      expect(Math.max(...g.log.map((e) => e.combo))).toBe(g.bestCombo);
      expect(g.fill.every((f) => f >= 0 && f < 1)).toBe(true);
    }
  });
});
