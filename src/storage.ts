// src/storage.ts
// High-score persistence. Uses localStorage when available (browser / PWA / Capacitor
// webview) and degrades silently otherwise.

const HIGH_SCORE_KEY = 'block-blowup.highscore';

export function loadHighScore(): number {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY);
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(value: number): void {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(Math.floor(value)));
  } catch {
    /* storage unavailable — ignore */
  }
}
