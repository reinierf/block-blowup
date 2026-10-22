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

/** Play `moves` moves: first non-empty slot, first fitting position (row-major). */
export async function playFirstFit(page: Page, moves: number): Promise<void> {
  for (let i = 0; i < moves; i++) {
    const snap = await snapshot(page);
    const slot = snap.hand.findIndex((p) => p !== null);
    const { col, row } = firstFit(snap, slot);
    await dragToCell(page, slot, col, row);
  }
}

/** The legal move that completes the most lines (ties: first found). */
export function clearingMove(snap: BlowupSnapshot): {
  slot: number;
  col: number;
  row: number;
  lines: number;
} {
  let best = { slot: -1, col: 0, row: 0, lines: -1 };
  snap.hand.forEach((p, slot) => {
    if (!p) return;
    for (let row = 0; row + p.h <= 8; row++) {
      for (let col = 0; col + p.w <= 8; col++) {
        if (!p.cells.every(([x, y]) => snap.board[row + y]![col + x] === '.')) continue;
        const filled = snap.board.map((r) => [...r].map((c) => c !== '.'));
        for (const [x, y] of p.cells) filled[row + y]![col + x] = true;
        let lines = filled.filter((r) => r.every(Boolean)).length;
        for (let x = 0; x < 8; x++) if (filled.every((r) => r[x])) lines++;
        if (lines > best.lines) best = { slot, col, row, lines };
      }
    }
  });
  return best;
}

/** Press on a tray slot and move to board cell (col, row) without releasing. */
export async function holdOverCell(page: Page, slot: number, col: number, row: number) {
  const l = await layout(page);
  const piece = (await snapshot(page)).hand[slot]!;
  const s = l.hand.slots[slot]!;
  const b = l.board;
  await page.mouse.move(s.cx, s.cy);
  await page.mouse.down();
  await page.mouse.move(b.x + (col + piece.w / 2) * b.cell, b.y + (row + piece.h / 2) * b.cell, {
    steps: 8,
  });
}
