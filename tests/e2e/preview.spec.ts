import { test, expect } from './fixtures';
import { dragFromSlot, layout, openGame, playFirstFit, snapshot } from './helpers';

test('a tray piece that fits nowhere is greyed out and cannot be dragged', async ({ page }) => {
  // Seed 808 under the first-fit policy: after 10 moves, slot 1 (square3) fits nowhere while
  // the game goes on (found with the generator in Node; same logic runs in the browser).
  await openGame(page, 808);
  await playFirstFit(page, 10);
  const before = await snapshot(page);
  expect(before.status).toBe('playing');
  expect(before.hand[1]?.name).toBe('square3');
  expect(before.fits[1]).toBe(false);

  const l = await layout(page);
  await dragFromSlot(page, 1, { x: l.board.x + l.board.size / 2, y: l.board.y + l.board.size / 2 });
  const after = await snapshot(page);
  expect(after.hand).toEqual(before.hand);
  expect(after.board).toEqual(before.board);
});
