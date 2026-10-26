// src/feedback/score-count.ts
// The HUD score's count-up after a move: first the placement points one at a time, then a
// short pause, then the clear points (lines, combo, all-clear) in a quick ease. Pure, so
// the timing is unit-tested; main.ts ticks it every frame and shows `shown`.

export const SCORE_COUNT = {
  /** Seconds per placement point; the first one shows at once. */
  placeStep: 0.04,
  /** Seconds between the last placement point and the clear points. */
  pause: 0.3,
  /** Clear points: fraction of the remaining gap closed per second (about 0.4 s in all). */
  clearRate: 8,
} as const;

type Phase = 'idle' | 'place' | 'pause' | 'clear';

export class ScoreCounter {
  /** The score to show now. */
  shown: number;
  private placeTarget: number;
  private target: number;
  private phase: Phase = 'idle';
  private timer = 0;

  constructor(score = 0) {
    this.shown = this.placeTarget = this.target = score;
  }

  /** Jump straight to `score`, dropping any count in progress (new game, resume). */
  reset(score: number): void {
    this.shown = this.placeTarget = this.target = score;
    this.phase = 'idle';
  }

  /**
   * Start counting a move worth `points`, of which `placePoints` for the placement. A count
   * still running from the previous move finishes at once.
   */
  add(placePoints: number, points: number): void {
    this.skip();
    this.placeTarget = this.shown + Math.min(placePoints, points);
    this.target = this.shown + points;
    this.phase = 'place';
    this.timer = SCORE_COUNT.placeStep;
  }

  /** Finish the current count at once. Returns true if `shown` changed. */
  skip(): boolean {
    const before = this.shown;
    this.shown = this.target;
    this.phase = 'idle';
    return this.shown !== before;
  }

  /** Advance by `dt` seconds. Returns true if `shown` changed. */
  tick(dt: number): boolean {
    const before = this.shown;
    if (this.phase === 'place') {
      this.timer += dt;
      while (this.timer >= SCORE_COUNT.placeStep && this.shown < this.placeTarget) {
        this.shown++;
        this.timer -= SCORE_COUNT.placeStep;
      }
      if (this.shown >= this.placeTarget) {
        this.shown = this.placeTarget;
        this.phase = this.target > this.placeTarget ? 'pause' : 'idle';
        this.timer = 0;
      }
    } else if (this.phase === 'pause') {
      this.timer += dt;
      if (this.timer >= SCORE_COUNT.pause) this.phase = 'clear';
    } else if (this.phase === 'clear') {
      const gap = this.target - this.shown;
      const step = Math.max(1, Math.ceil(gap * Math.min(1, dt * SCORE_COUNT.clearRate)));
      this.shown = Math.min(this.target, this.shown + step);
      if (this.shown === this.target) this.phase = 'idle';
    }
    return this.shown !== before;
  }
}
