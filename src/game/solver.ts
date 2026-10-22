// src/game/solver.ts
// "Can every piece of this hand be placed, in some order, with clears in between?"
// Depth-first search over orderings and positions that stops at the first success.
// A node budget caps the work; running out counts as "not proven solvable".
// Works on packed 8×8 boards (see bitboard.ts) so the search doesn't allocate per node.

import { clearPacked, packRows, placements, type Rows } from './bitboard';
import type { Shape } from './pieces';

export interface SolveResult {
  solvable: boolean;
  /** Placements tried. */
  nodes: number;
  /** The search hit the node budget before finding a solution. */
  exhausted: boolean;
}

/** Hands have at most this many pieces (one scratch buffer per search depth). */
const MAX_DEPTH = 8;

export function canPlaceAll(rows: Rows, shapes: readonly Shape[], budget: number): SolveResult {
  if (shapes.length > MAX_DEPTH) throw new Error(`Hands of more than ${MAX_DEPTH} pieces`);
  const moves = shapes.map(placements);
  const ids = shapes.map((s) => s.id);
  const scratch = Array.from({ length: MAX_DEPTH }, () => new Int32Array(3));
  let nodes = 0;
  let exhausted = false;

  /** `used` is a bitmask of hand indices already placed. */
  function search(lo: number, hi: number, used: number, depth: number): boolean {
    if (depth === shapes.length) return true;
    const out = scratch[depth]!;
    for (let i = 0; i < shapes.length; i++) {
      if (used & (1 << i)) continue;
      // Identical unplaced pieces: trying the first of them is enough.
      let dup = false;
      for (let j = 0; j < i; j++) {
        if (!(used & (1 << j)) && ids[j] === ids[i]) dup = true;
      }
      if (dup) continue;
      const p = moves[i]!;
      for (let k = 0; k < p.length; k += 2) {
        const plo = p[k]!;
        const phi = p[k + 1]!;
        if ((plo & lo) !== 0 || (phi & hi) !== 0) continue;
        if (++nodes > budget) {
          exhausted = true;
          return false;
        }
        clearPacked(lo | plo, hi | phi, out);
        if (search(out[0]!, out[1]!, used | (1 << i), depth + 1)) return true;
        if (exhausted) return false;
      }
    }
    return false;
  }

  const [lo, hi] = packRows(rows);
  const solvable = search(lo, hi, 0, 0);
  return { solvable, nodes: Math.min(nodes, budget), exhausted: exhausted && !solvable };
}
