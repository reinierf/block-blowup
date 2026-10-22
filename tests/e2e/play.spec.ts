import { test, expect } from './fixtures';
import { dragFromSlot, dragToCell, firstFit, layout, openGame, snapshot } from './helpers';

test.describe('drag and drop', () => {
  test('dragging a piece onto the board places it and scores', async ({ page }) => {
    await openGame(page, 1);
    const before = await snapshot(page);
    expect(before.score).toBe(0);
    const piece = before.hand[0]!;
    const { col, row } = firstFit(before, 0);

    await dragToCell(page, 0, col, row);

    const after = await snapshot(page);
    expect(after.hand[0]).toBeNull();
    expect(after.score).toBe(piece.cells.length);
    for (const [x, y] of piece.cells) {
      expect(after.board[row + y]![col + x]).toBe(piece.color[0]);
    }
    await expect(page.locator('#score')).toHaveText(String(piece.cells.length));
  });

  test('dropping outside the drop tolerance returns the piece to the tray', async ({ page }) => {
    await openGame(page, 2);
    const before = await snapshot(page);
    const l = await layout(page);
    // Into the HUD area, far above the board.
    await dragFromSlot(page, 1, { x: l.board.x + l.board.size / 2, y: l.hud.y + l.hud.h / 2 });
    const after = await snapshot(page);
    expect(after.hand).toEqual(before.hand);
    expect(after.board).toEqual(before.board);
    expect(after.score).toBe(0);
  });

  test('dropping onto an occupied spot is rejected', async ({ page }) => {
    await openGame(page, 3);
    const first = await snapshot(page);
    const fit = firstFit(first, 0);
    await dragToCell(page, 0, fit.col, fit.row);
    const mid = await snapshot(page);
    // Find an in-bounds position for piece 1 that overlaps a filled cell.
    const p = mid.hand[1]!;
    let target: { col: number; row: number } | null = null;
    for (let row = 0; row + p.h <= 8 && !target; row++) {
      for (let col = 0; col + p.w <= 8 && !target; col++) {
        if (p.cells.some(([x, y]) => mid.board[row + y]![col + x] !== '.')) target = { col, row };
      }
    }
    expect(target).not.toBeNull();
    await dragToCell(page, 1, target!.col, target!.row);
    const after = await snapshot(page);
    expect(after.hand[1]).toEqual(p);
    expect(after.board).toEqual(mid.board);
    expect(after.score).toBe(mid.score);
  });
});

test('the combo badge is hidden until a combo of 2', async ({ page }) => {
  await openGame(page, 1);
  await expect(page.locator('#combo-wrap')).toBeHidden();
});

test('the test hook is read-only', async ({ page }) => {
  await openGame(page, 1);
  const stillThere = await page.evaluate(() => {
    try {
      (window as unknown as { __blowup: unknown }).__blowup = null;
    } catch {
      /* strict-mode assignment to a read-only property */
    }
    return !!window.__blowup && Object.isFrozen(window.__blowup);
  });
  expect(stillThere).toBe(true);
});
