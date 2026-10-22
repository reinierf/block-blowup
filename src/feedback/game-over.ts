// src/feedback/game-over.ts
// The game-over sequence as a pure timeline, so its timing is unit-tested and the renderer
// only draws what it says. After the last move: a pause (the move's own effects play out),
// then the reveal (a "No space left!" banner, the leftover tray pieces turn red and wiggle,
// the game-over sound and vibration), then the board greys out, then the score screen.
// A tap skips straight to the score screen.

export const GAME_OVER = {
  /** After the last placement, before anything game-over happens. */
  pauseSeconds: 0.6,
  /** Banner and leftover pieces alone, before the board starts greying. */
  revealSeconds: 1.2,
  /** The banner drops in over this long (it fades in with reduced motion). */
  bannerInSeconds: 0.35,
  /** Leftover pieces wiggle over this long, from the start of the reveal. */
  wiggleSeconds: 0.5,
  /** Wiggle amplitude, as a fraction of a tray cell. */
  wiggleAmp: 0.18,
  /** Full wiggle periods. */
  wiggleCycles: 3,
  /** Grey-out: the whole board takes about this long… */
  greySeconds: 1.5,
  /** …but no cell waits longer than this after the previous one. */
  greyPerCellMax: 0.045,
  /** After the last cell greys, before the score screen. */
  holdSeconds: 0.4,
  bannerText: 'No space left!',
} as const;

export type GameOverPhase = 'pause' | 'reveal' | 'grey' | 'done';

export interface GameOverFrame {
  phase: GameOverPhase;
  /** Whether the reveal has started (banner, red pieces, sound and vibration). */
  revealed: boolean;
  /** 0 → 1 as the banner comes in; 0 before the reveal. */
  banner: number;
  /** Horizontal offset of the leftover pieces, in tray cells. */
  wiggle: number;
  /** How many filled cells (in board order) are grey. */
  greyed: number;
}

/** Seconds between two cells greying, for a board with `filled` blocks. */
export function greyPerCell(filled: number): number {
  return filled > 0 ? Math.min(GAME_OVER.greyPerCellMax, GAME_OVER.greySeconds / filled) : 0;
}

/** Length of the whole sequence, until the score screen. */
export function gameOverSeconds(filled: number): number {
  return (
    GAME_OVER.pauseSeconds +
    GAME_OVER.revealSeconds +
    filled * greyPerCell(filled) +
    GAME_OVER.holdSeconds
  );
}

/** What the sequence shows `t` seconds after the last placement. */
export function gameOverAt(t: number, filled: number, reduceMotion: boolean): GameOverFrame {
  const G = GAME_OVER;
  const rt = t - G.pauseSeconds;
  const gt = rt - G.revealSeconds;
  const revealed = rt >= 0;
  const per = greyPerCell(filled);
  const greyed = gt < 0 ? 0 : per > 0 ? Math.min(filled, Math.floor(gt / per) + 1) : filled;
  let wiggle = 0;
  if (revealed && !reduceMotion && rt < G.wiggleSeconds) {
    const p = rt / G.wiggleSeconds;
    wiggle = G.wiggleAmp * (1 - p) * Math.sin(2 * Math.PI * G.wiggleCycles * p);
  }
  return {
    phase: t >= gameOverSeconds(filled) ? 'done' : !revealed ? 'pause' : gt < 0 ? 'reveal' : 'grey',
    revealed,
    banner: revealed ? Math.min(1, rt / G.bannerInSeconds) : 0,
    wiggle,
    greyed,
  };
}
