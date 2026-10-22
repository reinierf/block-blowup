// src/storage.ts
// Persistence of the high score and the game in progress, in localStorage when available
// (browser / PWA / Capacitor webview). Never throws: missing, blocked or full storage and
// corrupt data all degrade to "nothing saved".

import { parseSavedGame, type SavedGame } from './game/save';

export const HIGH_SCORE_KEY = 'block-blowup.highscore';
export const SAVED_GAME_KEY = 'block-blowup.game';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStore(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(store: StorageLike | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(store: StorageLike | null, key: string, value: string | null): void {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, value);
  } catch {
    /* storage unavailable or full: ignore */
  }
}

export function loadHighScore(store = defaultStore()): number {
  const value = Number(read(store, HIGH_SCORE_KEY));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function saveHighScore(value: number, store = defaultStore()): void {
  write(store, HIGH_SCORE_KEY, String(Math.floor(value)));
}

/** The saved game in progress, or null if there is none (or it is corrupt or outdated). */
export function loadSavedGame(store = defaultStore()): SavedGame | null {
  const text = read(store, SAVED_GAME_KEY);
  if (!text) return null;
  try {
    return parseSavedGame(JSON.parse(text));
  } catch {
    return null;
  }
}

export function saveGameInProgress(saved: SavedGame, store = defaultStore()): void {
  write(store, SAVED_GAME_KEY, JSON.stringify(saved));
}

export function clearSavedGame(store = defaultStore()): void {
  write(store, SAVED_GAME_KEY, null);
}
