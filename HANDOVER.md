# Handover: Block Blowup (fork of SSWheatley/block_blast)

You are picking up a project to build **Block Blowup**: a mobile-first PWA block
puzzle game closely modelled on Block Blast! (Hungry Studio). It is for **personal use
only**, not for distribution. This document holds the research, decisions and plan
made so far. Work through the phases in order. Each phase ends with passing tests
and a commit.

---

## 0. Settled with the user

- **Name:** Block Blowup. Use `block-blowup` for the repo, package name and storage-key
  prefix. **Repo location (settled 2026-10-22):** keep the existing GitHub fork
  `reinierf/block-blast` as is; `block-blowup` is used for the package name and storage
  keys only. Pages URL: `https://reinierf.github.io/block-blast/`.
- **Use:** personal only. A visual style close to the original is fine (see 3.5).
- **Target:** an installable **PWA**. The UI is **mobile-first**, portrait phone first.
- **Rendering:** **WebGL via PixiJS**. More visual splendour will follow, so port the
  renderer early rather than polish the Canvas 2D version first.

---

## 1. Context and decisions

- **Base:** fork of <https://github.com/SSWheatley/block_blast>. It is MIT licensed, about
  1,000 lines of vanilla JS, draws to a canvas, has no dependencies and no tests.
  It is about a week old, so treat it as a skeleton. We will not track it upstream.
- **Keep:** the split between pure game logic (`src/game/`, no DOM) and rendering and
  input. The seedable RNG. Pointer Events drag and drop. The layout module (geometry
  shared by the renderer and input).
- **Change:**
  - **TypeScript (strict) + Vite + Vitest.** The upcoming work is mostly rule changes,
    and types plus tests make that safe.
  - **PixiJS v8** replaces the Canvas 2D renderer (WebGL, WebGPU where available).
    Use `pixi-filters` for glow/bloom, and `ParticleContainer` for particle effects.
    The renderer sits behind a small interface (`init`, `resize`, `render(state, drag)`,
    `playEffects(turnResult)`), so `src/game/` and input don't depend on Pixi.
  - **vite-plugin-pwa** (Workbox) for the manifest, service worker and offline
    support.
- **Don't add:** UI frameworks (React etc.), full game engines (Phaser). Menus and
  settings are plain DOM overlays on top of the canvas.
- **Audio:** Web Audio API directly. Synthesised sounds are fine to start with.
  Howler.js is acceptable if sprite handling gets painful.
- **Later, out of scope for now:** Capacitor app builds, an Adventure mode with levels.

---

## 2. Gameplay reference: what the original does

The exact formulas are not published. Below is what play shows. Everything here should
be a **tunable constant in a single config module**, not a magic number in the logic.

- 8×8 board. A hand of 3 pieces. A new hand is dealt only once all 3 are placed. Pieces
  can be placed in any order. **No rotation.**
- A full row or column clears. Rows and columns clear in the same step, and a cell
  in both counts once.
- Game over: no piece still in hand fits anywhere.
- Score = points per cell placed + line-clear points, which grow faster than linearly
  with lines cleared at once, × a combo multiplier.
- **Combo:** clearing moves build a streak. In the original the streak survives roughly
  one hand (about 3 placements) without a clear. It does not reset on the first move
  that doesn't clear.
- **Clearing the whole board** pays a large bonus and gets its own celebration.
- **Difficulty:** Classic mode has no levels. Difficulty comes from how full the board
  is plus the piece generator. The generator is weighted and seems to hand out
  "rescue" pieces when the board is nearly full. It never seems to deal a hand that
  is dead on arrival.

### How the fork currently differs (from code review)

| Area | Current fork | Target |
|---|---|---|
| Combo | Resets on any placement that doesn't clear | Grace window of 3 placements |
| Board-clear bonus | None | Bonus × combo multiplier, plus a celebration |
| Generator | Bag of all 33 shapes dealt without replacement. Every shape equally likely. No board check | Weighted, tied to difficulty, fairness-checked, mercy rule |
| Ghost preview | Green or red outline only | Also highlights lines that **would clear** |
| Edge snapping | Clamps into the board even when dropped far outside | Only snaps when within tolerance of the board |
| Unplaceable tray pieces | No indication | Greyed out |
| Feedback | Flash, particles, popup at board centre | Plus praise words, audio, haptics, screen shake, score count-up, popup at the clear, board-clear and game-over sequences |
| Screens | Starts immediately; game-over overlay only | Start screen, settings (mute, haptics, reduced motion) |
| Renderer | Canvas 2D | PixiJS (WebGL) |
| Platform | Static page | Installable, offline PWA that resumes games |
| Tests | None | Vitest for all of `src/game/` |

---

## 3. Specs

### 3.1 Scoring (`src/game/config.ts` + `scoring.ts`)

```ts
PLACE_POINTS_PER_CELL = 1
LINE_POINTS = [0, 10, 40, 90, 160, 250, 360, 490]  // index = lines cleared in one move; extend if needed
COMBO_GRACE = 3          // placements without a clear before the combo resets
COMBO_MULT = (combo) => 1 + 0.5 * Math.max(0, combo - 1)   // consider a lookup table + cap
ALL_CLEAR_BONUS = 300    // multiplied by COMBO_MULT(combo)
```

Turn resolution:

```
points = cells × PLACE_POINTS_PER_CELL
if lines > 0:
    combo += 1; movesSinceClear = 0
    points += round(LINE_POINTS[lines] × COMBO_MULT(combo))
    if board is empty after clearing: points += round(ALL_CLEAR_BONUS × COMBO_MULT(combo)); allClear = true
else:
    movesSinceClear += 1
    if movesSinceClear >= COMBO_GRACE: combo = 0
```

Add `allClear`, `movesSinceClear` and `praise` (see 3.4) to the turn result object.
The renderer drives all effects from that object and never recomputes rules itself.

### 3.2 Piece generator (`src/game/generator.ts`, replaces `PieceBag`)

- **Seeded RNG**: use mulberry32 or similar. Every random choice in `src/game/` goes
  through it, so games replay exactly from a seed.
- **Weights per shape family**, defined in config. Easy pieces (single, short lines,
  2×2, small corners) weigh more at low difficulty. Hard pieces (3×3, 5-long lines, big
  L's, S/Z) gain weight as difficulty rises.
- **Difficulty** is a value from 0 to 1 derived from score, using thresholds in config.
  Keep it a pure function so it can be tuned and tested.
- **Fairness, hard rule:** never deal a hand in which no piece fits. Redraw up to N
  times. As a last resort, swap in the smallest piece that fits.
- **Fairness, soft rule:** with probability `P_SOLVABLE(difficulty)` (1.0 at
  difficulty 0, tapering to about 0.7 in config), require that all three pieces can
  be placed in some order, simulating clears in between. Search the 6 orderings with
  a depth-first search that stops at the first success. Cap the search with a node
  budget and benchmark it: aim for under 5 ms per deal on a mid-range phone.
- **Mercy rule:** if the board is more than `MERCY_FILL` (≈0.6) full, or `MERCY_HANDS`
  (≈2) hands in a row had no clear, boost the weight of pieces that would complete at
  least one line on the current board.
- Avoid dealing three identical pieces in one hand.
- All thresholds live in config. Expose the generator's decisions (redraws, mercy
  triggered) in the turn result so a debug overlay can show them.

### 3.3 Input and preview (mobile-first)

- While dragging, place the piece on a **copy** of the board. If any rows or columns
  would fill, highlight those lines, ideally by tinting their existing cells in the
  dragged piece's colour. This is the most important piece of feedback in the game.
- Only show a ghost when the pointer is over the board or within about half a cell of
  it. Don't show a red ghost far from the board. Dropping outside that tolerance
  returns the piece to the tray.
- Lift: the piece scales from tray size to board size, and on touch it floats about
  1.5–2 cells above the finger (tune on a real phone) so the thumb never hides it.
- Tray hit areas are the whole slot, at least 44×44 CSS px, not just the piece's cells.
- Grey out tray pieces that cannot be placed anywhere.
- One active pointer at a time; ignore extra touches.

### 3.4 Feedback

All of this is driven by the turn result. Respect `prefers-reduced-motion`, and offer a
settings toggle that disables shake and reduces particles.

- **Praise words** for multi-line clears and combos, escalating in steps: e.g. 2 lines
  → "Good", 3 → "Great", 4 → "Excellent", 5+ → "Amazing", plus "Combo ×N". Thresholds
  go in config.
- **Popup** at the centre of the cleared cells, not the board centre.
- **Score count-up** animation in the HUD.
- **Screen shake** for clears of 2 or more lines, scaling with lines cleared.
- **Audio:** a soft click on placement, a clear sound whose pitch rises with the combo,
  a sting for clearing the board, a game-over sound. A mute toggle saved in
  `localStorage`. Unlock the audio context on the first pointer event, which iOS
  requires.
- **Haptics:** a short `navigator.vibrate` on placement and a stronger pattern on
  clears, with a settings toggle. Feature-detect: iOS Safari has no vibration API, so
  it must silently do nothing there.
- **Board clear:** a full-board celebration.
- **Game over:** blocks fade to grey one by one, then a score screen showing "New best!"
  when it applies.
- **Start screen** with Play/Continue, the best score and settings.
- WebGL-specific room for later "splendour": bloom on clears, glow on the line-clear
  preview, shader backgrounds. Build the effects system so these slot in without
  touching game logic.

### 3.5 Visual style: close to the original, easier on the eyes

Recreate the original's look in code, but **subdued**: lower saturation, less contrast,
softer gloss. Starting tokens (tune on a real phone, in a dim room as well as daylight):

| Token | Value | Notes |
|---|---|---|
| Page background | `#1E2A44` → `#18223A` vertical gradient | Original is a brighter royal/navy blue |
| Board panel | `#141C30` | Rounded corners, subtle inner shadow |
| Empty cell | `#212C47` | Visible but quiet |
| Block red | `#D46A63` | |
| Block orange | `#DB8F5A` | |
| Block yellow | `#D9BC62` | |
| Block green | `#72B77A` | |
| Block cyan | `#5DB3C4` | |
| Block blue | `#5F86D0` | |
| Block purple | `#9578C2` | |
| Text / HUD | `#E6EAF2`, secondary `#9AA6BF` | |
| Accent (combo, praise) | `#F2C46D` | |

- Blocks: chunky bevelled squares like the original (lighter top-left edge, darker
  bottom-right), but keep the bevel and gloss contrast low. No pure white highlights.
- Each dealt piece gets a colour from the palette, avoiding two pieces of the same
  colour in one hand. Placed cells keep their colour.
- The line-clear preview tint and effects may glow, but bloom stays gentle. Avoid
  full-screen white flashes.
- Keep every colour a token in one theme module, so a "vivid" theme can be added later.

### 3.6 Mobile-first layout and PWA

- **Portrait first.** Top: HUD (score, best, settings). Middle: board, as wide as the
  screen allows minus a 16px gutter. Bottom: the tray of 3 pieces in thumb reach. In
  landscape or on desktop, centre the same column; don't design a separate layout.
- Use `100dvh` and `env(safe-area-inset-*)` with `viewport-fit=cover`. Remove
  `user-scalable=no` / `maximum-scale=1` from the viewport meta tag, and stop gestures
  on the game area with `touch-action: none`, `overscroll-behavior: none`, no text
  selection and no long-press context menu.
- Render at `devicePixelRatio`, capped at 2 for performance. Target 60 fps on a
  mid-range phone. Pause the render loop when the tab is hidden.
- **Save the game in progress** (board, hand, score, combo, RNG state) to
  `localStorage` after every move, and restore it on launch. Mobile OSes kill
  backgrounded PWAs, so this is essential.
- **PWA:** manifest (name "Block Blowup", short name, `display: standalone`,
  `orientation: portrait`, theme and background colours from the theme, maskable
  icons at 192 and 512 plus an Apple touch icon). Precache all assets so it works
  fully offline. When an update is available, show a small "Update available" prompt
  instead of reloading mid-game. Add the iOS meta tags for standalone mode and the
  status bar style.
- Hosting: GitHub Pages works (HTTPS is required for the service worker). Make sure
  Vite's `base` matches the repo path.

### 3.7 Automated testing

Every layer below runs in CI (see "CI pipeline"). A phase is not done while any test
fails or is skipped. Bug fixes start with a failing test that reproduces the bug.

**1. Unit tests: Vitest in Node, for all of `src/game/`**
- Board, scoring, state, generator, solvability check, difficulty curve, mercy rule,
  line-clear preview, and serialising and restoring a saved game.
- **Property-based tests with `fast-check`** over random seeds and random board
  states:
  - A dealt hand is never dead.
  - No full line remains after a turn resolves.
  - The score never decreases.
  - Combo follows the grace rule.
  - Save → restore → continue gives exactly the same game as never saving.
- **Determinism:** the same seed and the same moves produce an identical game log.
- **Coverage:** ≥ 90% of lines and branches in `src/game/`, enforced in CI.

**2. Simulation regression: Vitest in Node**
- Run the simulation bot on a fixed set of 50 seeds, so it stays fast.
- Hard checks: 0 games end on a dead fresh hand, and all invariants hold.
- Soft checks: average moves, the score distribution and how often the mercy rule
  fires stay within tolerance bands of a committed snapshot
  (`tests/sim-snapshot.json`). When balance changes on purpose, update the snapshot
  with `npm run sim:update`, in the same commit as the balance change.
- Run `vitest bench` for the solver, failing if a deal exceeds its time budget.

**3. Module tests: Vitest with happy-dom, for code that doesn't use Pixi**
- **Layout geometry** for 360×640, 390×844, 412×915, 768×1024 and a landscape viewport:
  - the board fits;
  - tray slots are at least 44px;
  - nothing sits under the safe-area insets.
- **Input logic:** extract hit-testing, snapping and drop tolerance as pure functions
  and test them.
- **Settings and storage:** cover the case where `localStorage` is unavailable and the
  case where it holds corrupt or old-format data.
- **Audio manager:** test against a mocked `AudioContext`, including combo pitch and
  mute.
- **Haptics:** feature detection, so there's no crash where `navigator.vibrate` doesn't
  exist.

**4. End-to-end tests: Playwright**
- **Device projects:** Pixel 7 (Chromium), iPhone 14 (WebKit), desktop Chromium.
- **Test hook:** in dev and test builds only, `?seed=N&test=1` exposes a read-only
  `window.__blowup` with the game state, and freezes animations (effects finish
  instantly). Strip this from production builds, and add a test that checks it's gone.
- **Scenarios:**
  - start screen → play;
  - dragging a piece onto the board updates the board and score;
  - dropping outside the drop tolerance returns the piece to the tray;
  - a seeded scenario produces a line clear and a combo;
  - a seeded scenario reaches game over and shows the score screen with "New best!";
  - reloading mid-game resumes the same state;
  - mute and haptics settings persist;
  - `prefers-reduced-motion` (via `emulateMedia`) disables screen shake.
- Fail the test on any console error or uncaught exception.

**5. Visual regression: Playwright `toHaveScreenshot`**
- **Seeded and frozen states:** start screen, a mid-game board, the line-clear preview
  during a drag, the game-over screen, and the settings screen.
- **Run on Chromium on Linux only,** in a pinned Playwright Docker image, so the
  baselines stay stable. Small pixel tolerance. Update baselines on purpose, in the
  same commit as the visual change.

**6. PWA tests**
- **Playwright against `vite preview` of the production build:**
  - the manifest fields are correct;
  - the service worker registers;
  - after `context.setOffline(true)` and a reload, the game still loads and is
    playable;
  - the update prompt appears when a new service worker is waiting.
- **Lighthouse CI (`@lhci/cli`), mobile preset:**
  - installable;
  - performance ≥ 90;
  - accessibility ≥ 90.

**7. Performance: nightly, not blocking**
- **Playwright on Chromium with CPU throttled 4× (via the Chrome DevTools Protocol):**
  - script a 10-second drag with line clears;
  - sample frame times;
  - report p50 and p95 frame time.
- **Alert if the p95 frame time goes above 20 ms.** It doesn't block merges, because
  frame timing is flaky on CI machines.

**CI pipeline (GitHub Actions)**
- **On every push and PR**, in this order:
  - typecheck;
  - ESLint and Prettier check;
  - unit and module tests with coverage;
  - simulation regression;
  - build;
  - Playwright end-to-end, visual and PWA tests.
- **On `main` only:** Lighthouse CI, then deploy to GitHub Pages, but only when every
  previous job is green.
- **Nightly:** performance job.
- **On failure:** upload Playwright traces, screenshot diffs and the simulation report
  as artifacts.

---

## 4. Simulation harness and baseline

Build `scripts/simulate.ts`, run with `npm run sim`. It plays seeded games with a bot
and prints statistics. Use it after every rules or generator change.

**Bot (greedy, intentionally weak):** for every piece in hand and every legal
position, score = `linesCleared × 100 − filledCellsAfterPlacement + pieceCells × 2`,
then play the best. Seeds 1..300, using the LCG `seed = (seed × 1664525 + 1013904223) >>> 0; return seed / 2**32`.

**Baseline for the *unmodified* fork, measured with exactly this bot:**

| Metric | Value |
|---|---|
| Average moves per game | 34.4 |
| Median score / average score / best score | 265 / 300 / 955 |
| Average best combo | 2.50 |
| Games ending right after a fresh hand was dealt | 13 / 300 (≈4%) |

Targets after phases 2 and 3: games last noticeably longer at low difficulty,
**0 games end on a dead fresh hand**, and difficulty measurably rises with score.
Scores are not directly comparable once the scoring rules change, so compare moves
and death causes. Print: moves, score, best combo, how many deals were redrawn, how
often the mercy rule fired, and how fast the board-fill level climbs.

---

## 5. Phased plan

Commit at the end of each phase. Do not start a phase until the previous phase's
tests pass.

**Phase 0: Fork and tooling**
- Fork or clone the source repo into the new repo (ask the user where). Rename all
  user-visible strings to "Block Blowup", the page title, and the `localStorage` key
  (`block-blowup.highscore`).
- Convert to TypeScript (`strict: true`), Vite, Vitest. Scripts: `dev`, `build`,
  `preview`, `test`, `typecheck`, `sim`. Make the dev server reachable on the LAN
  (`--host`) so the game can be tried on a phone.
- Update the GitHub Pages workflow to build with Vite and publish `dist/`.
- Set up the full test toolchain from 3.7: Vitest with coverage, happy-dom,
  fast-check, Playwright with the three device projects, ESLint, Prettier.
- Set up the CI pipeline from 3.7, with jobs that have no tests yet passing trivially.
- Add one Playwright smoke test: the page loads, the canvas is present, there are no
  console errors, on every device project.

**Phase 1: Characterisation tests and simulation harness**
- Before changing any rules, write tests that pin the current behaviour of `board`,
  `scoring` and `state`: placement validity, shared cells in row-and-column clears,
  game-over detection, combo, the score table.
- Build the simulation harness and confirm it reproduces the baseline above. The bot,
  seeds and LCG must match exactly.
- Add the determinism test, then the simulation regression test with its first
  snapshot. Turn on the coverage threshold for `src/game/`.

**Phase 2: Rules**
- Config module. Combo grace window. Board-clear bonus. Extended line table. New
  fields on the turn result. Update the tests that pinned the old combo behaviour,
  on purpose and in a separate commit.
- Tests: unit and property tests for the combo grace rule, the board-clear bonus and
  the line table. Update the simulation snapshot and record the before/after numbers.

**Phase 3: Generator**
- Section 3.2 in full, with tests: a dealt hand is never dead (property test over many
  seeds and random board states); the solvability check is correct on hand-built
  cases; weights shift with difficulty; the mercy rule triggers. Benchmark the solver.
- Add the solver `vitest bench` budget to CI. Update the simulation snapshot.

**Phase 4: PixiJS renderer, mobile layout, theme**
- Define the renderer interface; port board, tray, drag piece and the existing effects
  to PixiJS. Delete the Canvas 2D renderer once the Pixi one matches it.
- Implement the mobile-first layout (3.6) and the subdued theme (3.5) as part of the port.
- Check on a real phone: 60 fps while dragging, crisp at high DPR, no gesture conflicts.
- Tests: layout geometry module tests for every listed viewport. Add the
  `?seed&test=1` hook and the check that it's stripped from production. End-to-end
  tests for dragging and placing a piece and for dropping outside the tolerance. First
  visual baselines: start screen and mid-game board. Set up the nightly performance job.

**Phase 5: Input and preview**
- Section 3.3. The line-preview logic belongs in `src/game/` (pure and tested); the
  drawing goes in the renderer.
- Tests: unit tests for the line preview, including row-and-column crossings. Module
  tests for hit-testing, snapping and tolerance. A visual baseline of the line-clear
  preview during a drag. An end-to-end test that greyed-out tray pieces can't be
  dragged.

**Phase 6: Feedback, audio, haptics**
- Section 3.4, except the start screen.
- Tests: unit tests for the praise thresholds. Module tests for the audio manager
  (mocked context, pitch per combo, mute) and haptics feature detection. End-to-end
  tests for a seeded line clear and combo, and for reduced motion disabling shake.

**Phase 7: PWA and screens**
- Manifest, icons, service worker, offline, update prompt, saving and resuming the
  game in progress (3.6). Start screen, settings (mute, haptics, reduced motion),
  game-over sequence. Optional: a debug overlay behind `?debug` showing the seed,
  difficulty and generator decisions.
- Check: installs on Android Chrome and iOS Safari ("Add to Home Screen"), works in
  airplane mode, resumes a game after the app is killed. Lighthouse PWA audit passes.
- Tests: the PWA tests from 3.7 (manifest, service worker, offline reload, update
  prompt), with Lighthouse CI turned on for `main`. End-to-end tests for resuming
  after a reload, game over with "New best!", and settings persisting. Visual
  baselines for the game-over and settings screens. Module tests for storage with
  `localStorage` unavailable or holding corrupt data.

---

## 6. Working rules

- `src/game/` stays pure: no DOM, no Pixi, no `Math.random`, no timers. Everything
  random goes through the seeded RNG.
- Every behaviour change ships with its tests in the same commit. Never disable,
  skip or loosen a test to get CI green; fix the code, or change the test on purpose
  and say why in the commit message.
- Every tunable gameplay number goes in `src/game/config.ts`; every colour in the
  theme module.
- Keep `docs/game-design.md` describing how the game **actually** behaves. Update it
  in the same commit as the behaviour change. Keep `docs/plan.md` progress current.
  Rewrite the existing `AGENTS.md` for the new stack, or replace it with `CLAUDE.md`.
- Report simulation statistics in the commit message for any phase that changes rules
  or the generator.
- When balance or style decisions are a matter of taste (weights, thresholds, praise
  words, colour tweaks), pick sensible defaults, note them in `docs/game-design.md`,
  and list them for the user at the end of the phase rather than stopping to ask.