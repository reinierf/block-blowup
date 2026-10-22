// src/sim/deal-boards.ts
// Realistic generator inputs for benchmarks: the board and context at every deal the bot
// faced in seeded games, plus extra crowded boards (where the solver works hardest).

import { rowsFromBoard, type Rows } from '../game/bitboard';
import type { DealContext } from '../game/generator';
import { Game, GameStatus } from '../game/state';
import { chooseMove } from './bot';
import { lcg } from './lcg';

export interface DealInput {
  rows: Rows;
  ctx: DealContext;
}

export function collectDealInputs(seeds: number): DealInput[] {
  const inputs: DealInput[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const game = new Game({ rng: lcg(seed) });
    while (game.status === GameStatus.PLAYING) {
      if (game.hand.filter((p) => p !== null).length === 1) {
        // The next placement triggers a deal: record the board it will see (approximately:
        // before this move's placement and clears).
        inputs.push({
          rows: rowsFromBoard(game.board),
          ctx: { score: game.score, handsWithoutClear: game.handsWithoutClear },
        });
      }
      const move = chooseMove(game)!;
      game.placeAt(move.handIndex, move.ox, move.oy);
    }
    // The final, crowded board: the hardest case for the solver.
    inputs.push({
      rows: rowsFromBoard(game.board),
      ctx: { score: game.score, handsWithoutClear: game.handsWithoutClear },
    });
  }
  return inputs;
}
