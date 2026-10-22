import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

/**
 * Projects:
 * - pixel-7, iphone-14, desktop-chromium: end-to-end tests (tests/e2e).
 * - visual: screenshot baselines (tests/visual). Only with VISUAL=1, because baselines are
 *   rendered on Linux in the pinned Playwright image (CI, or `npm run e2e:visual`).
 * - perf: frame-time measurement (tests/perf). Only with PERF=1 (nightly job).
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
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
