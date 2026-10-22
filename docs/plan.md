# Block Blowup — Plan & Progress

The specs and the full phased plan live in [`HANDOVER.md`](../HANDOVER.md) (sections 3–5).
This file tracks progress against those phases and records decisions made along the way.

## Progress

- [x] **Phase 0 — Fork and tooling** (2026-10-22)
- [ ] Phase 1 — Characterisation tests and simulation harness
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

## Known issues (inherited from the fork)

- The "Combo x1" HUD badge is always visible: `.hud-item { display: flex }` overrides the
  `hidden` attribute on `#combo-wrap`. Fix with a failing e2e test first (Phase 6 HUD work,
  or earlier).
- The viewport meta still has `maximum-scale=1, user-scalable=no` (removed in Phase 4).
