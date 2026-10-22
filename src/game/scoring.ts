// src/game/scoring.ts
// All scoring rules in one place so they are easy to read and tune.
// Pure module: no DOM, no rendering.

import type { Shape } from './pieces';

/**
 * Base points for clearing N lines *simultaneously* (index = lines cleared).
 * Capped at the last entry for 4+ line clears.
 */
export const LINE_POINTS: readonly number[] = [0, 10, 40, 90, 160];

/** Points for simply placing a piece: one per cell. */
export function placementPoints(shape: Shape): number {
  return shape.cells.length;
}

/**
 * Multiplier applied to a clear, based on the current combo streak.
 * combo is the count of *consecutive* clearing placements (1 = first clear, no bonus).
 */
export function comboMultiplier(combo: number): number {
  return 1 + 0.5 * Math.max(0, combo - 1);
}

/** Points awarded for clearing `lines` lines while on combo streak `combo`. */
export function lineClearPoints(lines: number, combo: number): number {
  const base = LINE_POINTS[Math.min(lines, LINE_POINTS.length - 1)]!;
  return Math.round(base * comboMultiplier(combo));
}
