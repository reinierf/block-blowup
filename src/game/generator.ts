// src/game/generator.ts
// Deals hands of three pieces. Replaces the fork's shuffled bag.
//
// - Weighted by shape family; weights move from "easy" to "hard" as difficulty rises.
// - Hard fairness rule: never deal a hand in which no piece fits.
// - Soft fairness rule: with probability pSolvable(difficulty), the whole hand must be
//   placeable in some order (with clears in between).
// - Mercy rule: on a crowded board, or after MERCY_HANDS hands without a clear, pieces that
//   would complete a line get boosted.
// - Never three identical pieces in one hand.
// Every decision is reported in DealInfo so a debug overlay (and the simulation) can show it.

import { completesALine, filledCount, fitsAnywhere, type Rows } from './bitboard';
import {
  DEAL_NODE_BUDGET,
  FAMILY_WEIGHTS,
  MAX_REDRAWS,
  MERCY_BOOST,
  MERCY_FILL,
  MERCY_HANDS,
  SOLVER_NODE_BUDGET,
} from './config';
import { difficultyFor, pSolvable } from './difficulty';
import { PIECE_COLORS, SHAPES, type PieceColor, type Shape } from './pieces';
import { weightedIndex, type Rng } from './rng';
import { canPlaceAll } from './solver';

export const HAND_SIZE = 3;

export interface DealContext {
  score: number;
  /** Completed hands in a row during which nothing was cleared. */
  handsWithoutClear: number;
}

export type MercyReason = 'fill' | 'drought' | null;

export interface DealInfo {
  difficulty: number;
  /** Hands drawn and rejected before this one was accepted. */
  redraws: number;
  /** Line-completing pieces were boosted for this deal. */
  mercy: boolean;
  mercyReason: MercyReason;
  /** The soft rule applied: the hand had to be fully placeable. */
  requireSolvable: boolean;
  /** Whether the accepted hand is fully placeable; null when not checked or not proven. */
  solvable: boolean | null;
  /** How the deal ended when the rules couldn't be met (redraws or node budget ran out). */
  fallback: 'none' | 'acceptedUnsolvable' | 'swappedSmallest';
  /** Solver placements tried across all attempts. */
  solverNodes: number;
}

export interface Deal {
  shapes: Shape[];
  /** One colour per piece, all different. */
  colors: PieceColor[];
  info: DealInfo;
}

/** Per-shape weights at a difficulty: each family's weight shared by its orientations. */
export function shapeWeights(difficulty: number, shapes: readonly Shape[] = SHAPES): number[] {
  const familySize = new Map<string, number>();
  for (const s of shapes) familySize.set(s.family, (familySize.get(s.family) ?? 0) + 1);
  return shapes.map((s) => {
    const [easy, hard] = FAMILY_WEIGHTS[s.family];
    return (easy + (hard - easy) * difficulty) / familySize.get(s.family)!;
  });
}

export class Generator {
  readonly rng: Rng;
  readonly shapes: readonly Shape[];
  /** Shapes from fewest to most cells, for the last-resort swap. */
  private readonly smallestFirst: readonly Shape[];

  constructor(rng: Rng, shapes: readonly Shape[] = SHAPES) {
    this.rng = rng;
    this.shapes = shapes;
    this.smallestFirst = [...shapes].sort((a, b) => a.cells.length - b.cells.length || a.id - b.id);
  }

  deal(rows: Rows, ctx: DealContext): Deal {
    const difficulty = difficultyFor(ctx.score);
    const fill = filledCount(rows) / (rows.length * rows.length);
    const mercyReason: MercyReason =
      fill > MERCY_FILL ? 'fill' : ctx.handsWithoutClear >= MERCY_HANDS ? 'drought' : null;

    const weights = shapeWeights(difficulty, this.shapes);
    let mercy = false;
    if (mercyReason) {
      this.shapes.forEach((s, i) => {
        if (completesALine(rows, s)) {
          weights[i]! *= MERCY_BOOST;
          mercy = true;
        }
      });
    }

    // Always consume this roll, so the RNG sequence doesn't depend on the board.
    const requireSolvable = this.rng() < pSolvable(difficulty);

    let redraws = 0;
    let solverNodes = 0;
    /** First hand that fits but wasn't proven solvable: the fallback if nothing better turns up. */
    let candidate: { shapes: Shape[]; solvable: false | null } | null = null;
    let last: Shape[] = [];

    const done = (
      shapes: Shape[],
      solvable: boolean | null,
      fallback: DealInfo['fallback'],
    ): Deal => ({
      shapes,
      colors: this.drawColors(shapes.length),
      info: {
        difficulty,
        redraws,
        mercy,
        mercyReason,
        requireSolvable,
        solvable,
        fallback,
        solverNodes,
      },
    });

    for (let attempt = 0; attempt <= MAX_REDRAWS; attempt++) {
      const hand = this.drawHand(weights);
      last = hand;
      if (!hand.some((s) => fitsAnywhere(rows, s))) {
        redraws++;
        continue;
      }
      if (!requireSolvable) return done(hand, null, 'none');

      const budget = Math.min(SOLVER_NODE_BUDGET, DEAL_NODE_BUDGET - solverNodes);
      if (budget <= 0) {
        // Out of search time for this deal: settle for a hand that at least isn't dead.
        candidate ??= { shapes: hand, solvable: null };
        break;
      }
      const solved = canPlaceAll(rows, hand, budget);
      solverNodes += solved.nodes;
      if (solved.solvable) return done(hand, true, 'none');
      // An exhausted search proves nothing, so report "unknown" rather than "unsolvable".
      candidate ??= { shapes: hand, solvable: solved.exhausted ? null : false };
      redraws++;
    }

    if (candidate) return done(candidate.shapes, candidate.solvable, 'acceptedUnsolvable');

    // Every hand was dead: swap the smallest piece that fits into the first slot.
    const smallest = this.smallestFirst.find((s) => fitsAnywhere(rows, s));
    return done(smallest ? [smallest, ...last.slice(1)] : last, null, 'swappedSmallest');
  }

  /** `n` distinct piece colours, in random order (partial Fisher–Yates). */
  private drawColors(n: number): PieceColor[] {
    const pool = [...PIECE_COLORS];
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(this.rng() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, n);
  }

  /** Draw HAND_SIZE shapes by weight, never three identical. */
  private drawHand(weights: readonly number[]): Shape[] {
    const picks: number[] = [];
    for (let k = 0; k < HAND_SIZE; k++) {
      let w = weights;
      if (k === HAND_SIZE - 1 && picks.every((p) => p === picks[0])) {
        // The first picks are all the same shape: exclude it for the last one.
        w = weights.map((x, i) => (i === picks[0] ? 0 : x));
      }
      picks.push(weightedIndex(w, this.rng));
    }
    return picks.map((i) => this.shapes[i]!);
  }
}
