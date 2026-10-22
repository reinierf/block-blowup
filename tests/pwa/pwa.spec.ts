import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { test, expect } from '../e2e/fixtures';
import { dragToCell, firstFit, snapshot } from '../e2e/helpers';
import { PWA_DIST } from '../../playwright.config';
import { theme } from '../../src/render/theme';
import type { Page } from '@playwright/test';

/** Load the app and wait until a service worker controls the page. */
async function openControlled(page: Page): Promise<void> {
  await page.goto('./?seed=1&test=1');
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
  }
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.waitForFunction(() => !!window.__blowup?.layout());
}

test('the manifest has the required fields and its icons load', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifestUrl = new URL(href!, page.url()).toString();
  const manifest = await (await request.get(manifestUrl)).json();
  expect(manifest).toMatchObject({
    name: 'Block Blowup',
    short_name: 'Blowup',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: theme.bgTop,
    background_color: theme.bgBottom,
  });
  const icons = manifest.icons as { src: string; sizes: string; purpose: string }[];
  for (const size of ['192x192', '512x512']) {
    expect(icons.some((i) => i.sizes === size && i.purpose.includes('maskable'))).toBe(true);
    expect(icons.some((i) => i.sizes === size && i.purpose.includes('any'))).toBe(true);
  }
  for (const icon of icons) {
    const res = await request.get(new URL(icon.src, manifestUrl).toString());
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  }
  // iOS: touch icon and standalone meta tags.
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await request.get(new URL(touch!, page.url()).toString())).status()).toBe(200);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes',
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveCount(1);
});

test('the service worker registers and controls the page', async ({ page }) => {
  await openControlled(page);
  const script = await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL);
  expect(script).toMatch(/\/block-blowup\/sw\.js$/);
});

test('works offline: reload and play', async ({ page, context }) => {
  await openControlled(page);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => !!window.__blowup?.layout());
  await page.click('#play');
  const snap = await snapshot(page);
  const { col, row } = firstFit(snap, 0);
  await dragToCell(page, 0, col, row);
  expect((await snapshot(page)).score).toBeGreaterThan(0);
  await context.setOffline(false);
});

test('a waiting update shows the prompt instead of reloading', async ({ page }) => {
  await openControlled(page);
  await expect(page.locator('#update')).toBeHidden();
  const swPath = `${PWA_DIST}/sw.js`;
  const original = readFileSync(swPath, 'utf8');
  try {
    // A byte-different sw.js is a new version: it installs, then waits for the page.
    appendFileSync(swPath, `\n// update ${Date.now()}\n`);
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    await expect(page.locator('#update')).toBeVisible({ timeout: 15_000 });
    // Nothing reloaded on its own: still the same page, game untouched.
    expect(await page.evaluate(() => !!window.__blowup)).toBe(true);
  } finally {
    writeFileSync(swPath, original);
  }
});
