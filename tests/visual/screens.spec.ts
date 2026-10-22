import { test, expect } from '../e2e/fixtures';
import { dragToCell, firstFit, openGame, snapshot } from '../e2e/helpers';

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
