// src/game/pieces.ts
// Piece shape definitions + the bag-based hand generator.
// Pure module: no DOM, no rendering.

/** A random source returning a float in [0, 1). */
export type Rng = () => number;

export type CellOffset = readonly [x: number, y: number];

export interface Shape {
  readonly id: number;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly CellOffset[];
}

interface ShapeDef {
  name: string;
  pattern: string[];
}

/**
 * Every shape is defined as a readable ASCII pattern ("X" = a filled cell).
 * Rows are equal length; top row first.
 */
const SHAPE_DEFS: ShapeDef[] = [
  // --- single ---------------------------------------------------------------
  { name: 'single', pattern: ['X'] },

  // --- straight lines -------------------------------------------------------
  { name: 'line2-h', pattern: ['XX'] },
  { name: 'line3-h', pattern: ['XXX'] },
  { name: 'line4-h', pattern: ['XXXX'] },
  { name: 'line5-h', pattern: ['XXXXX'] },
  { name: 'line2-v', pattern: ['X', 'X'] },
  { name: 'line3-v', pattern: ['X', 'X', 'X'] },
  { name: 'line4-v', pattern: ['X', 'X', 'X', 'X'] },
  { name: 'line5-v', pattern: ['X', 'X', 'X', 'X', 'X'] },

  // --- squares --------------------------------------------------------------
  { name: 'square2', pattern: ['XX', 'XX'] },
  { name: 'square3', pattern: ['XXX', 'XXX', 'XXX'] },

  // --- rectangles -----------------------------------------------------------
  { name: 'rect-2x3', pattern: ['XX', 'XX', 'XX'] },
  { name: 'rect-3x2', pattern: ['XXX', 'XXX'] },

  // --- small corners (3-cell L) --------------------------------------------
  { name: 'corner-tl', pattern: ['XX', 'X.'] },
  { name: 'corner-tr', pattern: ['XX', '.X'] },
  { name: 'corner-bl', pattern: ['X.', 'XX'] },
  { name: 'corner-br', pattern: ['.X', 'XX'] },

  // --- L / J (4-cell) -------------------------------------------------------
  { name: 'L-1', pattern: ['X.', 'X.', 'XX'] },
  { name: 'L-2', pattern: ['.X', '.X', 'XX'] },
  { name: 'L-3', pattern: ['XX', 'X.', 'X.'] },
  { name: 'L-4', pattern: ['XX', '.X', '.X'] },

  // --- T (4-cell) -----------------------------------------------------------
  { name: 'T-up', pattern: ['XXX', '.X.'] },
  { name: 'T-down', pattern: ['.X.', 'XXX'] },
  { name: 'T-left', pattern: ['X.', 'XX', 'X.'] },
  { name: 'T-right', pattern: ['.X', 'XX', '.X'] },

  // --- S / Z (4-cell) -------------------------------------------------------
  { name: 'S-h', pattern: ['.XX', 'XX.'] },
  { name: 'Z-h', pattern: ['XX.', '.XX'] },
  { name: 'S-v', pattern: ['X.', 'XX', '.X'] },
  { name: 'Z-v', pattern: ['.X', 'XX', 'X.'] },

  // --- big L (5-cell) -------------------------------------------------------
  { name: 'bigL-1', pattern: ['X..', 'X..', 'XXX'] },
  { name: 'bigL-2', pattern: ['..X', '..X', 'XXX'] },
  { name: 'bigL-3', pattern: ['XXX', 'X..', 'X..'] },
  { name: 'bigL-4', pattern: ['XXX', '..X', '..X'] },
];

/** Vibrant block palette; shapes map to a stable color by id. */
export const PALETTE: readonly string[] = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
];

/** The color used for a given shape. */
export function colorFor(shape: Shape): string {
  return PALETTE[shape.id % PALETTE.length]!;
}

/** Compile the ASCII definitions into shape objects. */
export const SHAPES: readonly Shape[] = Object.freeze(
  SHAPE_DEFS.map((def, id): Shape => {
    const height = def.pattern.length;
    const width = def.pattern[0]!.length;
    const cells: CellOffset[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (def.pattern[y]![x] === 'X') cells.push(Object.freeze([x, y] as const));
      }
    }
    return Object.freeze({ id, name: def.name, width, height, cells: Object.freeze(cells) });
  }),
);

/**
 * Deals shapes from a shuffled bag (no repeats until the bag is emptied, then reshuffle).
 * Produces a fairer distribution than independent random draws.
 */
export class PieceBag {
  readonly shapes: readonly Shape[];
  readonly rng: Rng;
  bag: number[] = [];

  constructor(shapes: readonly Shape[], rng: Rng) {
    this.shapes = shapes;
    this.rng = rng;
  }

  private refill(): void {
    this.bag = this.shapes.map((_, i) => i);
    // Fisher–Yates shuffle.
    for (let i = this.bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.bag[i], this.bag[j]] = [this.bag[j]!, this.bag[i]!];
    }
  }

  /** The next shape in the bag. */
  next(): Shape {
    if (this.bag.length === 0) this.refill();
    return this.shapes[this.bag.pop()!]!;
  }
}
