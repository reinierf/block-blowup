import { describe, expect, it } from 'vitest';
import {
  LINE_POINTS,
  comboMultiplier,
  lineClearPoints,
  placementPoints,
} from '../../src/game/scoring';
import { shape } from '../helpers/boards';

describe('scoring (current fork behaviour)', () => {
  it('pays one point per placed cell', () => {
    expect(placementPoints(shape('single'))).toBe(1);
    expect(placementPoints(shape('square3'))).toBe(9);
  });

  it('pins the line table', () => {
    expect(LINE_POINTS).toEqual([0, 10, 40, 90, 160]);
  });

  it('pins the combo multiplier', () => {
    expect([0, 1, 2, 3, 4, 5].map(comboMultiplier)).toEqual([1, 1, 1.5, 2, 2.5, 3]);
  });

  it('pins line-clear points, capping lines at the end of the table', () => {
    const table = [1, 2, 3, 4, 5, 6].map((lines) =>
      [1, 2, 3, 4].map((combo) => lineClearPoints(lines, combo)),
    );
    expect(table).toEqual([
      [10, 15, 20, 25],
      [40, 60, 80, 100],
      [90, 135, 180, 225],
      [160, 240, 320, 400],
      [160, 240, 320, 400],
      [160, 240, 320, 400],
    ]);
    expect(lineClearPoints(0, 1)).toBe(0);
  });
});
