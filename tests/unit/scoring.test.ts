import { describe, expect, it } from 'vitest';
import { ALL_CLEAR_BONUS, COMBO_MULT_CAP } from '../../src/game/config';
import {
  LINE_POINTS,
  allClearPoints,
  comboMultiplier,
  lineClearPoints,
  placementPoints,
  praiseFor,
} from '../../src/game/scoring';
import { shape } from '../helpers/boards';

describe('scoring', () => {
  it('pays one point per placed cell', () => {
    expect(placementPoints(shape('single'))).toBe(1);
    expect(placementPoints(shape('square3'))).toBe(9);
  });

  it('pins the line table, growing faster than linearly', () => {
    expect(LINE_POINTS).toEqual([0, 10, 40, 90, 160, 250, 360, 490]);
    const perLine = LINE_POINTS.slice(1).map((p, i) => p / (i + 1));
    for (let i = 1; i < perLine.length; i++) expect(perLine[i]).toBeGreaterThan(perLine[i - 1]!);
  });

  it('pins the combo multiplier, capped at COMBO_MULT_CAP', () => {
    expect([0, 1, 2, 3, 4, 5].map(comboMultiplier)).toEqual([1, 1, 1.5, 2, 2.5, 3]);
    expect(COMBO_MULT_CAP).toBe(5);
    expect(comboMultiplier(9)).toBe(5);
    expect(comboMultiplier(10)).toBe(5);
    expect(comboMultiplier(100)).toBe(5);
  });

  it('pins line-clear points, using the last table entry beyond its end', () => {
    const table = [1, 2, 3, 4, 5, 6, 7, 8].map((lines) =>
      [1, 2, 3].map((combo) => lineClearPoints(lines, combo)),
    );
    expect(table).toEqual([
      [10, 15, 20],
      [40, 60, 80],
      [90, 135, 180],
      [160, 240, 320],
      [250, 375, 500],
      [360, 540, 720],
      [490, 735, 980],
      [490, 735, 980],
    ]);
    expect(lineClearPoints(0, 1)).toBe(0);
  });

  it('multiplies the all-clear bonus by the combo multiplier', () => {
    expect(ALL_CLEAR_BONUS).toBe(300);
    expect(allClearPoints(1)).toBe(300);
    expect(allClearPoints(2)).toBe(450);
    expect(allClearPoints(20)).toBe(1500);
  });

  it('praises multi-line clears in escalating steps', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(praiseFor)).toEqual([
      null,
      null,
      'Good',
      'Great',
      'Excellent',
      'Amazing',
      'Amazing',
      'Amazing',
    ]);
  });
});
