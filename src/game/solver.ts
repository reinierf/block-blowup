// src/game/solver.ts
// "Can every piece of this hand be placed, in some order, with clears in between?"
// "Can this hand clear a line, played in some order?" (the assist's whole-hand check)
// Depth-first search over orderings and positions that stops at the first success.
// A node budget caps the work; running out counts as "not proven".
// Works on packed 8×8 boards (see bitboard.ts) so the search doesn't allocate per node.

import { clearPacked, packRows, placements, type Rows } from './bitboard';
import type { Shape } from './pieces';

/** What the search must achieve. With neither flag, anything (even nothing) succeeds. */
export interface HandGoal {
  /** Every piece of the hand gets placed. */
  placeAll: boolean;
  /** At least one line is cleared on the way. Without `placeAll`, a prefix may do it. */
  clear: boolean;
}

export interface SearchResult {
  found: boolean;
  /** Placements tried. */
  nodes: number;
  /** The search hit the node budget before reaching the goal. */
  exhausted: boolean;
}

export interface SolveResult {
  solvable: boolean;
  /** Placements tried. */
  nodes: number;
  /** The search hit the node budget before finding a solution. */
  exhausted: boolean;
}

/** Hands have at most this many pieces (one scratch buffer per search depth). */
const MAX_DEPTH = 8;

export function searchHand(
  rows: Rows,
  shapes: readonly Shape[],
  budget: number,
  goal: HandGoal,
): SearchResult {
  if (shapes.length > MAX_DEPTH) throw new Error(`Hands of more than ${MAX_DEPTH} pieces`);
  const moves = shapes.map(placements);
  const ids = shapes.map((s) => s.id);
  const scratch = Array.from({ length: MAX_DEPTH }, () => new Int32Array(3));
  let nodes = 0;
  let exhausted = false;

  /** `used` is a bitmask of hand indices already placed. */
  function search(lo: number, hi: number, used: number, depth: number, cleared: boolean): boolean {
    if ((!goal.clear || cleared) && (!goal.placeAll || depth === shapes.length)) return true;
    if (depth === shapes.length) return false;
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
        const next = cleared || out[2]! > 0;
        if (search(out[0]!, out[1]!, used | (1 << i), depth + 1, next)) return true;
        if (exhausted) return false;
      }
    }
    return false;
  }

  const [lo, hi] = packRows(rows);
  const found = search(lo, hi, 0, 0, false);
  return { found, nodes: Math.min(nodes, budget), exhausted: exhausted && !found };
}

export function canPlaceAll(rows: Rows, shapes: readonly Shape[], budget: number): SolveResult {
  const r = searchHand(rows, shapes, budget, { placeAll: true, clear: false });
  return { solvable: r.found, nodes: r.nodes, exhausted: r.exhausted };
}
