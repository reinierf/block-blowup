// src/game/board.ts
// The 8×8 playing grid: occupancy, placement validation, line detection & clearing.
// Pure module: no DOM, no rendering.

import type { Shape } from './pieces';

/** A cell holds a color string when filled, else null. */
export type Cell = string | null;

export interface FullLines {
  rows: number[];
  cols: number[];
}

export class Board {
  readonly size: number;
  /** grid[y][x] */
  grid: Cell[][] = [];

  constructor(size = 8) {
    this.size = size;
    this.reset();
  }

  reset(): void {
    this.grid = Array.from({ length: this.size }, () => new Array<Cell>(this.size).fill(null));
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  isFree(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.grid[y]![x] === null;
  }

  isEmpty(): boolean {
    return this.grid.every((row) => row.every((cell) => cell === null));
  }

  /**
   * Can `shape` be placed with its bounding-box top-left at (ox, oy)?
   * Every shape cell must land on an in-bounds, empty cell.
   */
  canPlace(shape: Shape, ox: number, oy: number): boolean {
    for (const [cx, cy] of shape.cells) {
      if (!this.isFree(ox + cx, oy + cy)) return false;
    }
    return true;
  }

  /** Write `value` into every cell the shape covers. Assumes canPlace() already passed. */
  place(shape: Shape, ox: number, oy: number, value: string): void {
    for (const [cx, cy] of shape.cells) {
      this.grid[oy + cy]![ox + cx] = value;
    }
  }

  /** Indices of fully-filled rows/columns. */
  fullLines(): FullLines {
    const rows: number[] = [];
    const cols: number[] = [];
    for (let y = 0; y < this.size; y++) {
      if (this.grid[y]!.every((cell) => cell !== null)) rows.push(y);
    }
    for (let x = 0; x < this.size; x++) {
      let full = true;
      for (let y = 0; y < this.size; y++) {
        if (this.grid[y]![x] === null) {
          full = false;
          break;
        }
      }
      if (full) cols.push(x);
    }
    return { rows, cols };
  }

  /** Empty the given rows and columns. Returns the number of cells cleared. */
  clearLines(rows: readonly number[], cols: readonly number[]): number {
    let cleared = 0;
    for (const y of rows) {
      for (let x = 0; x < this.size; x++) {
        if (this.grid[y]![x] !== null) {
          this.grid[y]![x] = null;
          cleared++;
        }
      }
    }
    for (const x of cols) {
      for (let y = 0; y < this.size; y++) {
        if (this.grid[y]![x] !== null) {
          this.grid[y]![x] = null;
          cleared++;
        }
      }
    }
    return cleared;
  }
}
