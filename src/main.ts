// src/main.ts
// Bootstrap: theme, settings, screens, game (new or resumed), renderer, input, feedback
// (audio, haptics), HUD, PWA, and the frame loop.

import { AudioManager } from './audio';
import { feedbackFor, type FeedbackPlan } from './feedback/plan';
import { difficultyFor } from './game/difficulty';
import { Mulberry32 } from './game/rng';
import { restoreGame, saveGame, type SavedGame } from './game/save';
import { Game, GameStatus, type TurnResult } from './game/state';
import { createHaptics } from './haptics';
import { createInput, type DragState } from './input';
import { setupPwa } from './pwa';
import { computeLayout, fitScale, type Insets, type Layout } from './render/layout';
import type { Renderer } from './render/renderer';
import { cssVariables, theme } from './render/theme';
import { loadSettings, reduceMotion, saveSettings, type ReducedMotionSetting } from './settings';
import {
  clearSavedGame,
  loadHighScore,
  loadSavedGame,
  saveGameInProgress,
  saveHighScore,
} from './storage';
import { installTestHook } from './test-hook';

// --- DOM ---------------------------------------------------------------------
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

const stage = el('stage');
const hud = el('hud');
const scoreWrap = el('score-wrap');
const scoreEl = el('score');
const bestEl = el('best');
const comboWrap = el('combo-wrap');
const comboEl = el('combo');
const safeProbe = el('safe-probe');
const startScreen = el('start');
const startBest = el('start-best');
const continueBtn = el<HTMLButtonElement>('continue');
const settingsScreen = el('settings');
const soundToggle = el<HTMLInputElement>('set-sound');
const hapticsToggle = el<HTMLInputElement>('set-haptics');
const hapticsNote = el('haptics-note');
const overlay = el('overlay');
const overScore = el('over-score');
const overBest = el('over-best');
const newBestEl = el('new-best');
const debugEl = el('debug');

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
/** The first new game uses ?seed= (dev/test builds); later ones a random seed. */
let nextSeed: number | null =
  seedParam !== null && /^\d+$/.test(seedParam) ? Number(seedParam) >>> 0 : null;
const showDebug = params.has('debug');

// --- Settings, audio, haptics ----------------------------------------------------
const settings = loadSettings();
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const audio = new AudioManager({ muted: settings.muted });
const haptics = createHaptics(navigator, settings.haptics);

// iOS only lets audio start from a user gesture: unlock on the first pointer event.
window.addEventListener('pointerdown', () => audio.unlock(), { capture: true, passive: true });

// --- Game state --------------------------------------------------------------
let layout: Layout | null = null;
let highScore = loadHighScore();
/** The best score when this game started, for "New best!". */
let bestAtStart = highScore;
/** Score shown in the HUD; counts up towards game.score. */
let shownScore = 0;
let lastFeedback: FeedbackPlan | null = null;
let seed = 0;
let random = new Mulberry32(0);
/**
 * Until Play or Continue, a throwaway game (never saved) sits behind the start screen, so
 * launching never overwrites the saved game and doesn't use up the ?seed.
 */
let game = new Game({ rng: random.next });

function newGame(): void {
  seed = nextSeed ?? crypto.getRandomValues(new Uint32Array(1))[0]!;
  nextSeed = null;
  random = new Mulberry32(seed);
  game = new Game({ rng: random.next });
  afterGameChange();
}

function resumeGame(saved: SavedGame): void {
  random = new Mulberry32(saved.rngState);
  game = restoreGame(saved, random.next);
  afterGameChange();
}

function afterGameChange(): void {
  renderer?.clearEffects();
  lastFeedback = null;
  bestAtStart = highScore;
  shownScore = game.score;
  showScore();
  persist();
  updateHud();
}

/** Save after every move, so a killed PWA resumes where it was. */
function persist(): void {
  if (game.status === GameStatus.GAME_OVER) clearSavedGame();
  else saveGameInProgress(saveGame(game, random.state));
}

// --- Renderer (loaded on demand) ---------------------------------------------------
// The start screen is plain HTML. The PixiJS renderer (the heavy part: module, WebGL set-up,
// texture baking) loads when the player first starts or continues a game, so launching
// stays fast. The service worker precaches the chunk, so this costs a moment once.
let renderer: Renderer | null = null;
let rendererReady: Promise<Renderer> | null = null;
let input: { readonly drag: DragState | null } | null = null;

function ensureRenderer(): Promise<Renderer> {
  rendererReady ??= (async () => {
    const { createPixiRenderer } = await import('./render/pixi-renderer');
    const r = await createPixiRenderer(stage, { freezeAnimations, maxResolution: 2 });
    renderer = r;
    input = createInput({
      surface: r.canvas,
      getLayout: () => (isScreenOpen() ? null : layout),
      getGame: () => game,
      onPlace: handlePlace,
    });
    if (layout) r.resize(layout);
    return r;
  })();
  return rendererReady;
}

/** Disable a button while the renderer loads behind it. */
async function withRenderer(button: HTMLButtonElement, then: () => void): Promise<void> {
  button.disabled = true;
  try {
    await ensureRenderer();
    then();
  } finally {
    button.disabled = false;
  }
}

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
  for (const [node, r] of [
    [hud, layout.hud],
    [scoreWrap, layout.score],
  ] as const) {
    Object.assign(node.style, {
      left: `${r.x}px`,
      top: `${r.y}px`,
      width: `${r.w}px`,
      height: `${r.h}px`,
    });
  }
  showScore();
  renderer?.resize(layout);
}

// --- Gameplay callbacks ------------------------------------------------------
function handlePlace(result: TurnResult): void {
  const plan = feedbackFor(result, { reduceMotion: reduceMotion(settings, motionQuery.matches) });
  lastFeedback = plan;
  renderer!.playEffects(result, plan);
  for (const cue of plan.sounds) audio.play(cue);
  if (plan.haptic !== null) haptics.vibrate(plan.haptic);

  if (game.score > highScore) {
    highScore = game.score;
    saveHighScore(highScore);
  }
  persist();
  updateHud();
  updateDebug();
  if (game.status === GameStatus.GAME_OVER) renderer!.playGameOver(game, showGameOver);
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
  showScore();
}

/** Show the score, shrunk if needed so it stays between the HUD and the board. */
function showScore(): void {
  const text = String(shownScore);
  if (scoreEl.textContent !== text) scoreEl.textContent = text;
  if (!layout) return;
  // offsetWidth/Height ignore transforms: the unscaled size, including any text scaling.
  const k = fitScale(scoreEl.offsetWidth, scoreEl.offsetHeight, layout.score);
  scoreEl.style.transform = k < 1 ? `scale(${k})` : '';
}

function updateDebug(): void {
  if (!showDebug) return;
  const d = game.lastDeal;
  debugEl.textContent = [
    `seed ${seed}`,
    `difficulty ${difficultyFor(game.score).toFixed(2)}`,
    d
      ? `deal: redraws ${d.redraws}, mercy ${d.mercyReason ?? 'no'}${d.mercy ? ' (boosted)' : ''}`
      : 'deal: (restored)',
    d
      ? `solvable ${d.requireSolvable ? d.solvable : 'not required'}, fallback ${d.fallback}, nodes ${d.solverNodes}`
      : '',
    `combo ${game.combo} (misses ${game.movesSinceClear}), dry hands ${game.handsWithoutClear}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// --- Screens -----------------------------------------------------------------
function isScreenOpen(): boolean {
  return !startScreen.hidden || !settingsScreen.hidden || !overlay.hidden;
}

function showStart(): void {
  overlay.hidden = true;
  settingsScreen.hidden = true;
  startBest.textContent = String(highScore);
  continueBtn.hidden = loadSavedGame() === null;
  startScreen.hidden = false;
}

function showGameOver(): void {
  overScore.textContent = String(game.score);
  overBest.textContent = String(Math.max(highScore, game.score));
  newBestEl.hidden = !(game.score > bestAtStart && game.score > 0);
  overlay.hidden = false;
}

const playBtn = el<HTMLButtonElement>('play');
playBtn.addEventListener('click', () =>
  withRenderer(playBtn, () => {
    newGame();
    startScreen.hidden = true;
    updateDebug();
  }),
);

continueBtn.addEventListener('click', () =>
  withRenderer(continueBtn, () => {
    const saved = loadSavedGame();
    if (saved) resumeGame(saved);
    startScreen.hidden = true;
    updateDebug();
  }),
);

el('restart').addEventListener('click', () => {
  newGame();
  overlay.hidden = true;
  updateDebug();
});

el('to-menu').addEventListener('click', () => {
  newGame();
  showStart();
});

// --- Settings screen ---------------------------------------------------------
/** Where Done returns to: the start screen, or back to the game. */
let settingsFromStart = false;

function openSettings(fromStart: boolean): void {
  settingsFromStart = fromStart;
  soundToggle.checked = !settings.muted;
  hapticsToggle.checked = settings.haptics && haptics.supported;
  hapticsToggle.disabled = !haptics.supported;
  hapticsNote.hidden = haptics.supported;
  for (const r of document.querySelectorAll<HTMLInputElement>('input[name="motion"]')) {
    r.checked = r.value === settings.reducedMotion;
  }
  startScreen.hidden = true;
  settingsScreen.hidden = false;
}

function applySettings(): void {
  audio.muted = settings.muted;
  haptics.enabled = settings.haptics;
  saveSettings(settings);
}

soundToggle.addEventListener('change', () => {
  settings.muted = !soundToggle.checked;
  applySettings();
});
hapticsToggle.addEventListener('change', () => {
  settings.haptics = hapticsToggle.checked;
  applySettings();
  if (settings.haptics) haptics.vibrate(20); // a sample buzz
});
for (const r of document.querySelectorAll<HTMLInputElement>('input[name="motion"]')) {
  r.addEventListener('change', () => {
    if (r.checked) settings.reducedMotion = r.value as ReducedMotionSetting;
    applySettings();
  });
}
el('open-settings').addEventListener('click', () => openSettings(false));
el('start-settings').addEventListener('click', () => openSettings(true));
el('settings-done').addEventListener('click', () => {
  settingsScreen.hidden = true;
  if (settingsFromStart) showStart();
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
  const drew = renderer?.frame(game, input?.drag ?? null, dt) ?? false;
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
// The score font (Nunito) can arrive after the first fit, with different metrics.
void document.fonts?.ready.then(showScore);
updateHud();
new ResizeObserver(resize).observe(stage);
debugEl.hidden = !showDebug;
updateDebug();
showStart();
start();
setupPwa(el('update'), el<HTMLButtonElement>('update-reload'));

if (testMode) {
  installTestHook({
    getGame: () => game,
    getSeed: () => seed,
    getLayout: () => layout,
    frameCosts,
    getFeedback: () => lastFeedback,
  });
}
