import { describe, expect, it } from 'vitest';
import { GAME_OVER, gameOverAt, gameOverSeconds, greyPerCell } from '../../src/feedback/game-over';

const G = GAME_OVER;
const revealAt = G.pauseSeconds;
const greyAt = G.pauseSeconds + G.revealSeconds;

describe('game-over sequence', () => {
  it('shows nothing during the pause after the last move', () => {
    for (const t of [0, revealAt / 2, revealAt - 0.001]) {
      expect(gameOverAt(t, 30, false)).toEqual({
        phase: 'pause',
        revealed: false,
        banner: 0,
        wiggle: 0,
        greyed: 0,
      });
    }
  });

  it('reveals the banner and wiggles the leftover pieces before any block greys', () => {
    const start = gameOverAt(revealAt, 30, false);
    expect(start).toMatchObject({ phase: 'reveal', revealed: true, banner: 0, greyed: 0 });
    expect(gameOverAt(revealAt + G.bannerInSeconds, 30, false).banner).toBe(1);
    const wiggles = [0.05, 0.1, 0.2, 0.3].map((d) => gameOverAt(revealAt + d, 30, false).wiggle);
    expect(wiggles.some((w) => w > 0) && wiggles.some((w) => w < 0)).toBe(true);
    for (const w of wiggles) expect(Math.abs(w)).toBeLessThanOrEqual(G.wiggleAmp);
    expect(gameOverAt(revealAt + G.wiggleSeconds, 30, false).wiggle).toBe(0);
    expect(gameOverAt(greyAt - 0.001, 30, false)).toMatchObject({ phase: 'reveal', greyed: 0 });
  });

  it('does not wiggle with reduced motion, but keeps the pause and the banner', () => {
    for (let d = 0; d < G.revealSeconds; d += 0.05) {
      const f = gameOverAt(revealAt + d, 30, true);
      expect(f.wiggle).toBe(0);
      expect(f.revealed).toBe(true);
    }
    expect(gameOverAt(revealAt - 0.001, 30, true).revealed).toBe(false);
  });

  it('greys the blocks one by one, then holds, then is done', () => {
    const n = 30;
    const per = greyPerCell(n);
    expect(gameOverAt(greyAt + 1e-9, n, false)).toMatchObject({ phase: 'grey', greyed: 1 });
    expect(gameOverAt(greyAt + 10.5 * per, n, false).greyed).toBe(11);
    expect(gameOverAt(greyAt + n * per, n, false).greyed).toBe(n);
    const end = gameOverSeconds(n);
    expect(gameOverAt(end - 0.001, n, false).phase).toBe('grey');
    expect(gameOverAt(end, n, false)).toMatchObject({ phase: 'done', greyed: n, banner: 1 });
    expect(gameOverAt(Infinity, n, false)).toMatchObject({ phase: 'done', greyed: n, wiggle: 0 });
  });

  it('greys a full board in about greySeconds, a sparse one cell by cell at most', () => {
    expect(64 * greyPerCell(64)).toBeCloseTo(G.greySeconds);
    expect(greyPerCell(5)).toBe(G.greyPerCellMax);
    expect(greyPerCell(0)).toBe(0);
  });

  it('gives the player at least 1.5 s before any block greys, and ends within 4 s', () => {
    expect(greyAt).toBeGreaterThanOrEqual(1.5);
    for (const n of [0, 1, 20, 63]) expect(gameOverSeconds(n)).toBeLessThanOrEqual(4);
  });
});
