// src/render/theme.ts
// Every colour in the game lives here. The default theme is close to the original's look
// but subdued: lower saturation, less contrast, softer gloss (HANDOVER.md §3.5).
// A "vivid" theme can be added later as another Theme object.

import type { PieceColor } from '../game/pieces';

export interface Theme {
  /** Page background: vertical gradient, top → bottom. */
  bgTop: string;
  bgBottom: string;
  boardPanel: string;
  emptyCell: string;
  text: string;
  textSecondary: string;
  /** Combo, praise, highlights. */
  accent: string;
  /** Overlay scrim behind dialogs. */
  scrim: string;
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
};

export const theme: Theme = SUBDUED;

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
    '--button': t.button,
    '--button-text': t.buttonText,
  };
}
