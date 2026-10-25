// src/game/difficulty.ts
// Difficulty (0–1) from lines cleared. Pure, so it can be tuned and tested in isolation.

import {
  ASSIST_BASE,
  ASSIST_COMBO_GAIN,
  ASSIST_DROUGHT_GAIN,
  ASSIST_FILL_FROM,
  ASSIST_FILL_GAIN,
  ASSIST_GENEROSITY,
  ASSIST_MAX,
  DIFFICULTY_CURVE,
  P_SOLVABLE_EASY,
  P_SOLVABLE_HARD,
} from './config';

/** Difficulty after `lines` lines cleared this game, interpolated along the curve. */
export function difficultyFor(lines: number, curve = DIFFICULTY_CURVE): number {
  const first = curve[0]!;
  if (lines <= first[0]) return first[1];
  for (let i = 1; i < curve.length; i++) {
    const [l1, d1] = curve[i]!;
    if (lines <= l1) {
      const [l0, d0] = curve[i - 1]!;
      return d0 + ((d1 - d0) * (lines - l0)) / (l1 - l0);
    }
  }
  return curve[curve.length - 1]![1];
}

/** Probability that a dealt hand must be fully placeable, at this difficulty. */
export function pSolvable(difficulty: number): number {
  return P_SOLVABLE_EASY + (P_SOLVABLE_HARD - P_SOLVABLE_EASY) * difficulty;
}

export interface AssistInput {
  difficulty: number;
  /** Board fill fraction, 0–1. */
  fill: number;
  handsWithoutClear: number;
  combo: number;
}

/** Which term contributed most to the assist chance. */
export type AssistReason = 'base' | 'fill' | 'drought' | 'combo';

export interface AssistChance {
  p: number;
  reason: AssistReason;
}

/** Chance that a deal is forced to offer a line clear, and its main reason. */
export function assistChance({
  difficulty,
  fill,
  handsWithoutClear,
  combo,
}: AssistInput): AssistChance {
  const [easy, hard] = ASSIST_BASE;
  const terms: [AssistReason, number][] = [
    ['base', easy + (hard - easy) * difficulty],
    ['fill', (ASSIST_FILL_GAIN * Math.max(0, fill - ASSIST_FILL_FROM)) / (1 - ASSIST_FILL_FROM)],
    ['drought', ASSIST_DROUGHT_GAIN * handsWithoutClear],
    ['combo', combo > 0 ? ASSIST_COMBO_GAIN : 0],
  ];
  let p = 0;
  let top = terms[0]!;
  for (const t of terms) {
    p += t[1];
    if (t[1] > top[1]) top = t;
  }
  return { p: Math.min(ASSIST_MAX, p), reason: top[0] };
}

/** Exponent on lines cleared when the assist picks a helper piece. */
export function assistGenerosity(difficulty: number): number {
  const [easy, hard] = ASSIST_GENEROSITY;
  return easy + (hard - easy) * difficulty;
}
