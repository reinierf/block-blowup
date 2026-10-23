import { test, expect } from './fixtures';
import {
  continueGame,
  dragToCell,
  firstFit,
  holdOverCell,
  nearlyOverSave,
  openApp,
  openGame,
  playFirstFit,
  snapshot,
} from './helpers';

test('start screen → New game starts the seeded game', async ({ page }) => {
  await openApp(page, 7);
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#continue')).toBeHidden(); // nothing saved yet
  // Test mode freezes effects: the intro is skipped and the halo's rays stand still.
  await expect(page.locator('#start')).not.toHaveClass(/intro/);
  await expect(page.locator('html')).toHaveClass(/reduce-motion/);
  await page.click('#play');
  await expect(page.locator('#start')).toBeHidden();
  const snap = await snapshot(page);
  expect(snap.seed).toBe(7);
  expect(snap.score).toBe(0);
});

test('reloading mid-game and tapping Continue resumes the same game', async ({ page }) => {
  await openGame(page, 3);
  await playFirstFit(page, 4);
  const before = await snapshot(page);
  expect(before.score).toBeGreaterThan(0);

  await page.reload();
  await page.waitForFunction(() => !!window.__blowup?.layout());
  await expect(page.locator('#continue')).toBeVisible();
  await expect(page.locator('#continue-score')).toHaveText(String(before.score));
  await continueGame(page);
  const after = await snapshot(page);
  expect(after.board).toEqual(before.board);
  expect(after.hand).toEqual(before.hand);
  expect(after.score).toBe(before.score);
  expect(after.combo).toBe(before.combo);
  await expect(page.locator('#score')).toHaveText(String(before.score));

  // And it keeps playing: the next deal matches what the game would have dealt anyway.
  await playFirstFit(page, 3);
  expect((await snapshot(page)).status).toBe('playing');
});

test('game over shows the score screen with "New best!"', async ({ page }) => {
  await page.addInitScript((save) => {
    localStorage.setItem('block-blowup.highscore', '100');
    localStorage.setItem('block-blowup.game', JSON.stringify(save));
  }, nearlyOverSave(500));
  await openApp(page);
  await continueGame(page);
  expect((await snapshot(page)).fits).toEqual([true, false, false]);

  await dragToCell(page, 0, 0, 0);
  await expect(page.locator('#overlay')).toBeVisible();
  await expect(page.locator('#new-best')).toBeVisible();
  await expect(page.locator('#over-score')).toHaveText('501');
  await expect(page.locator('#over-best')).toHaveText('501');
  expect((await snapshot(page)).status).toBe('gameOver');
  // The finished game is no longer saved.
  expect(await page.evaluate(() => localStorage.getItem('block-blowup.game'))).toBeNull();

  await page.click('#restart');
  await expect(page.locator('#overlay')).toBeHidden();
  expect((await snapshot(page)).score).toBe(0);
});

test('game over below the best score: no "New best!"', async ({ page }) => {
  await page.addInitScript((save) => {
    localStorage.setItem('block-blowup.highscore', '9999');
    localStorage.setItem('block-blowup.game', JSON.stringify(save));
  }, nearlyOverSave(500));
  await openApp(page);
  await continueGame(page);
  await dragToCell(page, 0, 0, 0);
  await expect(page.locator('#overlay')).toBeVisible();
  await expect(page.locator('#new-best')).toBeHidden();
});

test('game over → Menu: no Continue for the fresh, untouched game', async ({ page }) => {
  await page.addInitScript((save) => {
    localStorage.setItem('block-blowup.game', JSON.stringify(save));
  }, nearlyOverSave(500));
  await openApp(page);
  await continueGame(page);
  await dragToCell(page, 0, 0, 0);
  await expect(page.locator('#overlay')).toBeVisible();
  await page.click('#to-menu');
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#continue')).toBeHidden();
});

test('game over waits before the score screen; a tap skips the rest', async ({ page }) => {
  await page.addInitScript((save) => {
    localStorage.setItem('block-blowup.game', JSON.stringify(save));
  }, nearlyOverSave(500));
  // animate=1: the real game-over sequence (about 3.7 s for this board, longer in software
  // WebGL), not the frozen one. The tap comes well before its end, so only a skip shows
  // the score screen within a second of it.
  await page.goto('./?seed=1&test=1&animate=1');
  await page.waitForFunction(() => !!window.__blowup?.layout());
  await continueGame(page);
  await dragToCell(page, 0, 0, 0);
  expect((await snapshot(page)).status).toBe('gameOver');
  await expect(page.locator('#overlay')).toBeHidden();

  const b = (await page.evaluate(() => window.__blowup!.layout()))!.board;
  await page.mouse.click(b.x + b.size / 2, b.y + b.size / 2);
  await expect(page.locator('#overlay')).toBeVisible({ timeout: 1000 });
});

test('settings persist across reloads', async ({ page }) => {
  await openApp(page);
  await page.click('#start-settings');
  await expect(page.locator('#settings')).toBeVisible();
  const sound = page.locator('#set-sound');
  await expect(sound).toBeChecked();
  await sound.uncheck({ force: true });
  await page.locator('input[name="motion"][value="on"]').check({ force: true });
  // No Vibration API (WebKit/iOS): the toggle is disabled, with a note, and stays untouched.
  const haptics = page.locator('#set-haptics');
  const canVibrate = await haptics.isEnabled();
  await expect(page.locator('#haptics-note')).toBeVisible({ visible: !canVibrate });
  if (canVibrate) await haptics.uncheck({ force: true });
  await page.click('#settings-done');
  await expect(page.locator('#start')).toBeVisible();

  await page.reload();
  await page.waitForFunction(() => !!window.__blowup?.layout());
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('block-blowup.settings')!),
  );
  expect(stored.muted).toBe(true);
  expect(stored.reducedMotion).toBe('on');
  expect(stored.haptics).toBe(!canVibrate);

  await page.click('#start-settings');
  await expect(page.locator('#set-sound')).not.toBeChecked();
  await expect(page.locator('input[name="motion"][value="on"]')).toBeChecked();
});

test('settings opened from the HUD return to the game', async ({ page }) => {
  await openGame(page, 1);
  await page.click('#open-settings');
  await expect(page.locator('#settings')).toBeVisible();
  await page.click('#settings-done');
  await expect(page.locator('#settings')).toBeHidden();
  await expect(page.locator('#start')).toBeHidden();
});

test('settings opened from the start screen have no pause actions', async ({ page }) => {
  await openApp(page);
  await page.click('#start-settings');
  await expect(page.locator('#pause-actions')).toBeHidden();
  await expect(page.locator('#settings-done')).toHaveText('Done');
});

test('pause menu → Menu keeps the game saved; Continue resumes it', async ({ page }) => {
  await openGame(page, 3);
  await playFirstFit(page, 3);
  const before = await snapshot(page);
  await page.click('#open-settings');
  await expect(page.locator('#settings-done')).toHaveText('Resume');
  await page.click('#pause-menu');
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#settings')).toBeHidden();
  await expect(page.locator('#continue-score')).toHaveText(String(before.score));

  await continueGame(page);
  const after = await snapshot(page);
  expect(after.board).toEqual(before.board);
  expect(after.score).toBe(before.score);
  // The menu and game entries were both popped: Back now goes to the start screen once.
  await page.goBack();
  await expect(page.locator('#start')).toBeVisible();
});

test('pause menu → Restart takes a second tap', async ({ page }) => {
  await openGame(page, 3);
  await playFirstFit(page, 3);
  const before = await snapshot(page);
  await page.click('#open-settings');
  await page.click('#pause-restart');
  await expect(page.locator('#pause-restart')).toHaveText('Tap again');
  expect((await snapshot(page)).score).toBe(before.score);
  await page.click('#pause-restart');
  await expect(page.locator('#settings')).toBeHidden();
  await expect(page.locator('#start')).toBeHidden();
  expect((await snapshot(page)).score).toBe(0);

  // Reopened, Restart asks again.
  await page.click('#open-settings');
  await expect(page.locator('#pause-restart')).toHaveText('Restart');
  await page.click('#settings-done');
  // Settings left no stale entry: one Back reaches the start screen.
  await page.goBack();
  await expect(page.locator('#start')).toBeVisible();
});

test('Back closes Settings, then goes from the game to the start screen', async ({ page }) => {
  await openGame(page, 3);
  await playFirstFit(page, 2);
  const before = await snapshot(page);
  await page.click('#open-settings');
  await page.goBack();
  await expect(page.locator('#settings')).toBeHidden();
  await expect(page.locator('#start')).toBeHidden();

  await page.goBack();
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#continue-score')).toHaveText(String(before.score));
  await continueGame(page);
  expect((await snapshot(page)).board).toEqual(before.board);
});

test('Back mid-drag drops the piece without placing it', async ({ page }) => {
  await openGame(page, 3);
  const before = await snapshot(page);
  const { col, row } = firstFit(before, 0);
  await holdOverCell(page, 0, col, row);
  await page.goBack();
  await expect(page.locator('#start')).toBeVisible();
  await page.mouse.up();
  const after = await snapshot(page);
  expect(after.board).toEqual(before.board);
  expect(after.hand).toEqual(before.hand);
});

test('Back closes Settings opened from the start screen', async ({ page }) => {
  await openApp(page);
  await page.click('#start-settings');
  await page.goBack();
  await expect(page.locator('#settings')).toBeHidden();
  await expect(page.locator('#start')).toBeVisible();
});
