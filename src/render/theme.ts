// src/render/theme.ts
// Every colour in the game lives here. The default theme, VIVID, follows the original's
// look: royal-blue background, dark navy board, saturated blocks with strong bevels.
// SUBDUED is the calmer variant from HANDOVER.md §3.5 (lower saturation, softer gloss).

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
};

export const VIVID: Theme = {
  bgTop: '#1c49c7',
  /** A lighter tint of bgTop (top-to-bottom gradient). */
  bgBottom: '#5978cf',
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
};

export const theme: Theme = VIVID;

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
    '--button': t.button,
    '--button-text': t.buttonText,
  };
}
