/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo>/, so production builds need that base path.
const PAGES_BASE = '/block-blast/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? PAGES_BASE : '/',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022' },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: { name: 'module', include: ['tests/module/**/*.test.ts'], environment: 'happy-dom' },
      },
      {
        extends: true,
        test: {
          name: 'sim',
          include: ['tests/sim/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/game/**/*.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 90, branches: 90 },
    },
  },
}));
