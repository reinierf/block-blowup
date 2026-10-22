// src/sim/simulate.ts
// Plays seeded games with the greedy bot and aggregates statistics.
// Pure: runs in Node (scripts/simulate.ts, tests/sim) without a browser.

import type { DealInfo } from '../game/generator';
import { Game, GameStatus } from '../game/state';
import { chooseMove } from './bot';
import { lcg } from './lcg';

export interface GameLogEntry {
  hand: string[];
  handIndex: number;
  ox: number;
  oy: number;
  points: number;
  lines: number;
  combo: number;
  score: number;
}

export interface GameStats {
  seed: number;
  moves: number;
  score: number;
  bestCombo: number;
  /** Moves that emptied the whole board. */
  allClears: number;
  /** Game over was detected right after a fresh hand was dealt (dead on arrival). */
  diedOnFreshHand: boolean;
  /** Board fill fraction (0–1) after every move. */
  fill: number[];
  /** Difficulty of the hand in play at every move. */
  difficulty: number[];
  /** Hands dealt, including the first. */
  deals: number;
  /** Hands rejected by the generator before one was accepted, summed over all deals. */
  redraws: number;
  /** Deals where the mercy rule boosted line-completing pieces. */
  mercyDeals: number;
  /** Sum of the assist chance over all deals. */
  assistPSum: number;
  /** Deals where the assist helped, by how (see AssistMode). */
  assistPiece: number;
  assistHand: number;
  assistPieceFallback: number;
  /** Deals that fell back: accepted an unsolvable hand / swapped in the smallest piece. */
  acceptedUnsolvable: number;
  swappedSmallest: number;
  log: GameLogEntry[];
}

export interface BatchStats {
  games: number;
  avgMoves: number;
  medianScore: number;
  avgScore: number;
  bestScore: number;
  avgBestCombo: number;
  /** Board clears per game, on average. */
  avgAllClears: number;
  deadFreshHands: number;
  /** Average board fill after move N (N = 10, 20, 30, …) among games still running. */
  fillByMove: Record<number, number>;
  /** Average difficulty at move N, same sampling as fillByMove. */
  difficultyByMove: Record<number, number>;
  /** Average difficulty when the game ended. */
  avgFinalDifficulty: number;
  /** Rejected hands per deal. */
  redrawsPerDeal: number;
  /** Fraction of deals where the mercy rule fired. */
  mercyRate: number;
  /** Fraction of deals that needed a fallback. */
  fallbackRate: number;
  /** Fraction of deals where the assist helped (any mode). */
  assistRate: number;
  /** Fraction of deals helped with a single clearing piece / a whole hand / the fallback piece. */
  assistPieceRate: number;
  assistHandRate: number;
  assistPieceFallbackRate: number;
  /** Average assist chance over all deals. */
  avgAssistP: number;
}

/** Safety cap so a balance bug can't hang the harness. */
const MAX_MOVES = 100_000;

export function playGame(seed: number): GameStats {
  const game = new Game({ rng: lcg(seed) });
  const log: GameLogEntry[] = [];
  const fill: number[] = [];
  let diedOnFreshHand = false;
  let allClears = 0;
  const cells = game.size * game.size;
  const difficulty: number[] = [];
  const deals: DealInfo[] = [game.lastDeal!];

  while (game.status === GameStatus.PLAYING && log.length < MAX_MOVES) {
    const move = chooseMove(game);
    if (!move) break; // can't happen while PLAYING, but keep the loop safe
    const hand = game.hand.map((p) => p?.shape.name ?? '-');
    difficulty.push(game.lastDeal!.difficulty);
    const handWasLast = game.hand.filter((p) => p !== null).length === 1;
    const result = game.placeAt(move.handIndex, move.ox, move.oy)!;
    log.push({
      hand,
      handIndex: move.handIndex,
      ox: move.ox,
      oy: move.oy,
      points: result.points,
      lines: result.lines,
      combo: result.combo,
      score: game.score,
    });
    const filled = game.board.grid.reduce((n, row) => n + row.filter((c) => c !== null).length, 0);
    fill.push(filled / cells);
    if (result.allClear) allClears++;
    if (result.deal) deals.push(result.deal);
    if (result.gameOver && handWasLast) diedOnFreshHand = true;
  }

  return {
    seed,
    moves: log.length,
    score: game.score,
    bestCombo: game.bestCombo,
    allClears,
    diedOnFreshHand,
    fill,
    difficulty,
    deals: deals.length,
    redraws: deals.reduce((n, d) => n + d.redraws, 0),
    mercyDeals: deals.filter((d) => d.mercy).length,
    assistPSum: deals.reduce((n, d) => n + d.assistP, 0),
    assistPiece: deals.filter((d) => d.assistMode === 'piece').length,
    assistHand: deals.filter((d) => d.assistMode === 'hand').length,
    assistPieceFallback: deals.filter((d) => d.assistMode === 'pieceFallback').length,
    acceptedUnsolvable: deals.filter((d) => d.fallback === 'acceptedUnsolvable').length,
    swappedSmallest: deals.filter((d) => d.fallback === 'swappedSmallest').length,
    log,
  };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function summarize(games: readonly GameStats[]): BatchStats {
  const n = games.length;
  const sum = (f: (g: GameStats) => number) => games.reduce((a, g) => a + f(g), 0);
  const deals = sum((g) => g.deals);
  return {
    games: n,
    avgMoves: sum((g) => g.moves) / n,
    medianScore: median(games.map((g) => g.score)),
    avgScore: sum((g) => g.score) / n,
    bestScore: Math.max(...games.map((g) => g.score)),
    avgBestCombo: sum((g) => g.bestCombo) / n,
    avgAllClears: sum((g) => g.allClears) / n,
    deadFreshHands: games.filter((g) => g.diedOnFreshHand).length,
    fillByMove: byMove(games, (g) => g.fill),
    difficultyByMove: byMove(games, (g) => g.difficulty),
    avgFinalDifficulty: sum((g) => g.difficulty[g.difficulty.length - 1] ?? 0) / n,
    redrawsPerDeal: sum((g) => g.redraws) / deals,
    mercyRate: sum((g) => g.mercyDeals) / deals,
    fallbackRate: sum((g) => g.acceptedUnsolvable + g.swappedSmallest) / deals,
    assistRate: sum((g) => g.assistPiece + g.assistHand + g.assistPieceFallback) / deals,
    assistPieceRate: sum((g) => g.assistPiece) / deals,
    assistHandRate: sum((g) => g.assistHand) / deals,
    assistPieceFallbackRate: sum((g) => g.assistPieceFallback) / deals,
    avgAssistP: sum((g) => g.assistPSum) / deals,
  };
}

/** Average of a per-move series at moves 10, 20, 30, … over games still running (≥ 5). */
function byMove(games: readonly GameStats[], series: (g: GameStats) => number[]) {
  const out: Record<number, number> = {};
  for (let m = 10; ; m += 10) {
    const alive = games.filter((g) => g.moves >= m);
    if (alive.length < 5) break;
    out[m] = alive.reduce((a, g) => a + series(g)[m - 1]!, 0) / alive.length;
  }
  return out;
}

/** Play seeds `from..to` (inclusive). */
export function runSeeds(from: number, to: number): GameStats[] {
  const games: GameStats[] = [];
  for (let seed = from; seed <= to; seed++) games.push(playGame(seed));
  return games;
}
