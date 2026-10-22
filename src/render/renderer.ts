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
  /** Game-over sequence (blocks fade to grey one by one); calls `onDone` when finished. */
  playGameOver(game: Game, onDone: () => void): void;
  /** Drop all running effects (e.g. on restart). */
  clearEffects(): void;
}

export interface RendererOptions {
  /** Effects finish instantly (test mode and, later, reduced motion). */
  freezeAnimations: boolean;
  /** Upper bound for the device pixel ratio used for rendering. */
  maxResolution: number;
}
