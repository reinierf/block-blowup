import { test as base, expect } from '@playwright/test';

/**
 * Every e2e test fails on any console error or uncaught exception.
 * Import `test` and `expect` from here instead of '@playwright/test'.
 */
export const test = base.extend<{ failOnConsoleErrors: undefined }>({
  failOnConsoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
      });
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
      await use(undefined);
      expect(errors, 'console errors / uncaught exceptions').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
