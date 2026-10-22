import { test, expect } from './fixtures';
import { openGame } from './helpers';

test('the start screen is there before any script runs', async ({ browser, baseURL }) => {
  const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const p = await noJs.newPage();
  await p.goto('./');
  await expect(p.locator('#start')).toBeVisible();
  await expect(p.locator('#play')).toBeVisible();
  await noJs.close();
});

test('starting a game creates a full-viewport canvas', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('Block Blowup');
  await expect(page.locator('canvas#game')).toHaveCount(0); // renderer loads on demand
  await openGame(page, 1);
  const canvas = page.locator('canvas#game');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  const vp = page.viewportSize()!;
  expect(box?.width).toBeCloseTo(vp.width, 0);
  expect(box?.height).toBeCloseTo(vp.height, 0);
});

test('the viewport allows zoom and covers the notch', async ({ page }) => {
  await page.goto('./');
  const content = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(content).toContain('viewport-fit=cover');
  expect(content).not.toContain('user-scalable=no');
  expect(content).not.toContain('maximum-scale');
});
