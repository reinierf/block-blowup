// src/game/rng.ts
// Seeded random numbers. Every random choice in src/game/ goes through an Rng, so a game
// replays exactly from its seed.

/** A random source returning a float in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32: small, fast, good enough for a puzzle game. The whole state is one uint32,
 * so it can be saved with a game and restored with `mulberry32(savedState)`.
 */
export class Mulberry32 {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next = (): number => {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick an index with probability proportional to its weight. Returns -1 if all weights are 0. */
export function weightedIndex(weights: readonly number[], rng: Rng): number {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return -1;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r < 0 && weights[i]! > 0) return i;
  }
  // Floating-point leftovers: return the last positive weight.
  for (let i = weights.length - 1; i >= 0; i--) if (weights[i]! > 0) return i;
  return -1;
}
