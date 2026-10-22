// src/game/difficulty.ts
// Difficulty (0–1) from score. Pure, so it can be tuned and tested in isolation.

import { DIFFICULTY_CURVE, P_SOLVABLE_EASY, P_SOLVABLE_HARD } from './config';

export function difficultyFor(score: number, curve = DIFFICULTY_CURVE): number {
  const first = curve[0]!;
  if (score <= first[0]) return first[1];
  for (let i = 1; i < curve.length; i++) {
    const [s1, d1] = curve[i]!;
    if (score <= s1) {
      const [s0, d0] = curve[i - 1]!;
      return d0 + ((d1 - d0) * (score - s0)) / (s1 - s0);
    }
  }
  return curve[curve.length - 1]![1];
}

/** Probability that a dealt hand must be fully placeable, at this difficulty. */
export function pSolvable(difficulty: number): number {
  return P_SOLVABLE_EASY + (P_SOLVABLE_HARD - P_SOLVABLE_EASY) * difficulty;
}
