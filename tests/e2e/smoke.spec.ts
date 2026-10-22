import { test, expect } from './fixtures';

test('page loads with a drawn canvas', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('Block Blowup');
  const canvas = page.locator('canvas#game');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(100);
  expect(box?.height).toBeGreaterThan(100);
});
