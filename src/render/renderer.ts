// src/render/renderer.ts
// The renderer interface. main.ts and input talk to this, never to Pixi directly, and
// src/game/ knows nothing about rendering. Effects are driven only by the turn result.

import type { FeedbackPlan } from '../feedback/plan';
import type { Game, TurnResult } from '../game/state';
import type { DragState } from '../input';
import type { Layout } from './layout';

export interface Renderer {
  /** The element that receives pointer events (covers the whole viewport). */
  readonly canvas: HTMLCanvasElement;
  /** New viewport size or layout. */
  resize(layout: Layout): void;
  /**
   * Advance animations by `dt` seconds and draw the current state. Skips drawing when
   * nothing changed since the last frame; returns whether it drew.
   */
  frame(game: Game, drag: DragState | null, dt: number): boolean;
  /** Start the effects for a resolved turn, as decided by its feedback plan. */
  playEffects(result: TurnResult, plan: FeedbackPlan): void;
  /** Game-over sequence (see feedback/game-over.ts). Instant when animations are frozen. */
  playGameOver(game: Game, cb: GameOverCallbacks): void;
  /** Skip the running game-over sequence to its end (a tap); otherwise does nothing. */
  skipGameOver(): void;
  /** Drop all running effects (e.g. on restart). */
  clearEffects(): void;
}

export interface GameOverCallbacks {
  /** No wiggle or drop-in (the pause and the banner stay). */
  reduceMotion: boolean;
  /** The banner appears: play the game-over sound and vibration. */
  onReveal: () => void;
  /** The sequence is over (or skipped): show the score screen. */
  onDone: () => void;
}

export interface RendererOptions {
  /** Effects finish instantly (test mode and, later, reduced motion). */
  freezeAnimations: boolean;
  /** Upper bound for the device pixel ratio used for rendering. */
  maxResolution: number;
}
