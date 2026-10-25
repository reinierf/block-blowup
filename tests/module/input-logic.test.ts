import { describe, expect, it } from 'vitest';
import { INPUT, dropTarget, holdsTarget, pieceOrigin } from '../../src/input-logic';
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

  it('moves the piece faster than an upward touch drag', () => {
    const o = pieceOrigin(layout, sq, { x: 200, y: 300 }, true, { x: 200, y: 500 });
    expect(o.y).toBeCloseTo(500 - 200 * INPUT.touchUpGain - 2 * cell - INPUT.touchLiftCells * cell);
    expect(INPUT.touchUpGain).toBeGreaterThan(1);
  });

  it('follows a downward touch drag 1:1', () => {
    const o = pieceOrigin(layout, sq, { x: 200, y: 600 }, true, { x: 200, y: 500 });
    expect(o.y).toBeCloseTo(600 - 2 * cell - INPUT.touchLiftCells * cell);
  });

  it('moves the piece faster than a sideways touch drag, both ways', () => {
    const right = pieceOrigin(layout, sq, { x: 250, y: 500 }, true, { x: 200, y: 500 });
    expect(right.x).toBeCloseTo(200 + 50 * INPUT.touchSideGain - cell);
    const left = pieceOrigin(layout, sq, { x: 150, y: 500 }, true, { x: 200, y: 500 });
    expect(left.x).toBeCloseTo(200 - 50 * INPUT.touchSideGain - cell);
    expect(INPUT.touchSideGain).toBeGreaterThan(1);
    expect(INPUT.touchSideGain).toBeLessThan(INPUT.touchUpGain);
  });

  it('does not amplify mouse drags', () => {
    expect(pieceOrigin(layout, sq, { x: 200, y: 300 }, false, { x: 100, y: 500 })).toEqual({
      x: 200 - cell,
      y: 300 - cell,
    });
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

describe('holdsTarget', () => {
  const target = { col: 3, row: 4 };

  it('holds the last legal target within holdCells of it', () => {
    expect(INPUT.holdCells).toBe(1.5);
    expect(holdsTarget(layout, at(3, 4), target)).toBe(true);
    expect(holdsTarget(layout, at(4.4, 4), target)).toBe(true);
    expect(holdsTarget(layout, at(3, 2.6), target)).toBe(true);
    expect(holdsTarget(layout, at(4, 5), target)).toBe(true); // diagonal: ~1.41 cells
  });

  it('releases it beyond holdCells', () => {
    expect(holdsTarget(layout, at(4.6, 4), target)).toBe(false);
    expect(holdsTarget(layout, at(3, 6.6), target)).toBe(false);
    expect(holdsTarget(layout, at(4.1, 5.1), target)).toBe(false); // diagonal: ~1.56 cells
  });

  it('holds past the board edge', () => {
    expect(holdsTarget(layout, at(-1, 0), { col: 0, row: 0 })).toBe(true);
    expect(holdsTarget(layout, at(-1.6, 0), { col: 0, row: 0 })).toBe(false);
  });
});
