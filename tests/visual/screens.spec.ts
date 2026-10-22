import { test, expect } from '../e2e/fixtures';
import {
  clearingMove,
  dragToCell,
  firstFit,
  holdOverCell,
  openGame,
  playFirstFit,
  snapshot,
} from '../e2e/helpers';

// Seeded, frozen states. Baselines are rendered on Linux in the pinned Playwright image;
// update them on purpose with `npm run e2e:visual:update`, in the same commit as the change.

test('new game', async ({ page }) => {
  await openGame(page, 1);
  await expect(page).toHaveScreenshot('new-game.png');
});

test('mid-game board', async ({ page }) => {
  await openGame(page, 1);
  for (let move = 0; move < 7; move++) {
    const snap = await snapshot(page);
    const slot = snap.hand.findIndex((p) => p !== null);
    const { col, row } = firstFit(snap, slot);
    await dragToCell(page, slot, col, row);
  }
  await expect(page).toHaveScreenshot('mid-game.png');
});

test('line-clear preview during a drag', async ({ page }) => {
  await openGame(page, 1);
  // Play first-fit moves until some move would clear a line, then hover it without dropping.
  for (let i = 0; i < 40; i++) {
    const snap = await snapshot(page);
    const m = clearingMove(snap);
    if (m.lines > 0) {
      await holdOverCell(page, m.slot, m.col, m.row);
      await expect(page).toHaveScreenshot('line-clear-preview.png');
      await page.mouse.up();
      return;
    }
    await playFirstFit(page, 1);
  }
  throw new Error('no clearing move found within 40 moves');
});

test('greyed-out tray piece', async ({ page }) => {
  await openGame(page, 298);
  await playFirstFit(page, 10);
  await expect(page).toHaveScreenshot('greyed-out-piece.png');
});
