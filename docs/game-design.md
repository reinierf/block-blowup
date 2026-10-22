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

- **Drag and drop** a piece from the tray onto the board using Pointer Events, so mouse,
  touch, and pen all use one code path (`src/input.ts`). Only one pointer is tracked at a
  time; extra touches are ignored. The whole tray slot is the hit area (at least 44×44 px).
- **Greyed-out pieces:** a tray piece that fits nowhere on the board is drawn dimmed and
  grey (`Game.pieceFits`) and cannot be picked up.
- **Lift:** a picked-up piece grows from tray size to board size over
  `INPUT.liftSeconds` (0.12 s), moving from its tray position to the pointer. With the
  mouse it is centred on the pointer; on touch it floats `INPUT.touchLiftCells` (1.6)
  cells above the finger so the thumb never hides it.
- **Snapping** (`dropTarget` in `src/input-logic.ts`): the piece's top-left snaps to the
  nearest cell when the piece is over the board or overhangs it by at most half a cell
  (`INPUT.dropTolerance`). Farther away there is no target: no ghost is shown and
  releasing returns the piece to the tray.
- While there is a target, a **ghost** shows where the piece would land: the piece's own
  block colour, faded, when legal; a faded red when blocked.
- **Line-clear preview** (the most important feedback in the game): when a legal drop
  would complete rows or columns, the existing cells of those lines take on the dragged
  piece's colour and the ghost cells in them turn almost opaque. The logic is pure and
  tested (`Board.previewLines`, `Game.previewAt`): it places the piece on a virtual copy
  and reports the completed rows, columns and their cells (crossings counted once).
- On release: a legal drop places the piece; anything else returns it to the tray.

## 8. Visuals and layout

- **Renderer:** PixiJS v8 (WebGL; WebGPU where available) behind the `Renderer` interface
  (`src/render/renderer.ts`, implementation `pixi-renderer.ts`). Block textures are baked
  once per colour and cell size. The canvas covers the whole viewport and renders at
  `devicePixelRatio`, capped at 2. Frames are only drawn when something changed (game
  state, drag, layout, running effects), and the loop pauses while the tab is hidden.
- **Theme** (`src/render/theme.ts`; every colour lives there): close to the original but
  subdued. Navy gradient background `#1E2A44` to `#18223A`, board panel `#141C30`, empty
  cells `#212C47`, seven muted block colours (red `#D46A63`, orange `#DB8F5A`, yellow
  `#D9BC62`, green `#72B77A`, cyan `#5DB3C4`, blue `#5F86D0`, purple `#9578C2`), text
  `#E6EAF2` / `#9AA6BF`, accent `#F2C46D`. Blocks are bevelled squares (lighter top-left
  edge, darker bottom-right, soft gloss), all at low contrast. The DOM HUD and overlays
  read the same tokens through CSS custom properties.
- **Piece colours:** each dealt hand gets three different colours, picked by the seeded
  RNG (`Generator`); placed cells keep their colour. The game layer only knows colour
  names; the theme maps names to colours.
- **Layout** (`src/render/layout.ts`, portrait first): HUD (64 px) at the top of the safe
  area; the board as wide as the column allows minus a 16 px gutter, shrinking if the
  height requires; the tray of three equal slots below it, filling the rest of the screen
  (thumb reach). Wider screens centre a column of at most 480 px. Safe-area insets come
  from `env(safe-area-inset-*)` (`viewport-fit=cover`). Zooming is not disabled; gestures
  on the game area are (`touch-action: none`, no overscroll, no selection, no long-press
  menu).
- **HUD:** score (counts up to the new value in about 0.4 s), a combo badge (from combo
  2), best score, and a mute button. Fixed grid columns, so nothing shifts when the badge
  appears.

## 8a. Feedback

Every effect is driven by the turn result. `feedbackFor(result, { reduceMotion })` in
`src/feedback/plan.ts` (pure, unit-tested) turns it into a plan; the renderer, the audio
manager and haptics only carry the plan out. Numbers live in `FEEDBACK` (plan.ts) and
`AUDIO` (audio.ts).

- **Clear:** cleared cells flash and shrink, particles burst in the cells' colours
  (3 per cell, 1 with reduced motion). A popup rises from the **centre of the cleared
  cells** (kept inside the board): the praise word ("Good" / "Great" / "Excellent" /
  "Amazing" for 2 / 3 / 4 / 5+ lines, from the turn result), `+points`, and "Combo ×N" from
  combo 2.
- **Screen shake** for clears of 2+ lines: amplitude 3 px + 3 px per extra line, capped
  at 12 px, decaying over 0.35 s. Off with reduced motion.
- **Board clear:** "Board clear!" as the praise word, a gentle accent glow over the board
  (peaks at 28% opacity; no full-screen flash), and a multicoloured burst from the board
  centre.
- **Game over:** filled blocks turn grey one by one (row by row, about 1 s in total), then
  the score screen, which shows **"New best!"** when the score beats the best score from
  when the game started.
- **Audio** (`src/audio.ts`, synthesised with Web Audio, no files): a soft click on every
  placement; a clear chord with one more note per extra line (up to 4) whose root rises
  2 semitones per combo step (from C5, capped one octave up); a rising arpeggio sting for
  a board clear; a falling phrase on game over. The AudioContext is created and resumed
  on the first pointer event (iOS requirement). Mute is saved in settings.
- **Haptics** (`src/haptics.ts`): 12 ms on placement, a short pattern on clears, longer
  ones for board clear and game over. Feature-detected: where `navigator.vibrate` is
  missing (iOS Safari) it silently does nothing. On/off is a setting.
- **Reduced motion:** the `reducedMotion` setting is `system` (follows
  `prefers-reduced-motion`), `on` or `off`. When active: no shake, fewer particles.
- **Settings** (`src/settings.ts`, key `block-blowup.settings`): `muted`, `haptics`,
  `reducedMotion`. Loading never throws; corrupt or old data falls back to defaults field
  by field. Only mute has a button so far; the settings screen comes in Phase 7.

## 9. Persistence

- The **high score** (`block-blowup.highscore`, `src/storage.ts`) and the **settings**
  (`block-blowup.settings`, `src/settings.ts`) are saved in `localStorage`. No accounts,
  no network, no telemetry.

## 10. Code map

| File                          | Responsibility                                             |
| ----------------------------- | ---------------------------------------------------------- |
| `src/main.ts`                 | Bootstrap, frame loop, wiring, HUD/overlay                 |
| `src/game/pieces.ts`          | Shape set (with families), piece colour names              |
| `src/game/config.ts`          | Every tunable gameplay number                              |
| `src/game/rng.ts`             | Seeded RNG (mulberry32), weighted picks                    |
| `src/game/difficulty.ts`      | Difficulty from score, P(solvable)                         |
| `src/game/generator.ts`       | Hand dealing: weights, fairness, mercy                     |
| `src/game/solver.ts`          | Can a whole hand be placed? (bounded DFS)                  |
| `src/game/bitboard.ts`        | Packed board representation for search                     |
| `src/game/board.ts`           | 8×8 grid, collision/placement, line detection & clearing   |
| `src/game/scoring.ts`         | Placement points, line-clear points, combo multiplier      |
| `src/game/state.ts`           | Game state machine, hand management, turn resolution       |
| `src/render/layout.ts`        | Mobile-first geometry (HUD, board, tray, safe area)        |
| `src/render/renderer.ts`      | Renderer interface                                         |
| `src/render/pixi-renderer.ts` | PixiJS renderer: board, tray, drag, ghost, effects         |
| `src/render/theme.ts`         | Colour tokens                                              |
| `src/input-logic.ts`          | Pure drag geometry: piece origin, snapping, drop tolerance |
| `src/test-hook.ts`            | `?seed&test=1` hook for Playwright (dev/test builds only)  |
| `src/input.ts`                | Pointer-based drag & drop                                  |
| `src/storage.ts`              | High-score persistence                                     |

### Design rule

Everything under `src/game/` is **pure** — no DOM, no canvas, no browser APIs. It can be
run in Node and unit-tested directly. Rendering and input live outside it.
