import { describe, expect, it } from 'vitest';
import { ALL_CLEAR_BONUS } from '../../src/game/config';
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

  it('pins the combo multiplier: combo + 1, uncapped', () => {
    expect([0, 1, 2, 3, 4, 5].map(comboMultiplier)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(comboMultiplier(24)).toBe(25);
    expect(comboMultiplier(100)).toBe(101);
  });

  it('pins the line table: 20 per line up to 2 lines, growing faster from 3', () => {
    expect(LINE_POINTS).toEqual([0, 20, 40, 120, 240, 400, 600, 840]);
    const perLine = LINE_POINTS.slice(1).map((p, i) => p / (i + 1));
    expect(perLine[1]).toBe(perLine[0]);
    for (let i = 2; i < perLine.length; i++) expect(perLine[i]).toBeGreaterThan(perLine[i - 1]!);
  });

  it('pins line-clear points, using the last table entry beyond its end', () => {
    const table = [1, 2, 3, 4, 5, 6, 7, 8].map((lines) =>
      [1, 2, 3].map((combo) => lineClearPoints(lines, combo)),
    );
    expect(table).toEqual([
      [40, 60, 80],
      [80, 120, 160],
      [240, 360, 480],
      [480, 720, 960],
      [800, 1200, 1600],
      [1200, 1800, 2400],
      [1680, 2520, 3360],
      [1680, 2520, 3360],
    ]);
    expect(lineClearPoints(0, 1)).toBe(0);
  });

  it('matches clears measured in a recording of the original', () => {
    // [lines, combo, points shown in the game]
    const measured = [
      [1, 11, 240],
      [2, 12, 520],
      [1, 13, 280],
      [1, 17, 360],
      [1, 18, 380],
      [1, 20, 420],
      [2, 21, 880],
    ] as const;
    for (const [lines, combo, points] of measured) {
      expect(lineClearPoints(lines, combo)).toBe(points);
    }
  });

  it('multiplies the all-clear bonus by the combo multiplier', () => {
    expect(ALL_CLEAR_BONUS).toBe(300);
    expect(allClearPoints(1)).toBe(600);
    expect(allClearPoints(2)).toBe(900);
    expect(allClearPoints(20)).toBe(6300);
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
