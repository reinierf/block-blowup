import { describe, expect, it } from 'vitest';
import { INPUT, dropTarget, pieceOrigin } from '../../src/input-logic';
import { computeLayout } from '../../src/render/layout';
import { shape } from '../helpers/boards';

const layout = computeLayout(390, 844);
const { x: bx, y: by, cell } = layout.board;
const at = (col: number, row: number) => ({ x: bx + col * cell, y: by + row * cell });

describe('pieceOrigin', () => {
  const sq = shape('square2');

  it('centres the piece on a mouse pointer', () => {
    expect(pieceOrigin(layout, sq, { x: 200, y: 300 }, false)).toEqual({
      x: 200 - cell,
      y: 300 - cell,
    });
  });

  it('lifts the piece above a finger on touch', () => {
    const o = pieceOrigin(layout, sq, { x: 200, y: 300 }, true);
    expect(o.x).toBe(200 - cell);
    expect(o.y).toBeCloseTo(300 - 2 * cell - INPUT.touchLiftCells * cell);
  });
});

describe('dropTarget', () => {
  const sq = shape('square2');

  it('snaps to the nearest cell over the board', () => {
    expect(dropTarget(layout, sq, at(3, 4))).toEqual({ col: 3, row: 4 });
    expect(
      dropTarget(layout, sq, { x: at(3, 4).x + cell * 0.4, y: at(3, 4).y - cell * 0.4 }),
    ).toEqual({ col: 3, row: 4 });
    expect(dropTarget(layout, sq, { x: at(3, 4).x + cell * 0.6, y: at(3, 4).y })).toEqual({
      col: 4,
      row: 4,
    });
  });

  it('snaps into the board within half a cell of an edge', () => {
    expect(dropTarget(layout, sq, at(-0.45, 0))).toEqual({ col: 0, row: 0 });
    expect(dropTarget(layout, sq, at(6.45, 6.45))).toEqual({ col: 6, row: 6 });
  });

  it('returns null beyond the tolerance on every side', () => {
    expect(dropTarget(layout, sq, at(-0.6, 3))).toBeNull();
    expect(dropTarget(layout, sq, at(3, -0.6))).toBeNull();
    expect(dropTarget(layout, sq, at(6.6, 3))).toBeNull();
    expect(dropTarget(layout, sq, at(3, 6.6))).toBeNull();
    expect(dropTarget(layout, sq, { x: bx, y: layout.hud.y })).toBeNull();
  });

  it('uses the piece size for the far edges', () => {
    const line = shape('line5-h');
    expect(dropTarget(layout, line, at(3, 0))).toEqual({ col: 3, row: 0 });
    expect(dropTarget(layout, line, at(3.6, 0))).toBeNull();
  });
});
