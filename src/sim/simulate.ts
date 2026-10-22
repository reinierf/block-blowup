// src/sim/simulate.ts
// Plays seeded games with the greedy bot and aggregates statistics.
// Pure: runs in Node (scripts/simulate.ts, tests/sim) without a browser.

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
  /** Game over was detected right after a fresh hand was dealt (dead on arrival). */
  diedOnFreshHand: boolean;
  /** Board fill fraction (0–1) after every move. */
  fill: number[];
  log: GameLogEntry[];
}

export interface BatchStats {
  games: number;
  avgMoves: number;
  medianScore: number;
  avgScore: number;
  bestScore: number;
  avgBestCombo: number;
  deadFreshHands: number;
  /** Average board fill after move N (N = 10, 20, 30, …) among games still running. */
  fillByMove: Record<number, number>;
}

/** Safety cap so a balance bug can't hang the harness. */
const MAX_MOVES = 100_000;

export function playGame(seed: number): GameStats {
  const game = new Game({ rng: lcg(seed) });
  const log: GameLogEntry[] = [];
  const fill: number[] = [];
  let diedOnFreshHand = false;
  const cells = game.size * game.size;

  while (game.status === GameStatus.PLAYING && log.length < MAX_MOVES) {
    const move = chooseMove(game);
    if (!move) break; // can't happen while PLAYING, but keep the loop safe
    const hand = game.hand.map((p) => p?.shape.name ?? '-');
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
    if (result.gameOver && handWasLast) diedOnFreshHand = true;
  }

  return {
    seed,
    moves: log.length,
    score: game.score,
    bestCombo: game.bestCombo,
    diedOnFreshHand,
    fill,
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
  const fillByMove: Record<number, number> = {};
  const longest = Math.max(...games.map((g) => g.moves));
  for (let m = 10; m <= longest; m += 10) {
    const alive = games.filter((g) => g.fill.length >= m);
    if (alive.length < 5) break;
    fillByMove[m] = alive.reduce((a, g) => a + g.fill[m - 1]!, 0) / alive.length;
  }
  return {
    games: n,
    avgMoves: sum((g) => g.moves) / n,
    medianScore: median(games.map((g) => g.score)),
    avgScore: sum((g) => g.score) / n,
    bestScore: Math.max(...games.map((g) => g.score)),
    avgBestCombo: sum((g) => g.bestCombo) / n,
    deadFreshHands: games.filter((g) => g.diedOnFreshHand).length,
    fillByMove,
  };
}

/** Play seeds `from..to` (inclusive). */
export function runSeeds(from: number, to: number): GameStats[] {
  const games: GameStats[] = [];
  for (let seed = from; seed <= to; seed++) games.push(playGame(seed));
  return games;
}
