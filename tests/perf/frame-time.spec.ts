import { test, expect } from '../e2e/fixtures';
import { clearingMove, dragToCell, snapshot } from '../e2e/helpers';

/**
 * Alert threshold for the 95th-percentile frame time (HANDOVER.md §3.7, item 7).
 *
 * What is measured: main-thread time to produce each drawn frame (game state → Pixi scene →
 * WebGL commands), with the CPU throttled 4× to approximate a mid-range phone. Wall-clock
 * frame intervals are not useful here: CI has no GPU, so Chromium rasterises WebGL in
 * software (SwiftShader) at ~50 ms per frame even when idle, which says nothing about a
 * phone's GPU.
 */
const P95_BUDGET_MS = 20;
const DURATION_MS = 10_000;

test('frame cost while dragging and clearing, CPU throttled 4×', async ({ page }, info) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // animate=1 keeps effects running in test mode, so clears cost what they cost.
  await page.goto('./?seed=5&test=1&animate=1');
  await page.waitForFunction(() => !!window.__blowup?.layout());

  await page.evaluate(() => window.__blowup!.takeFrameCosts());

  const end = Date.now() + DURATION_MS;
  let moves = 0;
  while (Date.now() < end) {
    const snap = await snapshot(page);
    if (snap.status === 'gameOver') {
      await page.click('#restart');
      continue;
    }
    const m = clearingMove(snap);
    await dragToCell(page, m.slot, m.col, m.row);
    moves++;
  }

  const frames = await page.evaluate(() => window.__blowup!.takeFrameCosts());
  const sorted = [...frames].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))]!;
  const report = {
    frames: frames.length,
    moves,
    p50: +q(0.5).toFixed(2),
    p95: +q(0.95).toFixed(2),
    max: +q(1).toFixed(2),
  };
  console.log('frame cost (ms):', JSON.stringify(report));
  await info.attach('frame-costs.json', { body: JSON.stringify(report, null, 2) });
  expect(moves).toBeGreaterThan(5);
  expect(report.p95, `p95 frame time above ${P95_BUDGET_MS} ms`).toBeLessThan(P95_BUDGET_MS);
});
