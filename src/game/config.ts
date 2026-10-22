// src/game/config.ts
// Every tunable gameplay number lives here. Logic modules import from this file
// instead of hard-coding values. See docs/game-design.md for what each one does.

import type { ShapeFamily } from './pieces';

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

// --- Piece generator (generator.ts) ----------------------------------------------------

/**
 * Difficulty (0–1) as a piecewise-linear function of score: [score, difficulty] points,
 * ascending. Below the first point difficulty is 0; above the last it is 1.
 */
export const DIFFICULTY_CURVE: readonly (readonly [score: number, difficulty: number])[] = [
  [0, 0],
  [500, 0.2],
  [1500, 0.45],
  [3000, 0.7],
  [6000, 1],
];

/**
 * Family weights at difficulty 0 and difficulty 1; linear in between. A family's weight is
 * shared equally by its orientations, so families with more orientations aren't favoured.
 */
export const FAMILY_WEIGHTS: Readonly<Record<ShapeFamily, readonly [easy: number, hard: number]>> =
  {
    single: [1, 0],
    line2: [6, 3],
    line3: [5, 4],
    line4: [3, 4],
    line5: [1.5, 4],
    square2: [6, 4],
    square3: [1, 4],
    rect: [1.5, 3.5],
    corner: [6, 4],
    L: [2.5, 4],
    T: [2.5, 3.5],
    SZ: [1, 3.5],
    bigL: [1, 4],
  };

/** Probability that a hand must be fully placeable (soft fairness rule), by difficulty. */
export const P_SOLVABLE_EASY = 1.0;
export const P_SOLVABLE_HARD = 0.7;

/** Hands to draw before giving up on the fairness rules for this deal. */
export const MAX_REDRAWS = 20;

/** Placement budget for one solvability search. */
export const SOLVER_NODE_BUDGET = 2000;

/**
 * Placement budget for all solvability searches in one deal. Bounds the worst case to a
 * few milliseconds on a phone; once spent, the deal stops requiring solvability.
 */
export const DEAL_NODE_BUDGET = 5000;

/** Mercy rule: board fill fraction above which line-completing pieces get boosted. */
export const MERCY_FILL = 0.6;
/** Mercy rule: hands in a row without any clear before line-completing pieces get boosted. */
export const MERCY_HANDS = 2;
/** Mercy rule: weight multiplier for pieces that would complete at least one line. */
export const MERCY_BOOST = 4;
