// src/sim/bot.ts
// The greedy, intentionally weak simulation bot from HANDOVER.md section 4.
// For every hand piece and every legal position:
//   score = linesCleared × 100 − filledCellsAfterPlacement + pieceCells × 2
// and the best move wins (first one found on ties: hand slot, then row, then column).

import type { Cell } from '../game/board';
import type { Shape } from '../game/pieces';
import type { Game } from '../game/state';

export interface BotMove {
  handIndex: number;
  ox: number;
  oy: number;
  score: number;
}

/** Evaluate placing `shape` at (ox, oy) on a copy of `grid`. Assumes the move is legal. */
export function evaluateMove(
  grid: readonly (readonly Cell[])[],
  shape: Shape,
  ox: number,
  oy: number,
): number {
  const size = grid.length;
  const filled = grid.map((row) => row.map((c) => c !== null));
  for (const [cx, cy] of shape.cells) filled[oy + cy]![ox + cx] = true;

  const fullRows: number[] = [];
  const fullCols: number[] = [];
  for (let y = 0; y < size; y++) if (filled[y]!.every(Boolean)) fullRows.push(y);
  for (let x = 0; x < size; x++) if (filled.every((row) => row[x])) fullCols.push(x);
  for (const y of fullRows) for (let x = 0; x < size; x++) filled[y]![x] = false;
  for (const x of fullCols) for (let y = 0; y < size; y++) filled[y]![x] = false;

  const filledAfter = filled.reduce((n, row) => n + row.filter(Boolean).length, 0);
  return (fullRows.length + fullCols.length) * 100 - filledAfter + shape.cells.length * 2;
}

/** The bot's chosen move, or null if no hand piece fits anywhere. */
export function chooseMove(game: Game): BotMove | null {
  let best: BotMove | null = null;
  game.hand.forEach((piece, handIndex) => {
    if (!piece) return;
    const { shape } = piece;
    for (let oy = 0; oy <= game.size - shape.height; oy++) {
      for (let ox = 0; ox <= game.size - shape.width; ox++) {
        if (!game.board.canPlace(shape, ox, oy)) continue;
        const score = evaluateMove(game.board.grid, shape, ox, oy);
        if (!best || score > best.score) best = { handIndex, ox, oy, score };
      }
    }
  });
  return best;
}
