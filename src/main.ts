// src/main.ts
// Bootstrap: wire up the canvas, game loop, input, HUD, effects, and overlays.

import { Mulberry32 } from './game/rng';
import { Game, GameStatus, type TurnResult } from './game/state';
import { computeLayout, type Layout } from './render/layout';
import {
  drawBoard,
  drawHand,
  drawDraggingPiece,
  drawEffects,
  type Effect,
  type Particle,
} from './render/renderer';
import { createInput } from './input';
import { loadHighScore, saveHighScore } from './storage';

// --- DOM ---------------------------------------------------------------------
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

const canvas = el<HTMLCanvasElement>('game');
const ctx = canvas.getContext('2d')!;
const scoreEl = el('score');
const bestEl = el('best');
const comboWrap = el('combo-wrap');
const comboEl = el('combo');
const overlay = el('overlay');
const overlayTitle = el('overlay-title');
const overlayMsg = el('overlay-msg');
const restartBtn = el<HTMLButtonElement>('restart');

// --- State -------------------------------------------------------------------
let cssW = 1;
let cssH = 1;
let layout: Layout | null = null;
let highScore = loadHighScore();
const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
const game = new Game({ rng: new Mulberry32(seed).next });
const effects: Effect[] = [];

const input = createInput({
  canvas,
  getLayout: () => layout,
  getGame: () => game,
  onPlace: handlePlace,
});

// --- Sizing ------------------------------------------------------------------
function resize(): void {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const dpr = window.devicePixelRatio || 1;
  cssW = rect.width;
  cssH = rect.height;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
  layout = computeLayout(cssW, cssH);
}

// --- Gameplay callbacks ------------------------------------------------------
function handlePlace(result: TurnResult): void {
  spawnEffects(result);
  if (game.score > highScore) {
    highScore = game.score;
    saveHighScore(highScore);
  }
  updateHud();
  if (game.status === GameStatus.GAME_OVER) {
    window.setTimeout(showGameOver, 450);
  }
}

function updateHud(): void {
  scoreEl.textContent = String(game.score);
  bestEl.textContent = String(Math.max(highScore, game.score));
  if (game.combo > 1) {
    comboWrap.hidden = false;
    comboEl.textContent = `Combo x${game.combo}`;
  } else {
    comboWrap.hidden = true;
  }
}

function showGameOver(): void {
  overlayTitle.textContent = 'Game Over';
  overlayMsg.textContent = `Score ${game.score}  ·  Best ${Math.max(highScore, game.score)}`;
  overlay.classList.remove('hidden');
}

restartBtn.addEventListener('click', () => {
  game.reset();
  effects.length = 0;
  updateHud();
  overlay.classList.add('hidden');
});

// --- Effects -----------------------------------------------------------------
function spawnEffects(result: TurnResult): void {
  if (!layout || result.clearedCells.length === 0) return;
  const b = layout.board;
  const cell = b.cell;

  effects.push({ type: 'flash', t: 0, dur: 0.28, cells: result.clearedCells });

  const parts: Particle[] = [];
  for (const c of result.clearedCells) {
    const px = b.x + (c.x + 0.5) * cell;
    const py = b.y + (c.y + 0.5) * cell;
    for (let i = 0; i < 3; i++) {
      parts.push({
        x: px,
        y: py,
        vx: (Math.random() - 0.5) * 260,
        vy: -Math.random() * 240 - 40,
        size: cell * (0.12 + Math.random() * 0.14),
        color: c.color,
      });
    }
  }
  effects.push({ type: 'burst', t: 0, dur: 0.9, parts });

  effects.push({
    type: 'popup',
    t: 0,
    dur: 0.9,
    x: b.x + b.size / 2,
    y: b.y + b.size / 2,
    text: `+${result.points}`,
    sub: result.combo > 1 ? `Combo x${result.combo}` : '',
  });
}

function updateEffects(dt: number): void {
  for (const e of effects) {
    e.t += dt;
    if (e.type === 'burst') {
      for (const p of e.parts) {
        p.vy += 900 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]!;
    if (e.t >= e.dur) effects.splice(i, 1);
  }
}

// --- Render + loop -----------------------------------------------------------
function render(): void {
  ctx.clearRect(0, 0, cssW, cssH);
  if (!layout) return;
  const d = input.drag;
  const ghost = d ? { shape: d.shape, ox: d.col, oy: d.row, valid: d.valid } : null;
  drawBoard(ctx, game.board, layout, ghost);
  drawEffects(ctx, effects, layout);
  drawHand(ctx, game, layout, d);
  if (d) drawDraggingPiece(ctx, d, layout);
}

let lastTime = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  updateEffects(dt);
  render();
  requestAnimationFrame(frame);
}

// --- Init --------------------------------------------------------------------
resize();
updateHud();
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => window.setTimeout(resize, 100));
requestAnimationFrame(frame);
