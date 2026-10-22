// src/sim/snapshot.ts
// The simulation regression snapshot (tests/sim-snapshot.json): which seeds it covers,
// what it records, and how far each metric may drift before the test fails.
// Update it on purpose with `npm run sim:update`, in the same commit as a balance change.

import { runSeeds, summarize, type BatchStats } from './simulate';

export const SNAPSHOT_SEEDS = { from: 1, to: 50 } as const;

export interface SimSnapshot {
  seeds: { from: number; to: number };
  avgMoves: number;
  medianScore: number;
  avgScore: number;
  bestScore: number;
  avgBestCombo: number;
  avgAllClears: number;
  deadFreshHands: number;
  /** Average board fill at moves 10, 20 and 30. */
  fillAt10: number;
  fillAt20: number;
  fillAt30: number;
}

type Metric = Exclude<keyof SimSnapshot, 'seeds'>;

/** Allowed drift per metric: `rel` is a fraction of the snapshot value, `abs` is absolute. */
export const TOLERANCES: Record<Metric, { rel?: number; abs?: number }> = {
  avgMoves: { rel: 0.05 },
  medianScore: { rel: 0.1 },
  avgScore: { rel: 0.1 },
  bestScore: { rel: 0.25 },
  avgBestCombo: { abs: 0.25 },
  avgAllClears: { abs: 0.1 },
  deadFreshHands: { abs: 2 },
  fillAt10: { abs: 0.05 },
  fillAt20: { abs: 0.05 },
  fillAt30: { abs: 0.05 },
};

const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

export function toSnapshot(stats: BatchStats): SimSnapshot {
  return {
    seeds: { ...SNAPSHOT_SEEDS },
    avgMoves: round(stats.avgMoves),
    medianScore: round(stats.medianScore),
    avgScore: round(stats.avgScore),
    bestScore: stats.bestScore,
    avgBestCombo: round(stats.avgBestCombo),
    avgAllClears: round(stats.avgAllClears),
    deadFreshHands: stats.deadFreshHands,
    fillAt10: round(stats.fillByMove[10] ?? 0),
    fillAt20: round(stats.fillByMove[20] ?? 0),
    fillAt30: round(stats.fillByMove[30] ?? 0),
  };
}

export function currentSnapshot(): SimSnapshot {
  return toSnapshot(summarize(runSeeds(SNAPSHOT_SEEDS.from, SNAPSHOT_SEEDS.to)));
}

/** Human-readable descriptions of every metric outside its tolerance band (empty = pass). */
export function compareSnapshots(expected: SimSnapshot, actual: SimSnapshot): string[] {
  const problems: string[] = [];
  for (const [metric, tol] of Object.entries(TOLERANCES) as [
    Metric,
    { rel?: number; abs?: number },
  ][]) {
    const want = expected[metric];
    const got = actual[metric];
    const allowed = Math.max(tol.abs ?? 0, (tol.rel ?? 0) * Math.abs(want));
    if (Math.abs(got - want) > allowed + 1e-9) {
      problems.push(`${metric}: expected ${want} ± ${round(allowed)}, got ${got}`);
    }
  }
  return problems;
}
