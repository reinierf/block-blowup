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

### Hand generation (`src/game/generator.ts`)

You always hold **3 pieces**. When all three are placed, the generator deals a new hand.
Every number below lives in `src/game/config.ts`.

- **Seeded RNG.** All randomness goes through the RNG passed to `new Game({ rng })`. The
  app uses `Mulberry32` (`src/game/rng.ts`) seeded from `crypto.getRandomValues`; its
  state is a single uint32, so a game can be saved and replayed exactly.
- **Difficulty** is a value 0–1 from the score, piecewise linear through
  `DIFFICULTY_CURVE`: 0 → 0, 500 → 0.2, 1500 → 0.45, 3000 → 0.7, 6000+ → 1
  (`difficultyFor` in `src/game/difficulty.ts`).
- **Weights per shape family** (`FAMILY_WEIGHTS`, easy → hard, linear in difficulty). A
  family's weight is split equally between its orientations:

  | Family                         | Easy (d=0)  | Hard (d=1) |
  | ------------------------------ | ----------- | ---------- |
  | single, line2, square2, corner | 6, 6, 6, 6  | 2, 3, 4, 4 |
  | line3                          | 5           | 4          |
  | line4, L, T                    | 3, 2.5, 2.5 | 4, 4, 3.5  |
  | line5, rect                    | 1.5, 1.5    | 4, 3.5     |
  | square3, SZ, bigL              | 1, 1, 1     | 4, 3.5, 4  |

- **No triples:** if the first two picks are the same shape, the third excludes it.
- **Hard fairness rule:** a hand in which no piece fits anywhere is never dealt. The
  generator redraws (up to `MAX_REDRAWS` = 20); if every hand was dead, it swaps the
  smallest piece that fits into the first slot.
- **Soft fairness rule:** with probability `pSolvable(d)` (1.0 at d=0, falling linearly to
  0.7 at d=1), the hand must be placeable in full, in some order, with clears in between.
  A depth-first search (`src/game/solver.ts`) checks this, stopping at the first success.
  Each search is capped at `SOLVER_NODE_BUDGET` (2000) placements and each deal at
  `DEAL_NODE_BUDGET` (5000); a search that runs out counts as "not proven". If no
  solvable hand turns up, the first hand that at least fits is accepted.
- **Mercy rule:** if the board is more than `MERCY_FILL` (60%) full, or `MERCY_HANDS` (2)
  hands in a row had no clear (`Game.handsWithoutClear`), every shape that could complete
  at least one line on the current board gets `MERCY_BOOST` (×4) weight.
- **Reporting:** each deal's decisions (`DealInfo`: difficulty, redraws, mercy and its
  reason, whether solvability was required and proven, fallback, solver nodes) are in
  `Game.lastDeal` and in the turn result's `deal` field when a move triggered a new hand.
- **Speed:** the solver and generator work on packed 8×8 bitboards
  (`src/game/bitboard.ts`). Measured in Node on a desktop: p50 0.007 ms, p99 0.02 ms per
  deal; `tests/sim/deal-budget.test.ts` fails if p99 exceeds 1 ms or any deal 4 ms.

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

   `LINE_POINTS = [0, 10, 40, 90, 160, 250, 360, 490]`
   → 1 line = 10, 2 = 40, 3 = 90, 4 = 160, 5 = 250, 6 = 360, 7+ = 490. Clearing more at
   once is super-linear. (With the current shapes a single move can clear at most 6 lines.)

3. **Combo multiplier** — `comboMultiplier(combo) = min(5, 1 + 0.5 * (combo - 1))`

   ×1 for the first clear, +0.5 per further clear in the streak, capped at
   `COMBO_MULT_CAP` (×5, reached at combo 9).

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

4. **Board-clear bonus** — when a clearing move leaves the board completely empty, it
   also earns `round(ALL_CLEAR_BONUS × comboMultiplier)` with `ALL_CLEAR_BONUS = 300`, and
   the turn result has `allClear: true`.

5. **Praise** — every turn result carries a `praise` word for multi-line clears:
   2 lines → "Good", 3 → "Great", 4 → "Excellent", 5+ → "Amazing" (`PRAISE_BY_LINES`);
   `null` otherwise. The renderer will show it in Phase 6, together with "Combo ×N".

Total points for a move = placement + line-clear + board-clear bonus. The turn result
(`TurnResult` in `src/game/state.ts`) reports the placed and cleared cells, rows, cols,
`lines`, `combo`, `movesSinceClear`, `allClear`, `praise`, `points` and `gameOver`;
renderers drive all effects from it and never recompute rules.

### Tuning choices (taste; easy to change in `config.ts`)

- Combo multiplier capped at ×5 so very long streaks don't dwarf everything else.
- Praise words and thresholds as above. Single-line clears get no word.
- Generator: the difficulty curve, family weights, `P_SOLVABLE_HARD` = 0.7,
  `MERCY_FILL` = 0.6, `MERCY_HANDS` = 2, `MERCY_BOOST` = 4.

## 6. Game over

Checked after each placement (and after a hand is refilled): if **no** piece currently in
the hand can be placed anywhere on the board, the game ends. A freshly dealt hand is never
dead (hard fairness rule), so the game can only end partway through a hand. Note it's the _current hand_
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
| `src/game/pieces.ts`     | Shape set (with families), palette                          |
| `src/game/config.ts`     | Every tunable gameplay number                               |
| `src/game/rng.ts`        | Seeded RNG (mulberry32), weighted picks                     |
| `src/game/difficulty.ts` | Difficulty from score, P(solvable)                          |
| `src/game/generator.ts`  | Hand dealing: weights, fairness, mercy                      |
| `src/game/solver.ts`     | Can a whole hand be placed? (bounded DFS)                   |
| `src/game/bitboard.ts`   | Packed board representation for search                      |
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
