// src/game/config.ts
// Every tunable gameplay number lives here. Logic modules import from this file
// instead of hard-coding values. See docs/game-design.md for what each one does.

/** Points per cell of a placed piece. */
export const PLACE_POINTS_PER_CELL = 1;

/**
 * Base points for clearing N lines in one move (index = lines cleared).
 * Moves that clear more lines than the table covers use the last entry.
 */
export const LINE_POINTS: readonly number[] = [0, 10, 40, 90, 160, 250, 360, 490];

/**
 * Placements in a row without a clear before the combo resets. With 3, the streak survives
 * roughly one hand of misses, like the original.
 */
export const COMBO_GRACE = 3;

/** Highest combo multiplier (reached at combo 9 with the formula below). */
export const COMBO_MULT_CAP = 5;

/** Combo multiplier for a clear on combo streak `combo` (1 = first clear, no bonus). */
export function comboMultiplierFor(combo: number): number {
  return Math.min(COMBO_MULT_CAP, 1 + 0.5 * Math.max(0, combo - 1));
}

/** Bonus for a move that leaves the board completely empty, × the combo multiplier. */
export const ALL_CLEAR_BONUS = 300;

/**
 * Praise word for a clear of at least `minLines` lines in one move. Checked from the top;
 * the first match wins. Single-line clears get no word.
 */
export const PRAISE_BY_LINES: readonly { minLines: number; word: string }[] = [
  { minLines: 5, word: 'Amazing' },
  { minLines: 4, word: 'Excellent' },
  { minLines: 3, word: 'Great' },
  { minLines: 2, word: 'Good' },
];
