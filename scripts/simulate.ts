// scripts/simulate.ts
// `npm run sim [-- --from 1 --to 300]`: play seeded games with the greedy bot and print stats.
// `npm run sim:update`: rewrite tests/sim-snapshot.json from the current rules.

import { writeFileSync } from 'node:fs';
import { Generator } from '../src/game/generator';
import { Mulberry32 } from '../src/game/rng';
import { collectDealInputs } from '../src/sim/deal-boards';
import { runSeeds, summarize } from '../src/sim/simulate';
import { currentSnapshot } from '../src/sim/snapshot';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

if (process.argv.includes('--update')) {
  const path = new URL('../tests/sim-snapshot.json', import.meta.url);
  const snap = currentSnapshot();
  writeFileSync(path, JSON.stringify(snap, null, 2) + '\n');
  console.log('Wrote tests/sim-snapshot.json');
  console.log(snap);
} else {
  const from = arg('from', 1);
  const to = arg('to', 300);
  const t0 = performance.now();
  const s = summarize(runSeeds(from, to));
  const ms = performance.now() - t0;

  const r = (x: number, d = 1) => x.toFixed(d);
  console.log(`Seeds ${from}..${to} (${s.games} games, ${r(ms, 0)} ms)`);
  console.log(`  Average moves per game:   ${r(s.avgMoves)}`);
  console.log(
    `  Score median/avg/best:    ${Math.round(s.medianScore)} / ${r(s.avgScore, 0)} / ${s.bestScore}`,
  );
  console.log(`  Average best combo:       ${r(s.avgBestCombo, 2)}`);
  console.log(`  Board clears per game:    ${r(s.avgAllClears, 3)}`);
  console.log(
    `  Died on a fresh hand:     ${s.deadFreshHands} / ${s.games} (${r((100 * s.deadFreshHands) / s.games)}%)`,
  );
  const series = (rec: Record<number, number>, scale: number, d: number) =>
    Object.entries(rec)
      .filter(([m]) => Number(m) % 20 === 0 || Number(m) === 10)
      .map(([m, v]) => `${m}:${r(scale * v, d)}`)
      .join('  ');
  console.log(`  Board fill % by move:     ${series(s.fillByMove, 100, 0)}`);
  console.log(`  Difficulty by move:       ${series(s.difficultyByMove, 1, 2)}`);
  console.log(`  Final difficulty (avg):   ${r(s.avgFinalDifficulty, 2)}`);
  console.log(`  Redraws per deal:         ${r(s.redrawsPerDeal, 3)}`);
  console.log(`  Mercy rule fired:         ${r(100 * s.mercyRate)}% of deals`);
  console.log(`  Fallbacks:                ${r(100 * s.fallbackRate, 2)}% of deals`);
  console.log(
    `  Assist:                   chance ${r(100 * s.avgAssistP)}% avg, helped ${r(100 * s.assistRate)}% of deals` +
      ` (piece ${r(100 * s.assistPieceRate)}%, hand ${r(100 * s.assistHandRate)}%,` +
      ` piece after hand ${r(100 * s.assistPieceFallbackRate)}%)`,
  );

  // Deal latency on realistic boards (best of 3 per board, after a warm-up).
  const inputs = collectDealInputs(30);
  const gen = new Generator(new Mulberry32(1).next);
  for (const i of inputs) gen.deal(i.rows, i.ctx);
  const times = inputs
    .map((i) => {
      let best = Infinity;
      for (let k = 0; k < 3; k++) {
        const t0 = performance.now();
        gen.deal(i.rows, i.ctx);
        best = Math.min(best, performance.now() - t0);
      }
      return best;
    })
    .sort((a, b) => a - b);
  const q = (p: number) => r(times[Math.floor(p * (times.length - 1))]!, 3);
  console.log(`  Deal latency (ms):        p50 ${q(0.5)}  p99 ${q(0.99)}  max ${q(1)}`);
}
