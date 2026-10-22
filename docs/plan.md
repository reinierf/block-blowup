# Block Blowup — Plan & Progress

The specs and the full phased plan live in [`HANDOVER.md`](../HANDOVER.md) (sections 3–5).
This file tracks progress against those phases and records decisions made along the way.

## Progress

- [x] **Phase 0 — Fork and tooling** (2026-10-22)
- [x] **Phase 1 — Characterisation tests and simulation harness** (2026-10-22)
- [ ] Phase 2 — Rules (config module, combo grace, board-clear bonus)
- [ ] Phase 3 — Generator (weighted, fair, mercy rule)
- [ ] Phase 4 — PixiJS renderer, mobile layout, theme
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

## Known issues (inherited from the fork)

- The "Combo x1" HUD badge is always visible: `.hud-item { display: flex }` overrides the
  `hidden` attribute on `#combo-wrap`. Fix with a failing e2e test first (Phase 6 HUD work,
  or earlier).
- The viewport meta still has `maximum-scale=1, user-scalable=no` (removed in Phase 4).
