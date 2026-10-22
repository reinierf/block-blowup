// src/game/bitboard.ts
// Compact boards for search. The solver and generator try thousands of placements per
// deal, so this avoids the object-heavy Board.
//
// - Rows: one 8-bit mask per row (bit x = column x filled). Easy to build and read.
// - Packed: the whole 8×8 board in two 32-bit ints, `lo` = rows 0–3, `hi` = rows 4–7,
//   row y at bits 8·(y mod 4). With every legal placement of a shape precomputed, a fit
//   check is two ANDs and nothing is allocated. Packed boards are 8×8 only.

import type { Board } from './board';
import type { Shape } from './pieces';

/** Row masks, top row first. Treated as immutable: operations return new arrays. */
export type Rows = readonly number[];

export const PACKED_SIZE = 8;

export function rowsFromBoard(board: Board): number[] {
  return board.grid.map((row) => row.reduce((m, c, x) => (c === null ? m : m | (1 << x)), 0));
}

const maskCache = new Map<number, number[]>();

/** The shape's cells as one mask per shape row, at column offset 0. */
export function shapeMasks(shape: Shape): number[] {
  let masks = maskCache.get(shape.id);
  if (!masks) {
    masks = new Array<number>(shape.height).fill(0);
    for (const [cx, cy] of shape.cells) masks[cy]! |= 1 << cx;
    maskCache.set(shape.id, masks);
  }
  return masks;
}

export function canPlaceRows(rows: Rows, shape: Shape, ox: number, oy: number): boolean {
  const size = rows.length;
  if (ox < 0 || oy < 0 || ox + shape.width > size || oy + shape.height > size) return false;
  const masks = shapeMasks(shape);
  for (let r = 0; r < masks.length; r++) {
    if ((masks[r]! << ox) & rows[oy + r]!) return false;
  }
  return true;
}

export interface PlaceResult {
  rows: number[];
  lines: number;
}

/** Place a shape (assumed legal), then clear full rows and columns. */
export function placeRows(rows: Rows, shape: Shape, ox: number, oy: number): PlaceResult {
  const size = rows.length;
  const full = (1 << size) - 1;
  const next = rows.slice();
  const masks = shapeMasks(shape);
  for (let r = 0; r < masks.length; r++) next[oy + r]! |= masks[r]! << ox;

  let colsFull = full;
  let rowsFull = 0;
  let lines = 0;
  for (let y = 0; y < size; y++) {
    colsFull &= next[y]!;
    if (next[y] === full) {
      rowsFull |= 1 << y;
      lines++;
    }
  }
  if (rowsFull === 0 && colsFull === 0) return { rows: next, lines: 0 };
  for (let x = 0; x < size; x++) if (colsFull & (1 << x)) lines++;
  const keep = full & ~colsFull;
  for (let y = 0; y < size; y++) next[y] = rowsFull & (1 << y) ? 0 : next[y]! & keep;
  return { rows: next, lines };
}

export function filledCount(rows: Rows): number {
  let n = 0;
  for (const m of rows) n += popcount(m);
  return n;
}

function popcount(x: number): number {
  let n = 0;
  for (let v = x >>> 0; v; v &= v - 1) n++;
  return n;
}

// --- Packed boards ---------------------------------------------------------------------

export function packRows(rows: Rows): [lo: number, hi: number] {
  let lo = 0;
  let hi = 0;
  for (let y = 0; y < 4; y++) lo |= rows[y]! << (8 * y);
  for (let y = 4; y < 8; y++) hi |= rows[y]! << (8 * (y - 4));
  return [lo, hi];
}

const placementCache = new Map<number, Int32Array>();

/** Every in-bounds placement of `shape` on an 8×8 board as [lo, hi] mask pairs. */
export function placements(shape: Shape): Int32Array {
  let out = placementCache.get(shape.id);
  if (!out) {
    const pairs: number[] = [];
    const masks = shapeMasks(shape);
    for (let oy = 0; oy + shape.height <= PACKED_SIZE; oy++) {
      for (let ox = 0; ox + shape.width <= PACKED_SIZE; ox++) {
        let lo = 0;
        let hi = 0;
        masks.forEach((m, r) => {
          const y = oy + r;
          if (y < 4) lo |= (m << ox) << (8 * y);
          else hi |= (m << ox) << (8 * (y - 4));
        });
        pairs.push(lo, hi);
      }
    }
    out = Int32Array.from(pairs);
    placementCache.set(shape.id, out);
  }
  return out;
}

const BYTES = 0x01010101;

/**
 * Clear every full row and column of a packed board. Results are written to `out`
 * (lo, hi, lines) so hot loops don't allocate.
 */
export function clearPacked(lo: number, hi: number, out: Int32Array): void {
  // A column is full when its bit is set in all 8 row bytes.
  let cols = lo & (lo >>> 8) & (lo >>> 16) & (lo >>> 24) & hi & (hi >>> 8) & (hi >>> 16);
  cols &= (hi >>> 24) & 0xff;
  let rowMaskLo = 0;
  let rowMaskHi = 0;
  let lines = popcount(cols);
  for (let k = 0; k < 4; k++) {
    if (((lo >>> (8 * k)) & 0xff) === 0xff) {
      rowMaskLo |= 0xff << (8 * k);
      lines++;
    }
    if (((hi >>> (8 * k)) & 0xff) === 0xff) {
      rowMaskHi |= 0xff << (8 * k);
      lines++;
    }
  }
  const keep = ~(cols * BYTES);
  out[0] = lo & ~rowMaskLo & keep;
  out[1] = hi & ~rowMaskHi & keep;
  out[2] = lines;
}

/** Does `shape` fit anywhere? */
export function fitsAnywhere(rows: Rows, shape: Shape): boolean {
  const [lo, hi] = packRows(rows);
  const p = placements(shape);
  for (let i = 0; i < p.length; i += 2) {
    if ((p[i]! & lo) === 0 && (p[i + 1]! & hi) === 0) return true;
  }
  return false;
}

/** Can `shape` be placed somewhere so that it completes at least one line? */
export function completesALine(rows: Rows, shape: Shape): boolean {
  const [lo, hi] = packRows(rows);
  const p = placements(shape);
  const out = new Int32Array(3);
  for (let i = 0; i < p.length; i += 2) {
    const plo = p[i]!;
    const phi = p[i + 1]!;
    if ((plo & lo) !== 0 || (phi & hi) !== 0) continue;
    clearPacked(lo | plo, hi | phi, out);
    if (out[2]! > 0) return true;
  }
  return false;
}

/** The most lines `shape` can clear in one placement (0 if it completes none, or fits nowhere). */
export function maxLinesCleared(rows: Rows, shape: Shape): number {
  const [lo, hi] = packRows(rows);
  const p = placements(shape);
  const out = new Int32Array(3);
  let best = 0;
  for (let i = 0; i < p.length; i += 2) {
    const plo = p[i]!;
    const phi = p[i + 1]!;
    if ((plo & lo) !== 0 || (phi & hi) !== 0) continue;
    clearPacked(lo | plo, hi | phi, out);
    if (out[2]! > best) best = out[2]!;
  }
  return best;
}
