import { test, expect } from './fixtures';
import { lastFeedback, openGame, playClearing, snapshot } from './helpers';

// Seeds found by searching in Node with the same most-lines policy as playClearing:
// seed 92 reaches combo 2 on move 4; seed 67 clears 2 lines at once on move 4.

test('a seeded line clear and combo: popup, praise, combo badge, sounds', async ({ page }) => {
  await openGame(page, 92);
  await playClearing(page, 4);
  const snap = await snapshot(page);
  expect(snap.combo).toBeGreaterThanOrEqual(2);

  const fb = (await lastFeedback(page))!;
  expect(fb.popup).not.toBeNull();
  expect(fb.popup!.combo).toBe(`Combo ×${snap.combo}`);
  expect(fb.popup!.points).toMatch(/^\+\d+$/);
  expect(fb.sounds).toContainEqual({ kind: 'clear', lines: expect.any(Number), combo: snap.combo });

  await expect(page.locator('#combo-wrap')).toBeVisible();
  await expect(page.locator('#combo')).toHaveText(`Combo ×${snap.combo}`);
  await expect(page.locator('#score')).toHaveText(String(snap.score));
});

test('a 2-line clear shakes the screen', async ({ page }) => {
  await openGame(page, 67);
  await playClearing(page, 4);
  const fb = (await lastFeedback(page))!;
  expect(fb.popup?.praise).toBe('Good');
  expect(fb.shake).toBeGreaterThan(0);
});

test.describe('with prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the same 2-line clear does not shake and uses fewer particles', async ({ page }) => {
    await openGame(page, 67);
    await playClearing(page, 4);
    const fb = (await lastFeedback(page))!;
    expect(fb.popup?.praise).toBe('Good');
    expect(fb.shake).toBe(0);
    expect(fb.particlesPerCell).toBe(1);
  });
});
