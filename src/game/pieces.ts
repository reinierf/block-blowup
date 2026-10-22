// src/game/pieces.ts
// Piece shape definitions and the palette. Hands are dealt by generator.ts.
// Pure module: no DOM, no rendering.

export type { Rng } from './rng';

/** Shape families: generator weights are set per family (see config.ts). */
export type ShapeFamily =
  | 'single'
  | 'line2'
  | 'line3'
  | 'line4'
  | 'line5'
  | 'square2'
  | 'square3'
  | 'rect'
  | 'corner'
  | 'L'
  | 'T'
  | 'SZ'
  | 'bigL'
  | 'diag2'
  | 'diag3'
  | 'diag4';

export type CellOffset = readonly [x: number, y: number];

export interface Shape {
  readonly id: number;
  readonly name: string;
  readonly family: ShapeFamily;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly CellOffset[];
}

interface ShapeDef {
  name: string;
  family: ShapeFamily;
  pattern: string[];
}

/**
 * Every shape is defined as a readable ASCII pattern ("X" = a filled cell).
 * Rows are equal length; top row first.
 */
const SHAPE_DEFS: ShapeDef[] = [
  // --- single ---------------------------------------------------------------
  { name: 'single', family: 'single', pattern: ['X'] },

  // --- straight lines -------------------------------------------------------
  { name: 'line2-h', family: 'line2', pattern: ['XX'] },
  { name: 'line3-h', family: 'line3', pattern: ['XXX'] },
  { name: 'line4-h', family: 'line4', pattern: ['XXXX'] },
  { name: 'line5-h', family: 'line5', pattern: ['XXXXX'] },
  { name: 'line2-v', family: 'line2', pattern: ['X', 'X'] },
  { name: 'line3-v', family: 'line3', pattern: ['X', 'X', 'X'] },
  { name: 'line4-v', family: 'line4', pattern: ['X', 'X', 'X', 'X'] },
  { name: 'line5-v', family: 'line5', pattern: ['X', 'X', 'X', 'X', 'X'] },

  // --- squares --------------------------------------------------------------
  { name: 'square2', family: 'square2', pattern: ['XX', 'XX'] },
  { name: 'square3', family: 'square3', pattern: ['XXX', 'XXX', 'XXX'] },

  // --- rectangles -----------------------------------------------------------
  { name: 'rect-2x3', family: 'rect', pattern: ['XX', 'XX', 'XX'] },
  { name: 'rect-3x2', family: 'rect', pattern: ['XXX', 'XXX'] },

  // --- small corners (3-cell L) --------------------------------------------
  { name: 'corner-tl', family: 'corner', pattern: ['XX', 'X.'] },
  { name: 'corner-tr', family: 'corner', pattern: ['XX', '.X'] },
  { name: 'corner-bl', family: 'corner', pattern: ['X.', 'XX'] },
  { name: 'corner-br', family: 'corner', pattern: ['.X', 'XX'] },

  // --- L / J (4-cell) -------------------------------------------------------
  { name: 'L-1', family: 'L', pattern: ['X.', 'X.', 'XX'] },
  { name: 'L-2', family: 'L', pattern: ['.X', '.X', 'XX'] },
  { name: 'L-3', family: 'L', pattern: ['XX', 'X.', 'X.'] },
  { name: 'L-4', family: 'L', pattern: ['XX', '.X', '.X'] },

  // --- T (4-cell) -----------------------------------------------------------
  { name: 'T-up', family: 'T', pattern: ['XXX', '.X.'] },
  { name: 'T-down', family: 'T', pattern: ['.X.', 'XXX'] },
  { name: 'T-left', family: 'T', pattern: ['X.', 'XX', 'X.'] },
  { name: 'T-right', family: 'T', pattern: ['.X', 'XX', '.X'] },

  // --- S / Z (4-cell) -------------------------------------------------------
  { name: 'S-h', family: 'SZ', pattern: ['.XX', 'XX.'] },
  { name: 'Z-h', family: 'SZ', pattern: ['XX.', '.XX'] },
  { name: 'S-v', family: 'SZ', pattern: ['X.', 'XX', '.X'] },
  { name: 'Z-v', family: 'SZ', pattern: ['.X', 'XX', 'X.'] },

  // --- big L (5-cell) -------------------------------------------------------
  { name: 'bigL-1', family: 'bigL', pattern: ['X..', 'X..', 'XXX'] },
  { name: 'bigL-2', family: 'bigL', pattern: ['..X', '..X', 'XXX'] },
  { name: 'bigL-3', family: 'bigL', pattern: ['XXX', 'X..', 'X..'] },
  { name: 'bigL-4', family: 'bigL', pattern: ['XXX', '..X', '..X'] },

  // --- diagonals (cells touch only at corners; rare) -------------------------
  { name: 'diag2-down', family: 'diag2', pattern: ['X.', '.X'] },
  { name: 'diag2-up', family: 'diag2', pattern: ['.X', 'X.'] },
  { name: 'diag3-down', family: 'diag3', pattern: ['X..', '.X.', '..X'] },
  { name: 'diag3-up', family: 'diag3', pattern: ['..X', '.X.', 'X..'] },
  { name: 'diag4-down', family: 'diag4', pattern: ['X...', '.X..', '..X.', '...X'] },
  { name: 'diag4-up', family: 'diag4', pattern: ['...X', '..X.', '.X..', 'X...'] },
];

/**
 * Piece colour names. The game only deals in names; the theme (src/render/theme.ts) maps
 * each name to an actual colour.
 */
export const PIECE_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'] as const;
export type PieceColor = (typeof PIECE_COLORS)[number];

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
    return Object.freeze({
      id,
      name: def.name,
      family: def.family,
      width,
      height,
      cells: Object.freeze(cells),
    });
  }),
);
