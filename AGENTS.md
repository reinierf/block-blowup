# AGENTS.md

Orientation for AI coding agents (and humans) working in this repository. Read this first,
then `HANDOVER.md` for the full research, specs and phased plan.

## What this is

**Block Blowup**: a mobile-first PWA block puzzle game closely modelled on Block Blast!
For **personal use only**. Forked from the MIT-licensed
[SSWheatley/block_blast](https://github.com/SSWheatley/block_blast) (not tracked upstream).

- **Stack:** TypeScript (strict) + Vite + Vitest + Playwright. PixiJS (WebGL) renderer
  from Phase 4; `vite-plugin-pwa` from Phase 7. No UI frameworks, no game engines.
- **Repo:** <https://github.com/reinierf/block-blast> (the name `block-blowup` is used for
  the package name and storage-key prefix only).
- **Deploys** to GitHub Pages from `main`, only when every CI job is green. Vite's `base`
  is `/block-blast/` for builds.

## Commands

```bash
npm install
npm run dev          # Vite dev server, reachable on the LAN (try it on a phone)
npm run build        # typecheck + production build into dist/
npm run preview      # serve dist/
npm test             # all Vitest projects (unit, module, sim)
npm run coverage     # Vitest with coverage for src/game/
npm run typecheck
npm run lint         # ESLint + Prettier check (npm run format to fix)
npm run e2e          # Playwright: Pixel 7, iPhone 14 (WebKit), desktop Chromium
npm run e2e:visual   # visual baselines, in the pinned Linux Playwright image (needs Docker)
npm run e2e:visual:update  # re-render baselines on purpose (commit them with the change)
npm run check:prod   # after a build: the test hook must not be in dist/
npm run lighthouse   # Lighthouse CI on `vite preview` (build first; needs Chrome, or
                     # CHROME_PATH=<Playwright's chromium>)
npm run icons        # regenerate public/icons from scripts/make-icons.ts
npm run sim          # simulation stats for seeds 1..300 (-- --from A --to B)
npm run sim:update   # rewrite tests/sim-snapshot.json after an intended balance change
```

First Playwright run on a new machine: `npx playwright install chromium webkit`.

## Tests

| Layer                     | Where                       | Runner            |
| ------------------------- | --------------------------- | ----------------- |
| Unit (pure game logic)    | `tests/unit/**/*.test.ts`   | Vitest, Node      |
| Module (DOM-ish, no Pixi) | `tests/module/**/*.test.ts` | Vitest, happy-dom |
| Simulation regression     | `tests/sim/**/*.test.ts`    | Vitest, Node      |
| End-to-end / visual / PWA | `tests/e2e/**/*.spec.ts`    | Playwright        |

E2E tests import `test`/`expect` from `tests/e2e/fixtures.ts`, which fails any test that
logs a console error or throws. They drive the game through `?seed=N&test=1`, which
exposes a read-only `window.__blowup` (snapshot, layout, frame costs) and freezes effects;
helpers are in `tests/e2e/helpers.ts`. Playwright runs with one worker: every browser
renders WebGL in software, and parallel browsers starve each other.

Visual baselines (`tests/visual/__screenshots__`) are rendered only on Linux in the pinned
image (`VISUAL=1`); the weekly frame-cost job is `tests/perf` (`PERF=1`). The `pwa`
project (`tests/pwa`, Chromium only) runs against `vite preview` of a `--mode test` build
in `dist-test/`, which Playwright builds itself.

The start screen is plain HTML; the PixiJS renderer is a dynamic import created on the
first Play/Continue. E2E helpers (`openGame`, `continueGame`) wait for that.

## Conventions — please follow

1. **`src/game/` stays pure.** No DOM, no Pixi, no `Math.random`, no timers. All randomness
   goes through the RNG passed in by the caller. ESLint enforces the main cases.
2. **Every behaviour change ships with tests** in the same commit. Never skip or loosen a
   test to get CI green. Bug fixes start with a failing test.
3. **Tunable gameplay numbers** go in `src/game/config.ts` (Phase 2+); **colours** in the
   theme module (Phase 4+).
4. **Keep docs in sync.** `docs/game-design.md` describes what the code _actually_ does;
   `docs/plan.md` tracks phase progress.
5. **Style:** Prettier (2 spaces, single quotes, width 100), ES modules, JSDoc/TSDoc where it
   clarifies. Line endings are LF (`.gitattributes`).

## Layout

| Path                          | Responsibility                                      |
| ----------------------------- | --------------------------------------------------- |
| `index.html`, `style.css`     | Page shell, theme, HUD, game-over overlay           |
| `src/main.ts`                 | Bootstrap, game loop, wiring, HUD/overlay, effects  |
| `src/input.ts`                | Pointer-based drag & drop (mouse + touch, one path) |
| `src/storage.ts`              | High-score persistence (`localStorage`)             |
| `src/game/pieces.ts`          | Shape set (with families), palette                  |
| `src/game/config.ts`          | Every tunable gameplay number                       |
| `src/game/rng.ts`             | Seeded RNG (mulberry32)                             |
| `src/game/generator.ts`       | Hand dealing: weights, fairness, mercy rule         |
| `src/game/solver.ts`          | Whole-hand solvability search                       |
| `src/game/bitboard.ts`        | Packed boards for fast search                       |
| `src/game/difficulty.ts`      | Difficulty curve                                    |
| `src/game/board.ts`           | 8×8 grid, placement validation, line clearing       |
| `src/game/scoring.ts`         | Scoring formulas                                    |
| `src/game/state.ts`           | Game state machine, hand management                 |
| `src/sim/`                    | Seeded LCG, greedy bot, simulation runner, snapshot |
| `src/render/layout.ts`        | Viewport geometry (shared by renderer + input)      |
| `src/render/renderer.ts`      | Renderer interface                                  |
| `src/render/pixi-renderer.ts` | PixiJS renderer                                     |
| `src/render/theme.ts`         | Every colour (tokens)                               |
| `src/input-logic.ts`          | Pure drag geometry (snapping, drop tolerance)       |
| `src/test-hook.ts`            | `?seed&test=1` hook (dev/test builds only)          |
| `src/feedback/plan.ts`        | Turn result → feedback plan (pure)                  |
| `src/game/save.ts`            | Save / validate / restore a game in progress        |
| `src/pwa.ts`                  | Service worker registration, update prompt          |
| `src/audio.ts`                | Synthesised Web Audio sound effects                 |
| `src/haptics.ts`              | Feature-detected vibration                          |
| `src/settings.ts`             | Mute / haptics / reduced-motion settings            |
| `tests/`                      | Vitest + Playwright suites (see above)              |
| `.github/workflows/ci.yml`    | CI pipeline + Pages deploy                          |
| `.github/workflows/perf.yml`  | Weekly performance job (also runnable by hand)      |
| `docs/plan.md`                | Roadmap and phase progress                          |
| `docs/game-design.md`         | How the game works (rules, scoring, systems)        |
| `HANDOVER.md`                 | Research, specs and the phased plan                 |

## Environment notes (this machine)

- Windows 11; Node 22. `origin` → `git@github.com:reinierf/block-blast.git`, branch `main`.
- `gh` is authenticated as `reinierf`.
- AVG Antivirus intercepts TLS; Node trusts it via `NODE_EXTRA_CA_CERTS`, and
  `scripts/docker-playwright.mjs` passes that certificate into the container.
- Docker Desktop must be running for `npm run e2e:visual`.
