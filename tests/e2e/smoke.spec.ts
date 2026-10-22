import { test, expect } from './fixtures';

test('page loads with a full-viewport canvas', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('Block Blowup');
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
