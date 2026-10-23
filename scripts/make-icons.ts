// scripts/make-icons.ts
// `npm run icons`: render the app icons from an SVG drawn in the theme's colours.
// Output (committed): public/icons/{icon-192,icon-512,apple-touch-icon}.png, public/favicon.svg.
// The artwork stays inside the central 80% so the icons work as maskable icons.

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { shade, theme } from '../src/render/theme';

/** shade() as a CSS colour. */
const css = (hex: string, amount: number) => `#${shade(hex, amount).toString(16).padStart(6, '0')}`;

/**
 * A 3×3 arrangement of bevelled blocks on the background gradient, drawn like the game's
 * blocks. The favicon (rounded) fills more of the square so it reads at tab size.
 */
function iconSvg(size: number, rounded: boolean): string {
  const s = size;
  const cell = s * (rounded ? 0.28 : 0.2);
  const gap = s * 0.02;
  const origin = (s - 3 * cell - 2 * gap) / 2;
  const pattern: (keyof typeof theme.blocks | null)[] = [
    'red',
    'yellow',
    null,
    'red',
    'cyan',
    'cyan',
    'green',
    'orange',
    'purple',
  ];
  const blocks = pattern
    .map((c, i) => {
      if (!c) return '';
      const x = origin + (i % 3) * (cell + gap);
      const y = origin + Math.floor(i / 3) * (cell + gap);
      const r = cell * 0.16;
      const b = cell * 0.09;
      const hex = theme.blocks[c];
      return `
        <rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${r}" fill="${css(hex, -theme.bevelDark)}"/>
        <rect x="${x}" y="${y}" width="${cell - b}" height="${cell - b}" rx="${r}" fill="${css(hex, theme.bevelLight)}"/>
        <rect x="${x + b}" y="${y + b}" width="${cell - 2 * b}" height="${cell - 2 * b}" rx="${r * 0.75}" fill="${hex}"/>
        <rect x="${x + b * 1.6}" y="${y + b * 1.4}" width="${cell - 3.2 * b}" height="${(cell - 2 * b) * 0.38}" rx="${r * 0.5}" fill="#fff" fill-opacity="${theme.gloss}"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${theme.bgTop}"/><stop offset="1" stop-color="${theme.bgBottom}"/>
    </linearGradient></defs>
    <rect width="${s}" height="${s}" rx="${rounded ? s * 0.2 : 0}" fill="url(#bg)"/>
    ${blocks}
  </svg>`;
}

async function main(): Promise<void> {
  mkdirSync('public/icons', { recursive: true });
  writeFileSync('public/favicon.svg', iconSvg(64, true));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size] of [
    ['icon-192', 192],
    ['icon-512', 512],
    ['apple-touch-icon', 180],
  ] as const) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${iconSvg(size, false)}</body></html>`,
    );
    await page.screenshot({ path: `public/icons/${name}.png`, omitBackground: false });
    console.log(`public/icons/${name}.png`);
  }
  await browser.close();
}

await main();
