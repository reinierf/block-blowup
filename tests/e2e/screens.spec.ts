import { test, expect } from './fixtures';
import {
  continueGame,
  dragToCell,
  nearlyOverSave,
  openApp,
  openGame,
  playFirstFit,
  snapshot,
} from './helpers';

test('start screen → Play starts the seeded game', async ({ page }) => {
  await openApp(page, 7);
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#continue')).toBeHidden(); // nothing saved yet
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
  await expect(page.locator('#overlay-msg')).toContainText('Score 501');
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
