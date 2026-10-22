// src/feedback/plan.ts
// Turns a turn result into a feedback plan: what to show, play and vibrate. Pure, so the
// rules (thresholds, pitch per combo, shake per line…) are unit-tested; the renderer,
// audio manager and haptics only carry the plan out.

import type { TurnResult } from '../game/state';

export const FEEDBACK = {
  /** Show "Combo ×N" from this combo up. */
  comboTextFrom: 2,
  /** Screen shake amplitude (CSS px) per line beyond the first; none for 1-line clears. */
  shakePerExtraLine: 3,
  shakeMax: 12,
  shakeSeconds: 0.35,
  particlesPerCell: 3,
  particlesPerCellReduced: 1,
  /** Particles per placed cell on every drop (may be fractional): a smaller, slower puff. */
  dropParticlesPerCell: 2.8,
  dropParticlesPerCellReduced: 0,
  /** Vibration patterns (ms). */
  hapticPlace: 12,
  hapticClear: [20, 30, 35] as number[],
  hapticAllClear: [30, 40, 30, 40, 60] as number[],
  hapticGameOver: [60, 60, 120] as number[],
} as const;

export type SoundCue =
  | { kind: 'place' }
  | { kind: 'clear'; lines: number; combo: number }
  | { kind: 'allClear' }
  | { kind: 'gameOver' };

export interface FeedbackPlan {
  /** Popup at the centre of the cleared cells (board cell coordinates), or null. */
  popup: {
    x: number;
    y: number;
    points: string;
    praise: string | null;
    combo: string | null;
  } | null;
  /** Shake amplitude in CSS px (0 = none). */
  shake: number;
  particlesPerCell: number;
  /** Particles per placed cell (every drop). */
  dropParticlesPerCell: number;
  /** Full-board celebration (board clear). */
  celebrate: boolean;
  sounds: SoundCue[];
  haptic: number | number[] | null;
}

export function comboText(combo: number): string | null {
  return combo >= FEEDBACK.comboTextFrom ? `Combo ×${combo}` : null;
}

export function feedbackFor(result: TurnResult, opts: { reduceMotion: boolean }): FeedbackPlan {
  const cleared = result.clearedCells;
  const sounds: SoundCue[] = [{ kind: 'place' }];
  let haptic: FeedbackPlan['haptic'] = FEEDBACK.hapticPlace;
  let popup: FeedbackPlan['popup'] = null;

  if (result.lines > 0) {
    sounds.push({ kind: 'clear', lines: result.lines, combo: result.combo });
    haptic = FEEDBACK.hapticClear;
    const cx = cleared.reduce((a, c) => a + c.x, 0) / cleared.length + 0.5;
    const cy = cleared.reduce((a, c) => a + c.y, 0) / cleared.length + 0.5;
    popup = {
      x: cx,
      y: cy,
      points: `+${result.points}`,
      praise: result.allClear ? 'Board clear!' : result.praise,
      combo: comboText(result.combo),
    };
  }
  if (result.allClear) {
    sounds.push({ kind: 'allClear' });
    haptic = FEEDBACK.hapticAllClear;
  }
  if (result.gameOver) {
    sounds.push({ kind: 'gameOver' });
    haptic = FEEDBACK.hapticGameOver;
  }

  const shake =
    opts.reduceMotion || result.lines < 2
      ? 0
      : Math.min(FEEDBACK.shakeMax, FEEDBACK.shakePerExtraLine * (result.lines - 1) + 3);

  return {
    popup,
    shake,
    particlesPerCell: opts.reduceMotion
      ? FEEDBACK.particlesPerCellReduced
      : FEEDBACK.particlesPerCell,
    dropParticlesPerCell: opts.reduceMotion
      ? FEEDBACK.dropParticlesPerCellReduced
      : FEEDBACK.dropParticlesPerCell,
    celebrate: result.allClear,
    sounds,
    haptic,
  };
}
