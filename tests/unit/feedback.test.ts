import { describe, expect, it } from 'vitest';
import { FEEDBACK, comboText, feedbackFor } from '../../src/feedback/plan';
import type { TurnResult } from '../../src/game/state';

function result(over: Partial<TurnResult> = {}): TurnResult {
  return {
    placedCells: [[0, 0]],
    clearedCells: [],
    rows: [],
    cols: [],
    lines: 0,
    combo: 0,
    movesSinceClear: 1,
    allClear: false,
    praise: null,
    points: 1,
    deal: null,
    gameOver: false,
    ...over,
  };
}

const row7 = Array.from({ length: 8 }, (_, x) => ({ x, y: 7, color: 'red' }));
const motion = { reduceMotion: false };

describe('feedbackFor', () => {
  it('a plain placement: click and a short buzz, nothing else', () => {
    const p = feedbackFor(result(), motion);
    expect(p).toMatchObject({ popup: null, shake: 0, celebrate: false });
    expect(p.sounds).toEqual([{ kind: 'place' }]);
    expect(p.haptic).toBe(FEEDBACK.hapticPlace);
  });

  it('a clear: popup at the centre of the cleared cells, clear sound, clear vibration', () => {
    const p = feedbackFor(
      result({ clearedCells: row7, rows: [7], lines: 1, combo: 1, points: 11 }),
      motion,
    );
    expect(p.popup).toEqual({ x: 4, y: 7.5, points: '+11', praise: null, combo: null });
    expect(p.sounds).toEqual([{ kind: 'place' }, { kind: 'clear', lines: 1, combo: 1 }]);
    expect(p.haptic).toEqual(FEEDBACK.hapticClear);
    expect(p.shake).toBe(0); // one line: no shake
  });

  it('shows praise and combo text', () => {
    const p = feedbackFor(
      result({ clearedCells: row7, lines: 3, combo: 4, praise: 'Great', points: 200 }),
      motion,
    );
    expect(p.popup).toMatchObject({ praise: 'Great', combo: 'Combo ×4' });
  });

  it('shakes for 2+ lines, scaling with lines and capped', () => {
    const shake = (lines: number) =>
      feedbackFor(result({ clearedCells: row7, lines, combo: 1 }), motion).shake;
    expect(shake(1)).toBe(0);
    expect(shake(2)).toBeGreaterThan(0);
    expect(shake(3)).toBeGreaterThan(shake(2));
    expect(shake(6)).toBe(FEEDBACK.shakeMax);
  });

  it('every drop gets particles, fewer per cell than a line clear', () => {
    const plain = feedbackFor(result(), motion);
    expect(plain.dropParticlesPerCell).toBeGreaterThan(0);
    expect(plain.dropParticlesPerCell).toBeLessThan(plain.particlesPerCell);
    const clear = feedbackFor(result({ clearedCells: row7, lines: 1, combo: 1 }), motion);
    expect(clear.dropParticlesPerCell).toBe(plain.dropParticlesPerCell);
  });

  it('reduced motion: no drop particles', () => {
    expect(feedbackFor(result(), { reduceMotion: true }).dropParticlesPerCell).toBe(0);
  });

  it('reduced motion: no shake and fewer particles', () => {
    const r = result({ clearedCells: row7, lines: 4, combo: 1 });
    expect(feedbackFor(r, { reduceMotion: true })).toMatchObject({
      shake: 0,
      particlesPerCell: FEEDBACK.particlesPerCellReduced,
    });
    expect(feedbackFor(r, motion).particlesPerCell).toBe(FEEDBACK.particlesPerCell);
  });

  it('board clear: celebration, sting, praise "Board clear!"', () => {
    const p = feedbackFor(
      result({ clearedCells: row7, lines: 1, combo: 1, allClear: true, points: 311 }),
      motion,
    );
    expect(p.celebrate).toBe(true);
    expect(p.popup?.praise).toBe('Board clear!');
    expect(p.sounds.map((s) => s.kind)).toEqual(['place', 'clear', 'allClear']);
    expect(p.haptic).toEqual(FEEDBACK.hapticAllClear);
  });

  it('game over adds its sound and vibration', () => {
    const p = feedbackFor(result({ gameOver: true }), motion);
    expect(p.sounds.map((s) => s.kind)).toEqual(['place', 'gameOver']);
    expect(p.haptic).toEqual(FEEDBACK.hapticGameOver);
  });
});

describe('comboText', () => {
  it('starts at combo 2', () => {
    expect([0, 1, 2, 7].map(comboText)).toEqual([null, null, 'Combo ×2', 'Combo ×7']);
  });
});
