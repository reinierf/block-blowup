# Game Design & Behavior — Block Blowup

> **Living document.** This describes how the game _actually_ works, updated as features
> are built. If something here disagrees with the code, the code wins — fix this doc.
> See [`docs/plan.md`](./plan.md) for the roadmap.

## 1. Concept

A single-player, endless puzzle game. An 8×8 grid; you drag block pieces from a hand of
three onto the board. Filling an entire row or column clears it and awards points. The
game continues until none of your remaining pieces can be placed anywhere.

There is no timer and no losing by running out of space _gradually_ — you only lose the
moment the board is so full that the current hand has no legal move.

## 2. Board

- Fixed **8×8** grid (`Board.size`).
- Each cell is either **empty** (`null`) or **filled** with a color value (the color of
  the piece that was placed there).
- Coordinates are `(x, y)` where `x` is the column (0 = left) and `y` is the row
  (0 = top). A shape has a bounding box, and its cells are offsets from that box's
  top-left corner.

### Placement rules

A piece may be placed with its top-left at `(ox, oy)` only if **every** cell of the shape
lands on an in-bounds, currently-empty cell. Pieces cannot rotate, cannot overlap, and
cannot hang off the edge.

## 3. Pieces

Pieces are fixed polyomino shapes — like Tetris blocks but with **no rotation** and a
wider variety (including straight lines up to 5 long, larger squares, corners, T/S/Z
shapes, and big L-shapes). Each shape is always drawn in a consistent color derived from
its shape id.

The full shape set lives in `src/game/pieces.ts` (`SHAPES`). 33 shapes, including:

| Family        | Examples                            |
| ------------- | ----------------------------------- |
| Single        | 1×1                                 |
| Lines         | length 2–5, horizontal and vertical |
| Squares       | 2×2, 3×3                            |
| Rectangles    | 2×3, 3×2                            |
| Small corners | 3-cell L (4 orientations)           |
| L / J         | 4-cell L (4 orientations)           |
| T             | 4 orientations                      |
| S / Z         | 2 orientations each                 |
| Big L         | 5-cell L (4 orientations)           |

### Hand generation (the "bag")

- You always hold **3 pieces** at a time.
- Pieces come from a **shuffled bag** of all shapes (`PieceBag`). The bag is dealt without
  replacement and reshuffled when emptied — this avoids long streaks of the same shape and
  keeps the distribution fair (the classic Tetris "7-bag" idea).
- When all three slots are used up, a fresh hand of three is dealt automatically.
- The RNG is required and supplied by the caller (`new Game({ rng })`), so a seeded RNG makes a game fully deterministic. The app currently passes `Math.random`.

## 4. Clearing lines

After a placement, the game checks every row and every column:

- A row clears if all 8 of its cells are filled.
- A column clears if all 8 of its cells are filled.
- **Rows and columns clear in the same step**, and cells counted by both are only cleared
  once (`_collectLineCells` de-duplicates with a map).

The number of lines cleared is `rows.length + cols.length`.

## 5. Scoring

Scoring formulas live in `src/game/scoring.ts`; every tunable number lives in
`src/game/config.ts`.

1. **Placement points** — equal to the number of cells in the piece placed
   (a 4-cell piece gives 4 points just for being placed). This rewards keeping the board
   active rather than hoarding.

2. **Line-clear points** — awarded when one or more full lines are cleared:

   ```
   base = LINE_POINTS[lines]        // lines capped at the table length
   points = round(base * comboMultiplier)
   ```

   `LINE_POINTS = [0, 10, 40, 90, 160]`
   → 1 line = 10, 2 = 40, 3 = 90, 4+ = 160. Clearing more at once is super-linear.

3. **Combo multiplier** — `comboMultiplier(combo) = 1 + 0.5 * (combo - 1)`

   The combo counter increments on every placement that clears at least one line. A
   placement that clears nothing does **not** break the streak straight away: the game
   counts misses in `movesSinceClear`, and the combo resets to 0 only when that reaches
   `COMBO_GRACE` (3), i.e. on the third non-clearing placement in a row. Any clear resets
   `movesSinceClear` to 0. So:
   - Clear, miss, miss, clear → the second clear is combo 2 (×1.5).
   - Clear, miss, miss, miss → combo back to 0; the next clear starts again at 1.

   The streak therefore survives roughly one hand without a clear, like the original.
   `bestCombo` records the longest streak achieved this run. Both `combo` and
   `movesSinceClear` are reported in every turn result.

## 6. Game over

Checked after each placement (and after a hand is refilled): if **no** piece currently in
the hand can be placed anywhere on the board, the game ends. Note it's the _current hand_
that matters — if two of your three pieces still fit, you keep playing.

## 7. Controls

- **Drag and drop** a piece from the hand onto the board using Pointer Events, so mouse,
  touch, and pen all use one code path (`src/input.ts`).
- While dragging, a **ghost preview** shows where the piece would land:
  - **Green** = valid placement.
  - **Red** = blocked / out of bounds.
- The target cell snaps to the nearest grid cell of the piece's top-left, clamped to the
  board so near-edge drops still land.
- On release: a valid drop places the piece; an invalid drop returns it to the hand.
- On touch, the piece floats slightly above the finger so it isn't hidden.

## 8. Visual & feedback (polish)

- Dark, modern theme with rounded, lightly-glossy blocks (gradient + top highlight).
- **Line clear**: cleared cells flash white and shrink out.
- **Particles**: small colored squares burst from cleared cells (colored to match).
- **Score popup**: `+points` floats up from the board center, with a `Combo xN` line when
  a combo is active.
- **HUD**: current score, an active combo badge, and best score.
- **Game-over overlay**: final score, best score, and a "Play again" button.

## 9. Persistence

- Only the **high score** is saved, in `localStorage` under the key `block-blowup.highscore`
  (`src/storage.ts`). No accounts, no network, no telemetry.

## 10. Code map

| File                     | Responsibility                                              |
| ------------------------ | ----------------------------------------------------------- |
| `src/main.ts`            | Bootstrap, game loop, wiring, effects spawning, HUD/overlay |
| `src/game/pieces.ts`     | Shape set, palette, bag RNG                                 |
| `src/game/board.ts`      | 8×8 grid, collision/placement, line detection & clearing    |
| `src/game/scoring.ts`    | Placement points, line-clear points, combo multiplier       |
| `src/game/state.ts`      | Game state machine, hand management, turn resolution        |
| `src/render/layout.ts`   | Geometry (board + hand) for a given viewport size           |
| `src/render/renderer.ts` | All canvas drawing (board, hand, ghost, effects)            |
| `src/input.ts`           | Pointer-based drag & drop                                   |
| `src/storage.ts`         | High-score persistence                                      |

### Design rule

Everything under `src/game/` is **pure** — no DOM, no canvas, no browser APIs. It can be
run in Node and unit-tested directly. Rendering and input live outside it.
