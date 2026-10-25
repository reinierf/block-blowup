// src/input.ts
// Pointer-based drag & drop. Mouse, touch, and pen all share one code path.
// Geometry comes from the shared layout (render/layout.ts) and input-logic.ts; moves are
// validated against the Game.

import type { LinePreview } from './game/board';
import type { Shape } from './game/pieces';
import type { Game, TurnResult } from './game/state';
import { dropTarget, holdsTarget, pieceOrigin, type Point } from './input-logic';
import { slotAt, type Layout } from './render/layout';

export interface DragState {
  handIndex: number;
  shape: Shape;
  color: string;
  pointerId: number;
  isTouch: boolean;
  /** Pointer position (CSS px) where the drag started. */
  start: Point;
  /** Top-left of the floating piece, in CSS px. */
  originX: number;
  originY: number;
  /** Snapped board target, or null when the piece is too far from the board. */
  target: { col: number; row: number } | null;
  /** The target is a legal placement. */
  valid: boolean;
  /** Lines the drop would clear (empty preview when none); null unless `valid`. */
  preview: LinePreview | null;
  /** The most recent legal target and its preview, held while within `INPUT.holdCells`. */
  held: { col: number; row: number; preview: LinePreview } | null;
}

export interface InputDeps {
  /** Element that receives pointer events (the full-viewport canvas). */
  surface: HTMLElement;
  getLayout: () => Layout | null;
  getGame: () => Game;
  /** Called with placeAt()'s result on a valid drop. */
  onPlace: (result: TurnResult) => void;
}

export function createInput({ surface, getLayout, getGame, onPlace }: InputDeps): {
  readonly drag: DragState | null;
  /** Drop the piece being dragged without placing it (leaving the game mid-drag). */
  cancel(): void;
} {
  let drag: DragState | null = null;

  function toLocal(e: PointerEvent): Point {
    const rect = surface.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function move(d: DragState, point: Point): void {
    const layout = getLayout();
    if (!layout) return;
    const origin = pieceOrigin(layout, d.shape, point, d.isTouch, d.start);
    d.originX = origin.x;
    d.originY = origin.y;
    const game = getGame();
    d.target = dropTarget(layout, d.shape, origin, game.size);
    d.preview = d.target ? game.previewAt(d.handIndex, d.target.col, d.target.row) : null;
    if (d.target && d.preview) {
      d.held = { ...d.target, preview: d.preview };
    } else if (d.held && holdsTarget(layout, origin, d.held)) {
      // Not over a legal spot: keep the last legal one while the piece is still near it.
      d.target = { col: d.held.col, row: d.held.row };
      d.preview = d.held.preview;
    } else {
      d.held = null;
    }
    d.valid = d.preview !== null;
  }

  function endDrag(): void {
    if (drag && surface.hasPointerCapture?.(drag.pointerId)) {
      surface.releasePointerCapture(drag.pointerId);
    }
    drag = null;
  }

  function onPointerDown(e: PointerEvent): void {
    if (drag) return; // one active pointer at a time
    const layout = getLayout();
    if (!layout) return;
    const point = toLocal(e);
    const handIndex = slotAt(layout, point.x, point.y);
    if (handIndex < 0) return;
    const piece = getGame().hand[handIndex];
    // Greyed-out pieces (no legal placement anywhere) can't be picked up.
    if (!piece || !getGame().pieceFits(handIndex)) return;

    drag = {
      handIndex,
      shape: piece.shape,
      color: piece.color,
      pointerId: e.pointerId,
      isTouch: e.pointerType === 'touch',
      start: point,
      originX: 0,
      originY: 0,
      target: null,
      valid: false,
      preview: null,
      held: null,
    };
    move(drag, point);
    surface.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return;
    move(drag, toLocal(e));
    e.preventDefault();
  }

  function onPointerUp(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return;
    move(drag, toLocal(e));
    const { handIndex, target, valid } = drag;
    endDrag();
    if (valid && target) {
      const result = getGame().placeAt(handIndex, target.col, target.row);
      if (result) onPlace(result);
    }
    e.preventDefault();
  }

  function onPointerCancel(e: PointerEvent): void {
    if (drag && e.pointerId === drag.pointerId) endDrag();
  }

  surface.addEventListener('pointerdown', onPointerDown, { passive: false });
  surface.addEventListener('pointermove', onPointerMove, { passive: false });
  surface.addEventListener('pointerup', onPointerUp, { passive: false });
  surface.addEventListener('pointercancel', onPointerCancel, { passive: false });
  surface.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    get drag() {
      return drag;
    },
    cancel: endDrag,
  };
}
