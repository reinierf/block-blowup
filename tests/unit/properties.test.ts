import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COMBO_GRACE } from '../../src/game/config';
import { allClearPoints, lineClearPoints, praiseFor } from '../../src/game/scoring';
import { Game, GameStatus } from '../../src/game/state';
import { lcg } from '../../src/sim/lcg';

/** All legal moves for the current hand, in a stable order. */
function legalMoves(game: Game): [number, number, number][] {
  const moves: [number, number, number][] = [];
  game.hand.forEach((piece, i) => {
    if (!piece) return;
    for (let oy = 0; oy <= game.size - piece.shape.height; oy++) {
      for (let ox = 0; ox <= game.size - piece.shape.width; ox++) {
        if (game.board.canPlace(piece.shape, ox, oy)) moves.push([i, ox, oy]);
      }
    }
  });
  return moves;
}

// A function, so TypeScript doesn't narrow `status` from the loop condition.
const isOver = (game: Game): boolean => game.status === GameStatus.GAME_OVER;

/**
 * Play a game with random (not greedy) legal moves and check invariants after every turn.
 * `gameSeed` drives the piece bag; `moveSeed` picks the moves.
 */
function playRandomGame(gameSeed: number, moveSeed: number, maxMoves: number): void {
  const game = new Game({ rng: lcg(gameSeed) });
  const pick = lcg(moveSeed);
  for (let n = 0; n < maxMoves && game.status === GameStatus.PLAYING; n++) {
    const moves = legalMoves(game);
    expect(moves.length).toBeGreaterThan(0); // PLAYING implies a legal move exists
    const [i, ox, oy] = moves[Math.floor(pick() * moves.length)]!;
    const prevScore = game.score;
    const prevCombo = game.combo;
    const prevMisses = game.movesSinceClear;

    const r = game.placeAt(i, ox, oy)!;
    expect(r).not.toBeNull();

    // No full line remains after a turn resolves.
    expect(game.board.fullLines()).toEqual({ rows: [], cols: [] });
    // The score never decreases, and grows by exactly the turn's points.
    expect(r.points).toBeGreaterThan(0);
    expect(game.score).toBe(prevScore + r.points);
    // Combo grace rule: +1 on a clearing move; otherwise unchanged until COMBO_GRACE misses
    // in a row, then 0.
    if (r.lines > 0) {
      expect(game.combo).toBe(prevCombo + 1);
      expect(game.movesSinceClear).toBe(0);
    } else {
      expect(game.movesSinceClear).toBe(prevMisses + 1);
      expect(game.combo).toBe(game.movesSinceClear >= COMBO_GRACE ? 0 : prevCombo);
    }
    expect(r.combo).toBe(game.combo);
    expect(r.movesSinceClear).toBe(game.movesSinceClear);
    // A board clear is reported exactly when a clearing move leaves the board empty.
    expect(r.allClear).toBe(r.lines > 0 && game.board.isEmpty());
    // Points break down into placement + lines × combo + board-clear bonus × combo.
    expect(r.points).toBe(
      r.placedCells.length +
        lineClearPoints(r.lines, r.combo) +
        (r.allClear ? allClearPoints(r.combo) : 0),
    );
    expect(r.praise).toBe(praiseFor(r.lines));
    expect(game.bestCombo).toBeGreaterThanOrEqual(game.combo);
    // Game over exactly when no hand piece fits.
    expect(r.gameOver).toBe(isOver(game));
    expect(isOver(game)).toBe(!game.hasAnyMove());
    // The hand is never empty.
    expect(game.hand.some((p) => p !== null)).toBe(true);
  }
}

describe('game invariants (property-based)', () => {
  it('hold for random seeds and random legal moves', () => {
    fc.assert(
      fc.property(fc.nat(2 ** 31), fc.nat(2 ** 31), (gameSeed, moveSeed) => {
        playRandomGame(gameSeed, moveSeed, 200);
      }),
      { numRuns: 150 },
    );
  });
});
