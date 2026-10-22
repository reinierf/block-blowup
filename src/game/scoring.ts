// src/game/scoring.ts
// Scoring formulas. The numbers they use live in config.ts.
// Pure module: no DOM, no rendering.

import { LINE_POINTS, PLACE_POINTS_PER_CELL, comboMultiplierFor } from './config';
import type { Shape } from './pieces';

export { LINE_POINTS };

/** Points for simply placing a piece. */
export function placementPoints(shape: Shape): number {
  return shape.cells.length * PLACE_POINTS_PER_CELL;
}

/**
 * Multiplier applied to a clear, based on the current combo streak.
 * combo is the count of clearing placements in the current streak (1 = first clear, no bonus).
 */
export function comboMultiplier(combo: number): number {
  return comboMultiplierFor(combo);
}

/** Points awarded for clearing `lines` lines while on combo streak `combo`. */
export function lineClearPoints(lines: number, combo: number): number {
  const base = LINE_POINTS[Math.min(lines, LINE_POINTS.length - 1)]!;
  return Math.round(base * comboMultiplier(combo));
}
