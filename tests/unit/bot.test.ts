import { describe, expect, it } from 'vitest';
import { chooseMove, evaluateMove } from '../../src/sim/bot';
import { Game } from '../../src/game/state';
import { lcg } from '../../src/sim/lcg';
import { boardFrom, shape } from '../helpers/boards';

const EMPTY8 = Array<string>(8).fill('........');

describe('simulation bot', () => {
  it('scores a move as lines×100 − filled cells after + piece cells×2', () => {
    const empty = boardFrom(EMPTY8).grid;
    expect(evaluateMove(empty, shape('square2'), 0, 0)).toBe(-4 + 8);

    const nearlyFull = boardFrom([...EMPTY8.slice(0, 7), '..######']).grid;
    // Completes row 7, which then clears: 1 line, 0 cells left.
    expect(evaluateMove(nearlyFull, shape('line2-h'), 0, 7)).toBe(100 - 0 + 4);
  });

  it('prefers the clearing move and breaks ties by slot, then row, then column', () => {
    const game = new Game({ rng: lcg(1) });
    game.board.grid = boardFrom([...EMPTY8.slice(0, 7), '..######']).grid;
    game.hand = [
      { uid: 1, shape: shape('single'), color: 'a' },
      { uid: 2, shape: shape('line2-h'), color: 'b' },
      null,
    ];
    expect(chooseMove(game)).toEqual({ handIndex: 1, ox: 0, oy: 7, score: 104 });

    game.board.reset();
    expect(chooseMove(game)).toMatchObject({ handIndex: 1, ox: 0, oy: 0 });
  });

  it('returns null when nothing fits', () => {
    const game = new Game({ rng: lcg(1) });
    game.hand = [null, null, null];
    expect(chooseMove(game)).toBeNull();
  });
});
