// scripts/simulate.ts
// `npm run sim [-- --from 1 --to 300]`: play seeded games with the greedy bot and print stats.
// `npm run sim:update`: rewrite tests/sim-snapshot.json from the current rules.

import { writeFileSync } from 'node:fs';
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
  console.log(
    `  Died on a fresh hand:     ${s.deadFreshHands} / ${s.games} (${r((100 * s.deadFreshHands) / s.games)}%)`,
  );
  console.log(
    `  Board fill by move:       ${Object.entries(s.fillByMove)
      .map(([m, f]) => `${m}:${r(100 * f, 0)}%`)
      .join('  ')}`,
  );
}
