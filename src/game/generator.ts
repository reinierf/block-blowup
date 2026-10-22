// src/game/generator.ts
// Deals hands of three pieces. Replaces the fork's shuffled bag.
//
// - Weighted by shape family; weights move from "easy" to "hard" as difficulty rises.
// - Hard fairness rule: never deal a hand in which no piece fits.
// - Soft fairness rule: with probability pSolvable(difficulty), the whole hand must be
//   placeable in some order (with clears in between).
// - Mercy rule: on a crowded board, or after MERCY_HANDS hands without a clear, pieces that
//   would complete a line get boosted.
// - Assist: with a chance that falls with difficulty and rises when the player needs help
//   (crowded board, drought, running combo), the hand must offer a line clear. Below
//   ASSIST_HAND_FROM one clearing piece is dealt in a random slot; from there up, a natural
//   hand that can clear when played in some order is looked for first (subtler help).
// - Never three identical pieces in one hand.
// Every decision is reported in DealInfo so a debug overlay (and the simulation) can show it.

import { completesALine, filledCount, fitsAnywhere, maxLinesCleared, type Rows } from './bitboard';
import {
  ASSIST_HAND_FROM,
  ASSIST_HAND_TRIES,
  DEAL_NODE_BUDGET,
  FAMILY_WEIGHTS,
  MAX_REDRAWS,
  MERCY_BOOST,
  MERCY_FILL,
  MERCY_HANDS,
  SOLVER_NODE_BUDGET,
} from './config';
import {
  assistChance,
  assistGenerosity,
  difficultyFor,
  pSolvable,
  type AssistChance,
  type AssistInput,
  type AssistReason,
} from './difficulty';
import { PIECE_COLORS, SHAPES, type PieceColor, type Shape } from './pieces';
import { weightedIndex, type Rng } from './rng';
import { canPlaceAll, searchHand } from './solver';

export const HAND_SIZE = 3;

export interface DealContext {
  score: number;
  /** Completed hands in a row during which nothing was cleared. */
  handsWithoutClear: number;
  /** Current combo streak (0 or absent: none running). */
  combo?: number;
}

export type MercyReason = 'fill' | 'drought' | null;

/**
 * How the assist helped: one clearing piece; a natural hand that can clear in some order;
 * the clearing piece after whole-hand help ran out of tries or budget; or not at all (the
 * roll missed, or no piece can clear anything on this board).
 */
export type AssistMode = 'piece' | 'hand' | 'pieceFallback' | 'none';

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
  /** Chance that this deal had to offer a line clear. */
  assistP: number;
  /** Largest term of that chance. */
  assistReason: AssistReason;
  /** The assist roll hit. */
  assist: boolean;
  assistMode: AssistMode;
}

export interface GeneratorOptions {
  /** Assist chance for a deal (tests pin it to 0 or 1). */
  assistChance?: (input: AssistInput) => AssistChance;
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
  private readonly assistChance: (input: AssistInput) => AssistChance;

  constructor(rng: Rng, shapes: readonly Shape[] = SHAPES, options: GeneratorOptions = {}) {
    this.rng = rng;
    this.shapes = shapes;
    this.assistChance = options.assistChance ?? assistChance;
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
    const { p: assistP, reason: assistReason } = this.assistChance({
      difficulty,
      fill,
      handsWithoutClear: ctx.handsWithoutClear,
      combo: ctx.combo ?? 0,
    });
    // Also always consumed.
    const assist = this.rng() < assistP;

    let redraws = 0;
    let solverNodes = 0;
    let assistMode: AssistMode = 'none';
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
        assistP,
        assistReason,
        assist,
        assistMode,
      },
    });

    // Whole-hand help: a natural hand that can clear a line, played in some order (and be
    // placed in full, when the soft rule applies). Runs on the deal's solver budget.
    const tryHand = assist && difficulty >= ASSIST_HAND_FROM;
    if (tryHand) {
      const goal = { placeAll: requireSolvable, clear: true };
      for (let t = 0; t < ASSIST_HAND_TRIES; t++) {
        const budget = Math.min(SOLVER_NODE_BUDGET, DEAL_NODE_BUDGET - solverNodes);
        if (budget <= 0) break;
        const hand = this.drawHand(weights);
        const found = searchHand(rows, hand, budget, goal);
        solverNodes += found.nodes;
        if (found.found) {
          assistMode = 'hand';
          return done(hand, requireSolvable ? true : null, 'none');
        }
        redraws++;
      }
    }

    // Single-piece help: every hand drawn below contains one piece that clears a line.
    const helpers = assist ? this.helperWeights(rows, weights, difficulty) : null;
    if (helpers) assistMode = tryHand ? 'pieceFallback' : 'piece';

    for (let attempt = 0; attempt <= MAX_REDRAWS; attempt++) {
      const hand = this.drawHand(weights, helpers);
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

  /**
   * Weights for the assist's helper piece: shapes that can clear a line, by their normal
   * weight × lines cleared ^ generosity. Null when no dealable shape clears anything.
   */
  private helperWeights(
    rows: Rows,
    weights: readonly number[],
    difficulty: number,
  ): number[] | null {
    const generosity = assistGenerosity(difficulty);
    let any = false;
    const helpers = this.shapes.map((s, i) => {
      if (weights[i]! <= 0) return 0;
      const lines = maxLinesCleared(rows, s);
      if (lines === 0) return 0;
      any = true;
      return weights[i]! * lines ** generosity;
    });
    return any ? helpers : null;
  }

  /**
   * Draw HAND_SIZE shapes by weight, never three identical. With `helpers`, the first pick
   * uses those weights and then moves to a random slot, so its position gives nothing away.
   */
  private drawHand(weights: readonly number[], helpers: readonly number[] | null = null): Shape[] {
    const picks: number[] = [];
    for (let k = 0; k < HAND_SIZE; k++) {
      let w = k === 0 && helpers ? helpers : weights;
      if (k === HAND_SIZE - 1 && picks.every((p) => p === picks[0])) {
        // The first picks are all the same shape: exclude it for the last one.
        w = weights.map((x, i) => (i === picks[0] ? 0 : x));
      }
      picks.push(weightedIndex(w, this.rng));
    }
    if (helpers) {
      const slot = Math.floor(this.rng() * HAND_SIZE);
      [picks[0], picks[slot]] = [picks[slot]!, picks[0]!];
    }
    return picks.map((i) => this.shapes[i]!);
  }
}
