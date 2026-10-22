import { beforeEach, describe, expect, it } from 'vitest';
import { Mulberry32 } from '../../src/game/rng';
import { saveGame } from '../../src/game/save';
import { Game } from '../../src/game/state';
import {
  HIGH_SCORE_KEY,
  SAVED_GAME_KEY,
  clearSavedGame,
  loadHighScore,
  loadSavedGame,
  saveGameInProgress,
  saveHighScore,
} from '../../src/storage';

const throwing = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

function aSave() {
  const rng = new Mulberry32(3);
  return saveGame(new Game({ rng: rng.next }), rng.state);
}

beforeEach(() => localStorage.clear());

describe('high score', () => {
  it('round-trips', () => {
    saveHighScore(1234.7);
    expect(localStorage.getItem(HIGH_SCORE_KEY)).toBe('1234');
    expect(loadHighScore()).toBe(1234);
  });

  it('is 0 when missing, corrupt or negative', () => {
    expect(loadHighScore()).toBe(0);
    for (const bad of ['abc', '-5', 'NaN', 'Infinity', '']) {
      localStorage.setItem(HIGH_SCORE_KEY, bad);
      expect(loadHighScore()).toBe(0);
    }
  });

  it('never throws when localStorage is unavailable', () => {
    expect(loadHighScore(throwing)).toBe(0);
    expect(() => saveHighScore(10, throwing)).not.toThrow();
    expect(loadHighScore(null)).toBe(0);
  });
});

describe('game in progress', () => {
  it('round-trips and can be cleared', () => {
    const save = aSave();
    saveGameInProgress(save);
    expect(loadSavedGame()).toEqual(save);
    clearSavedGame();
    expect(localStorage.getItem(SAVED_GAME_KEY)).toBeNull();
    expect(loadSavedGame()).toBeNull();
  });

  it('ignores corrupt JSON and old-format saves', () => {
    localStorage.setItem(SAVED_GAME_KEY, '{"v":1,');
    expect(loadSavedGame()).toBeNull();
    localStorage.setItem(SAVED_GAME_KEY, JSON.stringify({ ...aSave(), v: 0 }));
    expect(loadSavedGame()).toBeNull();
    localStorage.setItem(SAVED_GAME_KEY, JSON.stringify({ board: [], score: 10 }));
    expect(loadSavedGame()).toBeNull();
  });

  it('never throws when localStorage is unavailable', () => {
    expect(loadSavedGame(throwing)).toBeNull();
    expect(() => saveGameInProgress(aSave(), throwing)).not.toThrow();
    expect(() => clearSavedGame(throwing)).not.toThrow();
    expect(loadSavedGame(null)).toBeNull();
  });
});
