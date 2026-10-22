// src/game/save.ts
// Saving and restoring a game in progress. Mobile OSes kill backgrounded PWAs, so the
// app saves after every move. A save holds everything the game needs to continue exactly
// as if it had never stopped, including the RNG state.
// Pure: (de)serialises plain data; storage lives in src/storage.ts.

import type { Cell } from './board';
import { SHAPES } from './pieces';
import type { Rng } from './rng';
import { Game, GameStatus } from './state';

export const SAVE_VERSION = 1;

export interface SavedGame {
  v: typeof SAVE_VERSION;
  /** Mulberry32 state at the moment of saving. */
  rngState: number;
  /** Rows of colour names, null for empty. */
  board: Cell[][];
  /** Shape names and colours; null for placed slots. */
  hand: ({ shape: string; color: string } | null)[];
  score: number;
  combo: number;
  movesSinceClear: number;
  bestCombo: number;
  handsWithoutClear: number;
  handHadClear: boolean;
  status: GameStatus;
}

/** The fields of Game that a save restores (everything except the RNG). */
export type GameState = Omit<SavedGame, 'v' | 'rngState'>;

export function saveGame(game: Game, rngState: number): SavedGame {
  return {
    v: SAVE_VERSION,
    rngState: rngState >>> 0,
    board: game.board.grid.map((row) => [...row]),
    hand: game.hand.map((p) => (p ? { shape: p.shape.name, color: p.color } : null)),
    score: game.score,
    combo: game.combo,
    movesSinceClear: game.movesSinceClear,
    bestCombo: game.bestCombo,
    handsWithoutClear: game.handsWithoutClear,
    handHadClear: game.handHadClear,
    status: game.status,
  };
}

/** A Game continuing from `state`, drawing new hands from `rng` (restored to the saved state). */
export function restoreGame(state: GameState, rng: Rng): Game {
  return new Game({ rng, initial: state });
}

const isInt = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;

/**
 * Validate untrusted data (from storage) as a SavedGame. Returns null for anything that is
 * not a complete, consistent save of the current version.
 */
export function parseSavedGame(raw: unknown, size = 8): SavedGame | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== SAVE_VERSION || !isInt(o.rngState) || o.rngState > 0xffffffff) return null;
  for (const k of ['score', 'combo', 'movesSinceClear', 'bestCombo', 'handsWithoutClear']) {
    if (!isInt(o[k])) return null;
  }
  if (typeof o.handHadClear !== 'boolean') return null;
  if (o.status !== GameStatus.PLAYING && o.status !== GameStatus.GAME_OVER) return null;

  const board = o.board;
  if (!Array.isArray(board) || board.length !== size) return null;
  for (const row of board) {
    if (!Array.isArray(row) || row.length !== size) return null;
    if (!row.every((c) => c === null || (typeof c === 'string' && c.length > 0))) return null;
  }

  const hand = o.hand;
  if (!Array.isArray(hand) || hand.length !== 3) return null;
  for (const p of hand) {
    if (p === null) continue;
    if (!p || typeof p !== 'object') return null;
    const { shape, color } = p as Record<string, unknown>;
    if (typeof shape !== 'string' || !SHAPES.some((s) => s.name === shape)) return null;
    if (typeof color !== 'string' || color.length === 0) return null;
  }
  if (hand.every((p) => p === null)) return null; // a live game always has a piece in hand

  return raw as SavedGame;
}
