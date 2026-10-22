import type { Page } from '@playwright/test';
import type { BlowupSnapshot } from '../../src/test-hook';
import type { Layout } from '../../src/render/layout';

/** Open the game in test mode with a fixed seed and wait for the test hook. */
export async function openGame(page: Page, seed = 1): Promise<void> {
  await page.goto(`./?seed=${seed}&test=1`);
  await page.waitForFunction(() => !!window.__blowup?.layout());
}

export function snapshot(page: Page): Promise<BlowupSnapshot> {
  return page.evaluate(() => window.__blowup!.snapshot());
}

export async function layout(page: Page): Promise<Layout> {
  return (await page.evaluate(() => window.__blowup!.layout()))!;
}

/** Drag the piece in tray slot `slot` so that its top-left lands on board (col, row). */
export async function dragToCell(page: Page, slot: number, col: number, row: number) {
  const l = await layout(page);
  const piece = (await snapshot(page)).hand[slot]!;
  const s = l.hand.slots[slot]!;
  const b = l.board;
  await dragFromSlot(page, slot, {
    x: b.x + (col + piece.w / 2) * b.cell,
    y: b.y + (row + piece.h / 2) * b.cell,
  });
  return { slot: s, board: b };
}

/** Drag from the centre of a tray slot to a point (CSS px), in small steps. */
export async function dragFromSlot(page: Page, slot: number, to: { x: number; y: number }) {
  const s = (await layout(page)).hand.slots[slot]!;
  await page.mouse.move(s.cx, s.cy);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/** The first board position (row-major) where hand piece `slot` fits. */
export function firstFit(snap: BlowupSnapshot, slot: number): { col: number; row: number } {
  const piece = snap.hand[slot]!;
  for (let row = 0; row + piece.h <= 8; row++) {
    for (let col = 0; col + piece.w <= 8; col++) {
      if (piece.cells.every(([x, y]) => snap.board[row + y]![col + x] === '.')) return { col, row };
    }
  }
  throw new Error('piece fits nowhere');
}
