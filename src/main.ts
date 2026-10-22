// src/main.ts
// Bootstrap: theme, game, renderer, input, HUD, overlays, and the frame loop.

import { Mulberry32 } from './game/rng';
import { Game, GameStatus, type TurnResult } from './game/state';
import { createInput } from './input';
import { computeLayout, type Insets, type Layout } from './render/layout';
import { createPixiRenderer } from './render/pixi-renderer';
import { cssVariables, theme } from './render/theme';
import { loadHighScore, saveHighScore } from './storage';
import { installTestHook } from './test-hook';

// --- DOM ---------------------------------------------------------------------
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

const stage = el('stage');
const hud = el('hud');
const scoreEl = el('score');
const bestEl = el('best');
const comboWrap = el('combo-wrap');
const comboEl = el('combo');
const overlay = el('overlay');
const overlayTitle = el('overlay-title');
const overlayMsg = el('overlay-msg');
const restartBtn = el<HTMLButtonElement>('restart');
const safeProbe = el('safe-probe');

// --- Theme -------------------------------------------------------------------
for (const [name, value] of Object.entries(cssVariables())) {
  document.documentElement.style.setProperty(name, value);
}
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bgTop);

// --- Options (seed and test mode exist only in dev/test builds) ----------------
const params = new URLSearchParams(location.search);
const devOrTest = import.meta.env.DEV || import.meta.env.MODE === 'test';
const testMode = devOrTest && params.get('test') === '1';
// Test mode freezes animations (effects finish instantly) unless `animate=1` (perf runs).
const freezeAnimations = testMode && params.get('animate') !== '1';
const seedParam = devOrTest ? params.get('seed') : null;
const seed =
  seedParam !== null && /^\d+$/.test(seedParam)
    ? Number(seedParam) >>> 0
    : crypto.getRandomValues(new Uint32Array(1))[0]!;

// --- State -------------------------------------------------------------------
let layout: Layout | null = null;
let highScore = loadHighScore();
const game = new Game({ rng: new Mulberry32(seed).next });

const renderer = await createPixiRenderer(stage, {
  freezeAnimations,
  maxResolution: 2,
});

const input = createInput({
  surface: renderer.canvas,
  getLayout: () => layout,
  getGame: () => game,
  onPlace: handlePlace,
});

// --- Sizing ------------------------------------------------------------------
function readInsets(): Insets {
  const cs = getComputedStyle(safeProbe);
  const px = (v: string) => parseFloat(v) || 0;
  return {
    top: px(cs.paddingTop),
    right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft),
  };
}

function resize(): void {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (w < 1 || h < 1) return;
  layout = computeLayout(w, h, readInsets());
  Object.assign(hud.style, {
    left: `${layout.hud.x}px`,
    top: `${layout.hud.y}px`,
    width: `${layout.hud.w}px`,
    height: `${layout.hud.h}px`,
  });
  renderer.resize(layout);
}

// --- Gameplay callbacks ------------------------------------------------------
function handlePlace(result: TurnResult): void {
  renderer.playEffects(result);
  if (game.score > highScore) {
    highScore = game.score;
    saveHighScore(highScore);
  }
  updateHud();
  if (game.status === GameStatus.GAME_OVER) {
    window.setTimeout(showGameOver, testMode ? 0 : 450);
  }
}

function updateHud(): void {
  scoreEl.textContent = String(game.score);
  bestEl.textContent = String(Math.max(highScore, game.score));
  comboWrap.hidden = game.combo < 2;
  comboEl.textContent = `Combo ×${game.combo}`;
}

function showGameOver(): void {
  overlayTitle.textContent = 'Game Over';
  overlayMsg.textContent = `Score ${game.score}  ·  Best ${Math.max(highScore, game.score)}`;
  overlay.hidden = false;
}

restartBtn.addEventListener('click', () => {
  game.reset();
  renderer.clearEffects();
  updateHud();
  overlay.hidden = true;
});

// --- Frame loop (paused while the tab is hidden) -----------------------------
let lastTime = performance.now();
let rafId = 0;

/** Test mode: main-thread milliseconds spent on each drawn frame (read by the perf job). */
const frameCosts: number[] = [];

function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const t0 = performance.now();
  const drew = renderer.frame(game, input.drag, dt);
  if (testMode && drew) frameCosts.push(performance.now() - t0);
  rafId = requestAnimationFrame(frame);
}

function start(): void {
  lastTime = performance.now();
  rafId = requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelAnimationFrame(rafId);
  else start();
});

// --- Init --------------------------------------------------------------------
resize();
updateHud();
new ResizeObserver(resize).observe(stage);
start();

if (testMode) installTestHook({ game, seed, getLayout: () => layout, frameCosts });
