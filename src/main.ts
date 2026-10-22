// src/main.ts
// Bootstrap: theme, settings, game, renderer, input, feedback (audio, haptics), HUD,
// overlays, and the frame loop.

import { AudioManager } from './audio';
import { feedbackFor, type FeedbackPlan } from './feedback/plan';
import { Mulberry32 } from './game/rng';
import { Game, GameStatus, type TurnResult } from './game/state';
import { createHaptics } from './haptics';
import { createInput } from './input';
import { computeLayout, type Insets, type Layout } from './render/layout';
import { createPixiRenderer } from './render/pixi-renderer';
import { cssVariables, theme } from './render/theme';
import { loadSettings, reduceMotion, saveSettings } from './settings';
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
const muteBtn = el<HTMLButtonElement>('mute');
const overlay = el('overlay');
const overlayTitle = el('overlay-title');
const overlayMsg = el('overlay-msg');
const newBestEl = el('new-best');
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

// --- Settings, audio, haptics ----------------------------------------------------
const settings = loadSettings();
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const audio = new AudioManager({ muted: settings.muted });
const haptics = createHaptics(navigator, settings.haptics);

// iOS only lets audio start from a user gesture: unlock on the first pointer event.
window.addEventListener('pointerdown', () => audio.unlock(), { capture: true, passive: true });

function renderMuteButton(): void {
  muteBtn.setAttribute('aria-pressed', String(settings.muted));
  muteBtn.setAttribute('aria-label', settings.muted ? 'Sound off' : 'Sound on');
  muteBtn.classList.toggle('muted', settings.muted);
}

muteBtn.addEventListener('click', () => {
  settings.muted = !settings.muted;
  audio.muted = settings.muted;
  saveSettings(settings);
  renderMuteButton();
});

// --- State -------------------------------------------------------------------
let layout: Layout | null = null;
let highScore = loadHighScore();
/** The best score when this game started, for "New best!". */
let bestAtStart = highScore;
/** Score shown in the HUD; counts up towards game.score. */
let shownScore = 0;
let lastFeedback: FeedbackPlan | null = null;
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
  const plan = feedbackFor(result, { reduceMotion: reduceMotion(settings, motionQuery.matches) });
  lastFeedback = plan;
  renderer.playEffects(result, plan);
  for (const cue of plan.sounds) audio.play(cue);
  if (plan.haptic !== null) haptics.vibrate(plan.haptic);

  if (game.score > highScore) {
    highScore = game.score;
    saveHighScore(highScore);
  }
  updateHud();
  if (game.status === GameStatus.GAME_OVER) renderer.playGameOver(game, showGameOver);
}

function updateHud(): void {
  bestEl.textContent = String(Math.max(highScore, game.score));
  comboWrap.hidden = game.combo < 2;
  comboEl.textContent = `Combo ×${game.combo}`;
}

/** Count the HUD score up towards the real score (about 0.4 s for any jump). */
function tickScore(dt: number): void {
  if (shownScore === game.score) return;
  if (freezeAnimations || shownScore > game.score) {
    shownScore = game.score;
  } else {
    const step = Math.max(1, Math.ceil((game.score - shownScore) * Math.min(1, dt * 8)));
    shownScore = Math.min(game.score, shownScore + step);
  }
  scoreEl.textContent = String(shownScore);
}

function showGameOver(): void {
  overlayTitle.textContent = 'Game Over';
  overlayMsg.textContent = `Score ${game.score}  ·  Best ${Math.max(highScore, game.score)}`;
  newBestEl.hidden = !(game.score > bestAtStart && game.score > 0);
  overlay.hidden = false;
}

restartBtn.addEventListener('click', () => {
  game.reset();
  renderer.clearEffects();
  bestAtStart = highScore;
  shownScore = 0;
  scoreEl.textContent = '0';
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
  tickScore(dt);
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
renderMuteButton();
new ResizeObserver(resize).observe(stage);
start();

if (testMode) {
  installTestHook({
    game,
    seed,
    getLayout: () => layout,
    frameCosts,
    getFeedback: () => lastFeedback,
  });
}
