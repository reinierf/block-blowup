// src/game/state.ts
// The game state machine: board + hand, turn resolution, scoring, game-over detection.
// Pure module: no DOM, no rendering, no Math.random (the caller supplies the RNG).

import { Board, type LinePreview } from './board';
import { rowsFromBoard } from './bitboard';
import { Generator, type DealInfo } from './generator';
import type { Shape } from './pieces';
import type { Rng } from './rng';
import { COMBO_GRACE } from './config';
import { allClearPoints, lineClearPoints, placementPoints, praiseFor } from './scoring';

export const GameStatus = Object.freeze({
  PLAYING: 'playing',
  GAME_OVER: 'gameOver',
} as const);
export type GameStatus = (typeof GameStatus)[keyof typeof GameStatus];

export interface HandPiece {
  uid: number;
  shape: Shape;
  /** A PieceColor name; placed cells keep it. */
  color: string;
}

export interface ClearedCell {
  x: number;
  y: number;
  color: string;
}

export interface TurnResult {
  placedCells: [number, number][];
  clearedCells: ClearedCell[];
  rows: number[];
  cols: number[];
  lines: number;
  /** Combo streak after this move (still alive during the grace window). */
  combo: number;
  /** Placements since the last clear (0 if this move cleared). */
  movesSinceClear: number;
  /** This move emptied the whole board (and earned the all-clear bonus). */
  allClear: boolean;
  /** Praise word for a multi-line clear ("Good", "Great", ...), or null. */
  praise: string | null;
  /** Total points for this move: placement + line clear + all-clear bonus. */
  points: number;
  /** The generator's decisions when this move emptied the hand and a new one was dealt. */
  deal: DealInfo | null;
  gameOver: boolean;
}

export interface GameOptions {
  size?: number;
  rng: Rng;
}

let uidCounter = 0;

export class Game {
  readonly size: number;
  readonly rng: Rng;
  readonly board: Board;
  readonly generator: Generator;
  /** Three slots; null once a slot's piece has been placed. */
  hand: (HandPiece | null)[] = [null, null, null];
  score = 0;
  combo = 0;
  /** Placements in a row without a clear; the combo resets when this reaches COMBO_GRACE. */
  movesSinceClear = 0;
  bestCombo = 0;
  /** Completed hands in a row without any clear (feeds the mercy rule). */
  handsWithoutClear = 0;
  /** Something was cleared since the current hand was dealt. */
  handHadClear = false;
  /** The generator's decisions for the current hand. */
  lastDeal: DealInfo | null = null;
  status: GameStatus = GameStatus.PLAYING;

  constructor({ size = 8, rng }: GameOptions) {
    this.size = size;
    this.rng = rng;
    this.board = new Board(size);
    this.generator = new Generator(rng);
    this.reset();
  }

  reset(): void {
    this.board.reset();
    this.hand = [null, null, null];
    this.score = 0;
    this.combo = 0;
    this.movesSinceClear = 0;
    this.bestCombo = 0;
    this.handsWithoutClear = 0;
    this.handHadClear = false;
    this.status = GameStatus.PLAYING;
    this.dealHand();
    // An empty board always has a legal move, but keep the check for safety.
    if (!this.hasAnyMove()) this.status = GameStatus.GAME_OVER;
  }

  /** Deal a fresh hand of three from the generator. */
  dealHand(): DealInfo {
    const { shapes, colors, info } = this.generator.deal(rowsFromBoard(this.board), {
      score: this.score,
      handsWithoutClear: this.handsWithoutClear,
    });
    this.hand = shapes.map((shape, i) => ({ uid: ++uidCounter, shape, color: colors[i]! }));
    this.lastDeal = info;
    return info;
  }

  /** Is placing hand slot `handIndex` at (ox, oy) legal? */
  canPlace(handIndex: number, ox: number, oy: number): boolean {
    const slot = this.hand[handIndex];
    return !!slot && this.board.canPlace(slot.shape, ox, oy);
  }

  /**
   * Attempt to place a hand piece. On success: mutates the board, refills the hand if
   * empty, updates score/combo, and checks for game over. Returns null if illegal.
   */
  placeAt(handIndex: number, ox: number, oy: number): TurnResult | null {
    const slot = this.hand[handIndex];
    if (!slot || !this.board.canPlace(slot.shape, ox, oy)) return null;

    this.board.place(slot.shape, ox, oy, slot.color);
    this.hand[handIndex] = null;

    const placedCells = slot.shape.cells.map(([cx, cy]): [number, number] => [ox + cx, oy + cy]);

    let points = placementPoints(slot.shape);
    let clearedCells: ClearedCell[] = [];
    let allClear = false;

    const { rows, cols } = this.board.fullLines();
    const lines = rows.length + cols.length;

    if (lines > 0) {
      this.handHadClear = true;
      this.combo += 1;
      this.movesSinceClear = 0;
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;
      clearedCells = this.collectLineCells(rows, cols); // capture colors BEFORE clearing
      points += lineClearPoints(lines, this.combo);
      this.board.clearLines(rows, cols);
      if (this.board.isEmpty()) {
        allClear = true;
        points += allClearPoints(this.combo);
      }
    } else {
      this.movesSinceClear += 1;
      if (this.movesSinceClear >= COMBO_GRACE) this.combo = 0;
    }

    this.score += points;

    // Refill the hand once all three slots are used.
    let deal: DealInfo | null = null;
    if (this.hand.every((s) => s === null)) {
      this.handsWithoutClear = this.handHadClear ? 0 : this.handsWithoutClear + 1;
      this.handHadClear = false;
      deal = this.dealHand();
    }

    if (!this.hasAnyMove()) this.status = GameStatus.GAME_OVER;

    return {
      placedCells,
      clearedCells,
      rows,
      cols,
      lines,
      combo: this.combo,
      movesSinceClear: this.movesSinceClear,
      allClear,
      praise: praiseFor(lines),
      points,
      deal,
      gameOver: this.status === GameStatus.GAME_OVER,
    };
  }

  /** Can hand slot `handIndex` be placed anywhere? False for an empty slot. */
  pieceFits(handIndex: number): boolean {
    const slot = this.hand[handIndex];
    return !!slot && this.canPlaceAnywhere(slot.shape);
  }

  /**
   * The lines placing hand slot `handIndex` at (ox, oy) would clear, for the drag preview.
   * Null if the placement is illegal. Does not change the game.
   */
  previewAt(handIndex: number, ox: number, oy: number): LinePreview | null {
    const slot = this.hand[handIndex];
    return slot ? this.board.previewLines(slot.shape, ox, oy) : null;
  }

  /** Is there at least one legal placement for some piece currently in hand? */
  hasAnyMove(): boolean {
    return this.hand.some((slot) => slot !== null && this.canPlaceAnywhere(slot.shape));
  }

  private canPlaceAnywhere(shape: Shape): boolean {
    const maxX = this.size - shape.width;
    const maxY = this.size - shape.height;
    for (let oy = 0; oy <= maxY; oy++) {
      for (let ox = 0; ox <= maxX; ox++) {
        if (this.board.canPlace(shape, ox, oy)) return true;
      }
    }
    return false;
  }

  /** Union of all cells in the given full rows/columns, with their colors, de-duplicated. */
  private collectLineCells(rows: readonly number[], cols: readonly number[]): ClearedCell[] {
    const map = new Map<string, ClearedCell>();
    const add = (x: number, y: number): void => {
      map.set(`${x},${y}`, { x, y, color: this.board.grid[y]![x]! });
    };
    for (const y of rows) for (let x = 0; x < this.size; x++) add(x, y);
    for (const x of cols) for (let y = 0; y < this.size; y++) add(x, y);
    return [...map.values()];
  }
}
