// src/input.ts
// Pointer-based drag & drop. Mouse, touch, and pen all share one code path.
// Reads geometry from the shared layout and validates moves against the Game.

import type { Shape } from './game/pieces';
import type { Game, TurnResult } from './game/state';
import type { Layout } from './render/layout';

export interface DragState {
  handIndex: number;
  shape: Shape;
  color: string;
  pointerId: number;
  /** Top-left of the floating piece, in canvas CSS px. */
  originX: number;
  originY: number;
  /** Snapped board target for the piece's top-left cell. */
  col: number;
  row: number;
  valid: boolean;
  isTouch: boolean;
}

export interface InputDeps {
  canvas: HTMLCanvasElement;
  getLayout: () => Layout | null;
  getGame: () => Game;
  /** Called with placeAt()'s result on a valid drop. */
  onPlace: (result: TurnResult) => void;
}

interface Point {
  x: number;
  y: number;
}

export function createInput({ canvas, getLayout, getGame, onPlace }: InputDeps): {
  readonly drag: DragState | null;
} {
  let drag: DragState | null = null;
  let activePointerId: number | null = null;

  function toLocal(e: PointerEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function slotAt(point: Point, layout: Layout): number {
    for (const slot of layout.hand.slots) {
      const left = slot.cx - slot.w / 2;
      const top = slot.cy - slot.h / 2;
      if (
        point.x >= left &&
        point.x <= left + slot.w &&
        point.y >= top &&
        point.y <= top + slot.h
      ) {
        return slot.index;
      }
    }
    return -1;
  }

  /** Recompute where the dragged piece would land and whether that's legal. */
  function computeTarget(d: DragState, layout: Layout): void {
    const game = getGame();
    const b = layout.board;
    let col = Math.round((d.originX - b.x) / b.cell);
    let row = Math.round((d.originY - b.y) / b.cell);
    col = Math.max(0, Math.min(game.size - d.shape.width, col));
    row = Math.max(0, Math.min(game.size - d.shape.height, row));
    d.col = col;
    d.row = row;
    d.valid = game.canPlace(d.handIndex, col, row);
  }

  /** Position the floating piece so it follows the pointer (lifted above a finger). */
  function positionDrag(d: DragState, point: Point): void {
    const layout = getLayout();
    if (!layout) return;
    const cell = layout.board.cell;
    const pw = d.shape.width * cell;
    const ph = d.shape.height * cell;
    d.originX = point.x - pw / 2;
    d.originY = d.isTouch ? point.y - ph - cell * 0.6 : point.y - ph / 2;
    computeTarget(d, layout);
  }

  function endDrag(): void {
    if (drag && canvas.hasPointerCapture?.(drag.pointerId)) {
      canvas.releasePointerCapture(drag.pointerId);
    }
    drag = null;
    activePointerId = null;
  }

  function onPointerDown(e: PointerEvent): void {
    if (drag || activePointerId !== null) return;
    const layout = getLayout();
    if (!layout) return;

    const point = toLocal(e);
    const handIndex = slotAt(point, layout);
    if (handIndex < 0) return;
    const piece = getGame().hand[handIndex];
    if (!piece) return;

    drag = {
      handIndex,
      shape: piece.shape,
      color: piece.color,
      pointerId: e.pointerId,
      originX: 0,
      originY: 0,
      col: 0,
      row: 0,
      valid: false,
      isTouch: e.pointerType === 'touch',
    };
    positionDrag(drag, point);
    activePointerId = e.pointerId;
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag || e.pointerId !== activePointerId) return;
    positionDrag(drag, toLocal(e));
    e.preventDefault();
  }

  function onPointerUp(e: PointerEvent): void {
    if (!drag || e.pointerId !== activePointerId) return;
    const { handIndex, col, row, valid } = drag;
    endDrag();
    if (valid) {
      const result = getGame().placeAt(handIndex, col, row);
      if (result) onPlace(result);
    }
    e.preventDefault();
  }

  function onPointerCancel(e: PointerEvent): void {
    if (!drag || e.pointerId !== activePointerId) return;
    endDrag();
  }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp, { passive: false });
  canvas.addEventListener('pointercancel', onPointerCancel, { passive: false });

  return {
    get drag() {
      return drag;
    },
  };
}
