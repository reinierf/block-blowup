// src/test-hook.ts
// `?seed=N&test=1` in dev and test builds: a read-only `window.__blowup` for Playwright.
// main.ts only calls this behind `import.meta.env.DEV || MODE === 'test'`, so production
// builds drop it (scripts/check-prod-build.ts verifies that).

import type { DealInfo } from './game/generator';
import type { Game } from './game/state';
import type { Layout } from './render/layout';

export interface BlowupSnapshot {
  seed: number;
  score: number;
  combo: number;
  status: string;
  /** Rows of the board: '.' for empty, otherwise the first letter of the colour. */
  board: string[];
  /** Hand pieces (null = already placed). */
  hand: ({ name: string; color: string; cells: [number, number][]; w: number; h: number } | null)[];
  lastDeal: DealInfo | null;
}

export interface BlowupTestHook {
  readonly snapshot: () => BlowupSnapshot;
  /** Current layout (board and tray geometry in CSS px). */
  readonly layout: () => Layout | null;
  /** Main-thread ms per drawn frame since the last call (the buffer is emptied). */
  readonly takeFrameCosts: () => number[];
}

declare global {
  interface Window {
    __blowup?: BlowupTestHook;
  }
}

export function installTestHook(deps: {
  game: Game;
  seed: number;
  getLayout: () => Layout | null;
  frameCosts: number[];
}): void {
  const { game, seed, getLayout, frameCosts } = deps;
  const hook: BlowupTestHook = {
    snapshot: () =>
      structuredClone({
        seed,
        score: game.score,
        combo: game.combo,
        status: game.status,
        board: game.board.grid.map((row) => row.map((c) => (c ? c[0] : '.')).join('')),
        hand: game.hand.map((p) =>
          p
            ? {
                name: p.shape.name,
                color: p.color,
                cells: p.shape.cells.map(([x, y]): [number, number] => [x, y]),
                w: p.shape.width,
                h: p.shape.height,
              }
            : null,
        ),
        lastDeal: game.lastDeal,
      }),
    layout: () => structuredClone(getLayout()),
    takeFrameCosts: () => frameCosts.splice(0),
  };
  Object.defineProperty(window, '__blowup', { value: Object.freeze(hook), writable: false });
}
