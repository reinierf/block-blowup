// src/sim/lcg.ts
// The LCG the simulation harness and tests use. Its exact constants are part of the
// recorded baseline in HANDOVER.md section 4, so don't change them.

import type { Rng } from '../game/pieces';

export function lcg(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
