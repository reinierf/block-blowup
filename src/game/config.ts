// src/game/config.ts
// Every tunable gameplay number lives here. Logic modules import from this file
// instead of hard-coding values. See docs/game-design.md for what each one does.

import type { ShapeFamily } from './pieces';

/** Points per cell of a placed piece. */
export const PLACE_POINTS_PER_CELL = 1;

/**
 * Base points for clearing N lines in one move (index = lines cleared), before the combo
 * multiplier. Moves that clear more lines than the table covers use the last entry.
 * 1 and 2 lines match the original (20 per line); from 3 lines up a clear pays
 * 20 × lines × (lines − 1), so bigger clears earn extra. The one 3-line clear measured in
 * the original fits 120.
 */
export const LINE_POINTS: readonly number[] = [0, 20, 40, 120, 240, 400, 600, 840];

/**
 * Placements in a row without a clear before the combo resets. With 3, the streak survives
 * roughly one hand of misses, like the original.
 */
export const COMBO_GRACE = 3;

/**
 * Combo multiplier for a clear on combo streak `combo` (1 = first clear): combo + 1, with
 * no cap, as measured in the original (seen up to combo 24).
 */
export function comboMultiplierFor(combo: number): number {
  return Math.max(0, combo) + 1;
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
 * Difficulty (0–1) as a piecewise-linear function of lines cleared this game:
 * [lines, difficulty] points, ascending. Below the first point difficulty is 0; above the
 * last it is 1. Lines rather than score, so combos and board clears don't speed it up.
 * First matched to the old score curve, then stretched ~1.5× for longer games.
 */
export const DIFFICULTY_CURVE: readonly (readonly [lines: number, difficulty: number])[] = [
  [0, 0],
  [20, 0.2],
  [45, 0.45],
  [80, 0.6],
  [180, 1],
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
    // Diagonals: rare, as in the original.
    diag2: [0.5, 0.5],
    diag3: [0.3, 0.5],
    diag4: [0.2, 0.4],
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

// --- Assist (generator.ts) -------------------------------------------------------------

/** Chance that a deal is forced to offer a line clear, at difficulty 0 and 1; linear between. */
export const ASSIST_BASE: readonly [easy: number, hard: number] = [0.7, 0.25];
/** Board fill fraction from which the fill term starts adding to the assist chance. */
export const ASSIST_FILL_FROM = 0.5;
/** Extra assist chance at a full board; linear from ASSIST_FILL_FROM. */
export const ASSIST_FILL_GAIN = 0.6;
/** Extra assist chance per hand in a row without a clear. */
export const ASSIST_DROUGHT_GAIN = 0.2;
/** Extra assist chance while a combo streak is running, to help keep it alive. */
export const ASSIST_COMBO_GAIN = 0.4;
/** Upper bound on the assist chance. */
export const ASSIST_MAX = 0.9;
/**
 * Exponent on lines cleared when picking the helper piece, at difficulty 0 and 1. Above 0,
 * pieces that clear more lines at once are favoured.
 */
export const ASSIST_GENEROSITY: readonly [easy: number, hard: number] = [1.5, 0.2];
/**
 * Difficulty from which the assist first looks for a natural hand that can clear a line
 * when played in some order (subtler help), before handing out a single clearing piece.
 */
export const ASSIST_HAND_FROM = 0.5;
/** Natural hands tried for whole-hand help before falling back to a single clearing piece. */
export const ASSIST_HAND_TRIES = 8;
