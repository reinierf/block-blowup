// src/render/theme.ts
// Every colour in the game lives here. The default theme, VIVID, follows the original's
// look: royal-blue background, dark navy board, saturated blocks with strong bevels.
// SUBDUED is the calmer variant from HANDOVER.md §3.5 (lower saturation, softer gloss).
// NEON is a dark variant: near-black background, blocks drawn as glowing fluorescent tubes.
// Settings switches between them at runtime (setTheme); `?theme=neon|vivid|subdued` also
// picks one. The choice is remembered, so the installed PWA follows.

import type { PieceColor } from '../game/pieces';

export interface Theme {
  /** Page background: vertical gradient, top → bottom. */
  bgTop: string;
  bgBottom: string;
  boardPanel: string;
  /** Outline around the board panel; defaults to a darker shade of the panel. */
  boardRim?: string;
  emptyCell: string;
  text: string;
  textSecondary: string;
  /** Combo, praise, highlights. */
  accent: string;
  /** Translucent backing (debug readout). Screens blur the game instead of a scrim. */
  scrim: string;
  /** Drop shadow behind the score (offset to the bottom right). */
  scoreShadow: string;
  /** Particles behind newly dealt tray pieces. */
  dealSparkle: string;
  /** Button fill and its text. */
  button: string;
  buttonText: string;
  /** Ghost preview outline when a drop would be legal / illegal. */
  ghostValid: string;
  ghostInvalid: string;
  /** Blocks greyed out by the game-over sequence. */
  gameOverBlock: string;
  blocks: Record<PieceColor, string>;
  /** Bevel strength: how far the top-left edge lightens and the bottom-right darkens (0–1). */
  bevelLight: number;
  bevelDark: number;
  /** Opacity of the soft gloss on the upper half of a block. */
  gloss: number;
  /** Opacity of a thin white outline just inside each block (0 = none). */
  rim: number;
  /** Opacity of a coloured halo around each block and the board rim (0 = none). */
  glow: number;
  /** How blocks are drawn: bevelled squares (default) or neon tube outlines. */
  blockStyle?: 'bevel' | 'tube';
  /** Extra CSS text-shadow on the score and titles, e.g. a neon glow. */
  textGlow?: string;
}

export const SUBDUED: Theme = {
  bgTop: '#1E2A44',
  bgBottom: '#18223A',
  boardPanel: '#141C30',
  emptyCell: '#212C47',
  text: '#E6EAF2',
  textSecondary: '#9AA6BF',
  accent: '#F2C46D',
  scrim: 'rgba(10, 14, 26, 0.72)',
  scoreShadow: 'rgba(0, 0, 0, 0.3)',
  dealSparkle: '#E6EAF2',
  button: '#72B77A',
  buttonText: '#10182A',
  ghostValid: '#E6EAF2',
  ghostInvalid: '#D46A63',
  gameOverBlock: '#4A546B',
  blocks: {
    red: '#D46A63',
    orange: '#DB8F5A',
    yellow: '#D9BC62',
    green: '#72B77A',
    cyan: '#5DB3C4',
    blue: '#5F86D0',
    purple: '#9578C2',
  },
  bevelLight: 0.16,
  bevelDark: 0.2,
  gloss: 0.1,
  rim: 0,
  glow: 0,
};

export const VIVID: Theme = {
  bgTop: '#1c49c7',
  /** A lighter tint of bgTop (top-to-bottom gradient). */
  bgBottom: '#6d89d5',
  boardPanel: '#1C2754',
  emptyCell: '#243163',
  text: '#FFFFFF',
  textSecondary: '#C9D4F2',
  accent: '#FFC83D',
  scrim: 'rgba(15, 22, 52, 0.72)',
  scoreShadow: 'rgba(10, 16, 48, 0.35)',
  dealSparkle: '#FFFFFF',
  button: '#5DCB48',
  buttonText: '#0F1A3A',
  ghostValid: '#FFFFFF',
  ghostInvalid: '#EE4B45',
  gameOverBlock: '#5A6588',
  blocks: {
    red: '#EE4B45',
    orange: '#F5902E',
    yellow: '#F8CB3A',
    green: '#5DCB48',
    cyan: '#3CC7EE',
    blue: '#3E72E6',
    purple: '#A05BDE',
  },
  bevelLight: 0.3,
  bevelDark: 0.32,
  gloss: 0.18,
  rim: 0,
  glow: 0,
};

export const NEON: Theme = {
  bgTop: '#05030F',
  bgBottom: '#12062A',
  boardPanel: '#06051A',
  boardRim: '#FF2BD6',
  emptyCell: '#0B0A22',
  text: '#FFFFFF',
  textSecondary: '#B9B4F0',
  accent: '#FF2BD6',
  scrim: 'rgba(4, 3, 14, 0.78)',
  scoreShadow: 'rgba(0, 0, 0, 0)',
  dealSparkle: '#FFFFFF',
  button: '#00FF85',
  buttonText: '#06051A',
  ghostValid: '#FFFFFF',
  ghostInvalid: '#FF1F4F',
  gameOverBlock: '#34345A',
  blocks: {
    red: '#FF1F4F',
    orange: '#FF7A00',
    yellow: '#EEFF00',
    green: '#00FF85',
    cyan: '#00F0FF',
    blue: '#4D8CFF',
    purple: '#B026FF',
  },
  bevelLight: 0.7,
  bevelDark: 0.3,
  gloss: 0.5,
  rim: 0.9,
  glow: 1,
  blockStyle: 'tube',
  textGlow: '0 0 3px #FF2BD6, 0 0 10px #FF2BD6, 0 0 24px rgba(255, 43, 214, 0.7)',
};

export const THEMES = { vivid: VIVID, subdued: SUBDUED, neon: NEON } as const;
export type ThemeName = keyof typeof THEMES;
export const THEME_KEY = 'block-blowup.theme';

export function isThemeName(name: string | null): name is ThemeName {
  return name !== null && Object.hasOwn(THEMES, name);
}

/** The URL parameter wins, then the remembered choice, then VIVID. */
export function resolveThemeName(param: string | null, stored: string | null): ThemeName {
  if (isThemeName(param)) return param;
  if (isThemeName(stored)) return stored;
  return 'vivid';
}

/** In a browser: read `?theme=` and the remembered choice, remembering a valid parameter. */
function selectedThemeName(): ThemeName {
  if (typeof location === 'undefined') return 'vivid';
  const param = new URLSearchParams(location.search).get('theme');
  let stored: string | null = null;
  try {
    stored = globalThis.localStorage?.getItem(THEME_KEY) ?? null;
    if (isThemeName(param)) globalThis.localStorage?.setItem(THEME_KEY, param);
  } catch {
    // Storage blocked: the parameter still applies to this page load.
  }
  return resolveThemeName(param, stored);
}

let currentName: ThemeName = selectedThemeName();

/**
 * The active theme. A copy, so setTheme can swap its contents in place and every module
 * holding this reference sees the new colours.
 */
export const theme: Theme = structuredClone(THEMES[currentName]);

export function currentThemeName(): ThemeName {
  return currentName;
}

/**
 * Switch the active theme in place and remember the choice. Callers redraw: the renderer's
 * textures (resize) and the DOM's CSS variables (cssVariables).
 */
export function setTheme(name: ThemeName): void {
  currentName = name;
  const next = structuredClone(THEMES[name]);
  // Optional tokens the new theme lacks (e.g. blockStyle) must not linger.
  for (const key of Object.keys(theme)) if (!(key in next)) Reflect.deleteProperty(theme, key);
  Object.assign(theme, next);
  try {
    globalThis.localStorage?.setItem(THEME_KEY, name);
  } catch {
    // Storage blocked: the theme still applies until the page reloads.
  }
}

/** '#rrggbb' → 0xrrggbb, for Pixi. */
export function hexToNumber(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** Mix a '#rrggbb' colour toward white (amount > 0) or black (amount < 0). Returns a number. */
export function shade(hex: string, amount: number): number {
  const n = hexToNumber(hex);
  const target = amount >= 0 ? 255 : 0;
  const k = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (target - c) * k);
  return (mix((n >> 16) & 255) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255);
}

/** CSS custom properties for the DOM parts (HUD, overlays), from the same tokens. */
export function cssVariables(t: Theme = theme): Record<string, string> {
  return {
    '--bg-top': t.bgTop,
    '--bg-bottom': t.bgBottom,
    '--text': t.text,
    '--text-secondary': t.textSecondary,
    '--accent': t.accent,
    '--panel': t.boardPanel,
    '--scrim': t.scrim,
    '--score-shadow': t.scoreShadow,
    '--text-glow': t.textGlow ?? '0 0 0 transparent',
    '--button': t.button,
    '--button-text': t.buttonText,
    // Block colours, for the splash logo and its burst.
    ...Object.fromEntries(Object.entries(t.blocks).map(([name, hex]) => [`--block-${name}`, hex])),
  };
}

/**
 * The same variables as a `:root` rule, inlined into index.html at build time (vite.config.ts)
 * so the first paint already has the theme, before any script runs.
 */
export function cssVariablesRule(t: Theme = theme): string {
  const decls = Object.entries(cssVariables(t)).map(([name, value]) => `${name}:${value}`);
  return `:root{${decls.join(';')}}`;
}
