import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;
/** Preview of a test-mode production build (service worker, precache, manifest). */
const PWA_PORT = 4174;
export const PWA_DIST = 'dist-test';

/**
 * Projects:
 * - pixel-7, iphone-14, desktop-chromium: end-to-end tests (tests/e2e).
 * - visual: screenshot baselines (tests/visual). Only with VISUAL=1, because baselines are
 *   rendered on Linux in the pinned Playwright image (CI, or `npm run e2e:visual`).
 * - perf: frame-time measurement (tests/perf). Only with PERF=1 (nightly job).
 * - pwa: manifest, service worker, offline, update prompt (tests/pwa), against `vite preview`
 *   of a `--mode test` build. Chromium only: Playwright's WebKit has no service workers.
 */
const visual = process.env.VISUAL === '1';
const perf = process.env.PERF === '1';

export default defineConfig({
  fullyParallel: true,
  // Each browser renders WebGL in software; parallel browsers starve each other and time out.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  // Baselines render deterministically in the pinned image, so the tolerance is tight.
  expect: { toHaveScreenshot: { maxDiffPixels: 50, scale: 'css', animations: 'disabled' } },
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'pixel-7', testDir: 'tests/e2e', use: { ...devices['Pixel 7'] } },
    { name: 'iphone-14', testDir: 'tests/e2e', use: { ...devices['iPhone 14'] } },
    { name: 'desktop-chromium', testDir: 'tests/e2e', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'pwa',
      testDir: 'tests/pwa',
      use: { ...devices['Pixel 7'], baseURL: `http://localhost:${PWA_PORT}/block-blast/` },
    },
    ...(visual
      ? [{ name: 'visual', testDir: 'tests/visual', use: { ...devices['Pixel 7'] } }]
      : []),
    ...(perf
      ? [
          {
            name: 'perf',
            testDir: 'tests/perf',
            timeout: 120_000,
            use: { ...devices['Pixel 7'] },
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: `npx vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        `npx vite build --mode test --outDir ${PWA_DIST} --emptyOutDir && ` +
        `npx vite preview --outDir ${PWA_DIST} --port ${PWA_PORT} --strictPort`,
      url: `http://localhost:${PWA_PORT}/block-blast/`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
