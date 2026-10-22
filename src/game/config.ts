// src/game/config.ts
// Every tunable gameplay number lives here. Logic modules import from this file
// instead of hard-coding values. See docs/game-design.md for what each one does.

/** Points per cell of a placed piece. */
export const PLACE_POINTS_PER_CELL = 1;

/**
 * Base points for clearing N lines in one move (index = lines cleared).
 * Moves that clear more lines than the table covers use the last entry.
 */
export const LINE_POINTS: readonly number[] = [0, 10, 40, 90, 160];

/** Combo multiplier for a clear on combo streak `combo` (1 = first clear, no bonus). */
export function comboMultiplierFor(combo: number): number {
  return 1 + 0.5 * Math.max(0, combo - 1);
}
