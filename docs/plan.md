# Block Blowup — Plan & Progress

The specs and the full phased plan live in [`HANDOVER.md`](../HANDOVER.md) (sections 3–5).
This file tracks progress against those phases and records decisions made along the way.

## Progress

- [x] **Phase 0 — Fork and tooling** (2026-10-22)
- [x] **Phase 1 — Characterisation tests and simulation harness** (2026-10-22)
- [x] **Phase 2 — Rules (config module, combo grace, board-clear bonus)** (2026-10-22)
- [x] **Phase 3 — Generator (weighted, fair, mercy rule)** (2026-10-22)
- [x] **Phase 4 — PixiJS renderer, mobile layout, theme** (2026-10-22; real-phone check pending)
- [ ] Phase 5 — Input and preview
- [ ] Phase 6 — Feedback, audio, haptics
- [ ] Phase 7 — PWA and screens

## Phase 0 notes

- Repo stays at `reinierf/block-blast` (GitHub fork of SSWheatley/block_blast). The name
  `block-blowup` is used for the package name and storage-key prefix.
- Sources converted one-for-one to strict TypeScript. No behaviour changes, except that
  `Game` now requires an `rng` (the caller passes it; `main.ts` uses `Math.random` until
  the seeded generator lands in Phase 3), and the high-score key is now
  `block-blowup.highscore` (old `blockblast.highscore` scores are not migrated).
- Vitest is split into three projects: `unit` (Node), `module` (happy-dom), `sim` (Node).
  Coverage is collected for `src/game/`; the 90% threshold is switched on in Phase 1.
- Playwright projects: Pixel 7 (Chromium), iPhone 14 (WebKit), desktop Chromium. CI runs
  them in the pinned `mcr.microsoft.com/playwright:v1.64.1-noble` image; bump the tag
  together with `@playwright/test`.
- CI (`.github/workflows/ci.yml`): typecheck → ESLint + Prettier → unit/module tests with
  coverage → simulation regression → build → Playwright. On `main`: Lighthouse
  (placeholder until Phase 7) → deploy `dist/` to Pages. Nightly perf job is a placeholder
  until Phase 4.
- GitHub Pages must be enabled on the repo with source "GitHub Actions" before the deploy
  job can succeed.

## Phase 1 notes

- Simulation harness: `src/sim/` (LCG, greedy bot, game runner, snapshot logic), run via
  `npm run sim` (seeds 1..300 by default; `-- --from A --to B`). It reproduces the
  HANDOVER baseline exactly for the unmodified rules: 34.4 moves, score median/avg/best
  265 / 300 / 955 (the exact median of 300 games is 264.5), average best combo 2.50,
  13 / 300 games dead on a fresh hand. The bot breaks ties by first found: hand slot, then
  row, then column.
- Regression: `tests/sim/regression.test.ts` runs seeds 1..50 against
  `tests/sim-snapshot.json` with the tolerance bands in `src/sim/snapshot.ts`. Update with
  `npm run sim:update` in the same commit as an intended balance change.
- Characterisation tests pin the fork's rules: placement, row-and-column crossings, the
  line table (4+ lines capped at 160), combo resets on the first non-clearing move, refill,
  game over (including a dead-on-arrival fresh hand). Phase 2 changes the combo tests on
  purpose, in a separate commit.
- Property tests (fast-check, random seeds × random legal moves): no full line after a turn,
  score grows by exactly the turn's points, combo rule, game over ⇔ no legal move.
- Coverage threshold: 90% lines and branches for `src/game/` (currently 100% / 97.7%).
- Deferred on purpose: the hard check "0 games end on a dead fresh hand" can only pass once
  the Phase 3 generator exists (the snapshot has 2 / 50 today). The save → restore property
  waits for serialisation (Phase 7).

## Phase 2 notes

- `src/game/config.ts` holds every gameplay number. Three commits: config refactor (no
  behaviour change); combo grace window (old combo tests changed on purpose); board-clear
  bonus, line table to 7 lines, ×5 combo-multiplier cap, `allClear` / `praise` /
  `movesSinceClear` on the turn result.
- Simulation, seeds 1..300 (the bot ignores score, so moves and deaths don't change):

  | Metric                    | Fork baseline   | After Phase 2    |
  | ------------------------- | --------------- | ---------------- |
  | Average moves             | 34.4            | 34.4             |
  | Score median / avg / best | 265 / 300 / 955 | 375 / 444 / 1935 |
  | Average best combo        | 2.50            | 6.64             |
  | Board clears per game     | (not scored)    | 0.010            |
  | Died on a fresh hand      | 13 / 300        | 13 / 300         |

- Taste defaults to review: `COMBO_GRACE = 3`, `COMBO_MULT_CAP = 5`,
  `ALL_CLEAR_BONUS = 300`, line table `[0, 10, 40, 90, 160, 250, 360, 490]`, praise words
  Good / Great / Excellent / Amazing at 2 / 3 / 4 / 5+ lines.

## Phase 3 notes

- `PieceBag` is gone; `Generator` deals every hand (see `docs/game-design.md` §3). The app
  now seeds `Mulberry32` from `crypto.getRandomValues`; the simulation keeps the HANDOVER
  LCG.
- Simulation, seeds 1..300:

  | Metric                                    | After Phase 2    | After Phase 3             |
  | ----------------------------------------- | ---------------- | ------------------------- |
  | Average moves                             | 34.4             | 97.4                      |
  | Score median / avg / best                 | 375 / 444 / 1935 | 1074 / 1217 / 3335        |
  | Average best combo                        | 6.64             | 9.44                      |
  | Died on a fresh hand                      | 13 / 300         | **0 / 300**               |
  | Difficulty at move 10 / 40 / 100 / 200    | —                | 0.02 / 0.15 / 0.38 / 0.62 |
  | Redraws per deal / mercy rate / fallbacks | —                | 0.057 / 4.1% / 0%         |

- Performance: first version of the solver used row arrays and cost ~4 µs per node (max
  6.6 ms per deal on a desktop). Packed 8×8 bitboards with precomputed placements brought
  that to p99 0.02 ms, max < 0.1 ms. `DEAL_NODE_BUDGET` bounds the theoretical worst case.
  `tests/sim/deal-budget.test.ts` is the CI time budget (p99 < 1 ms, max < 4 ms in Node).
- Vitest 5 replaced `vitest bench` with an experimental test-context `bench` API that
  printed nothing useful here, so the budget is a plain timing test and `npm run sim`
  prints deal latency instead.
- Taste defaults to review: difficulty curve (0 → 0, 500 → 0.2, 1500 → 0.45, 3000 → 0.7,
  6000 → 1), family weights, `P_SOLVABLE_HARD` 0.7, `MAX_REDRAWS` 20, mercy at 60% fill
  or 2 dry hands with ×4 boost.
- Possible follow-up: games now last ~3× longer under the bot; whether that's too easy for
  a human is a feel question for playtesting once the new renderer is in.

## Phase 4 notes

- PixiJS 8.22 renderer behind `Renderer` (created by `createPixiRenderer`, then `resize`,
  `frame`, `playEffects`, `clearEffects`); the Canvas 2D renderer is deleted. Mobile-first
  layout and the subdued theme as specified; see `docs/game-design.md` sections 7 and 8.
- Hand colours are now dealt by the generator (three distinct colours per hand), which
  consumes RNG values: every seed deals a different sequence, so the sim snapshot and the
  seed-1 pin were regenerated. Aggregates barely moved (seeds 1..300: 97.4 to 92.9 moves,
  0 dead fresh hands, same difficulty curve): reseeding noise, not a balance change.
- Drop tolerance (half a cell) is in already, because the Phase 4 e2e test needs it.
  Phase 5 builds on `src/input-logic.ts`.
- Fixed the inherited "Combo x1 always visible" bug (`[hidden]` was overridden by
  `display: flex`); the e2e test was confirmed failing without the fix.
- Tests: layout geometry for 360×640, 390×844, 412×915, 768×1024, 844×390 landscape and
  desktop; input logic; e2e drag-and-place, drop outside tolerance, drop on occupied
  cells, hook read-only, viewport meta; `npm run check:prod` proves the hook is absent from
  production builds (and flags a `--mode test` build). Visual baselines: new game and
  mid-game board (there is no start screen until Phase 7).
- Nightly perf job: CI has no GPU, so headless Chromium rasterises WebGL in software at
  about 50 ms per frame even when idle, which says nothing about a phone. The job instead
  measures main-thread cost per drawn frame under 4× CPU throttle (local: p50 1.0 ms,
  p95 3.4 ms) and fails above 20 ms p95.
- **Still to do by hand:** check on a real phone: 60 fps while dragging, crisp at high
  DPR, no gesture conflicts (pull-to-refresh, zoom, long-press). `npm run dev` serves on
  the LAN.

## Known issues

- None open.
