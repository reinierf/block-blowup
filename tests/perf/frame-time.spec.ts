import { test, expect } from '../e2e/fixtures';
import { dragToCell, snapshot } from '../e2e/helpers';
import type { BlowupSnapshot } from '../../src/test-hook';

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

/** The move that completes the most lines (ties: first found), so the run includes clears. */
function clearingMove(snap: BlowupSnapshot): { slot: number; col: number; row: number } {
  let best = { slot: -1, col: 0, row: 0, lines: -1 };
  snap.hand.forEach((p, slot) => {
    if (!p) return;
    for (let row = 0; row + p.h <= 8; row++) {
      for (let col = 0; col + p.w <= 8; col++) {
        if (!p.cells.every(([x, y]) => snap.board[row + y]![col + x] === '.')) continue;
        const filled = snap.board.map((r) => [...r].map((c) => c !== '.'));
        for (const [x, y] of p.cells) filled[row + y]![col + x] = true;
        let lines = filled.filter((r) => r.every(Boolean)).length;
        for (let x = 0; x < 8; x++) if (filled.every((r) => r[x])) lines++;
        if (lines > best.lines) best = { slot, col, row, lines };
      }
    }
  });
  return best;
}

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
