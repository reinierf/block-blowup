/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { theme } from './src/render/theme';

// GitHub Pages serves the site from /<repo>/, so production builds need that base path.
const PAGES_BASE = '/block-blast/';

export default defineConfig(({ command, isPreview }) => ({
  // `vite preview` serves a build, so it needs the same base path.
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  server: { host: true, port: 5173 },
  // Pre-bundle Pixi at startup so the first page load isn't interrupted by a dep re-optimise.
  optimizeDeps: { include: ['pixi.js'] },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022' },
  plugins: [
    VitePWA({
      // Never reload mid-game: a waiting update shows an "Update available" prompt instead.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Block Blowup',
        short_name: 'Blowup',
        description: 'Drag blocks, clear lines, beat your high score.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: theme.bgTop,
        background_color: theme.bgBottom,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache everything the game needs, so it runs fully offline.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
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
