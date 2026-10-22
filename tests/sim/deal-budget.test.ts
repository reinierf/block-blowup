import { describe, expect, it } from 'vitest';
import { DEAL_NODE_BUDGET } from '../../src/game/config';
import { Generator } from '../../src/game/generator';
import { Mulberry32 } from '../../src/game/rng';
import { collectDealInputs } from '../../src/sim/deal-boards';

/**
 * Time budget for one deal, measured in Node on realistic boards from simulated games.
 * The target is < 5 ms on a mid-range phone; phones run this kind of code roughly 3–5×
 * slower than a desktop/CI core, so Node gets a stricter budget. Measured on a desktop
 * (2026-10-22): p50 0.014 ms, p99 0.16 ms, max 0.9 ms.
 */
const P99_BUDGET_MS = 1;
const MAX_BUDGET_MS = 4;

describe('generator time budget', () => {
  const inputs = collectDealInputs(30);

  it('stays within the node budget on every realistic board', () => {
    const g = new Generator(new Mulberry32(1).next);
    for (const { rows, ctx } of inputs) {
      expect(g.deal(rows, ctx).info.solverNodes).toBeLessThanOrEqual(DEAL_NODE_BUDGET);
    }
  });

  it(`deals in under ${P99_BUDGET_MS} ms (p99) and ${MAX_BUDGET_MS} ms (max)`, () => {
    const g = new Generator(new Mulberry32(2).next);
    for (const { rows, ctx } of inputs.slice(0, 300)) g.deal(rows, ctx); // JIT warm-up
    // Best of 3 per board: filters out GC pauses and scheduler noise from parallel test
    // workers, while a genuinely slow deal is still slow every time.
    const times: number[] = [];
    for (const { rows, ctx } of inputs) {
      let best = Infinity;
      for (let rep = 0; rep < 3; rep++) {
        const t0 = performance.now();
        g.deal(rows, ctx);
        best = Math.min(best, performance.now() - t0);
      }
      times.push(best);
    }
    times.sort((a, b) => a - b);
    const p99 = times[Math.floor(0.99 * (times.length - 1))]!;
    const max = times[times.length - 1]!;
    expect(p99).toBeLessThan(P99_BUDGET_MS);
    expect(max).toBeLessThan(MAX_BUDGET_MS);
  });
});
