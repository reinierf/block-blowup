// src/splash.ts
// The start screen's intro, played once per launch: the logo's blocks drop in and bounce,
// BLOWUP bursts as a glow blooms behind the logo, the badge and buttons pop up. The animation
// itself is CSS (style.css, `.splash.intro`), so it starts on first paint, before any
// script runs. This module adds the burst particles, lets a tap skip to the end, and removes `intro` when it is over, so returning to the
// menu shows the settled screen instead of replaying it.

import { theme } from './render/theme';

/** Number of block particles in the burst. */
export const BURST_COUNT = 18;

/** The animation on the splash root that marks the end of the intro (style.css). */
export const DONE_ANIMATION = 'splash-done';

export interface BurstParticle {
  /** Where the particle flies to, in px from the burst centre. */
  dx: number;
  dy: number;
  /** Spin over the flight, in degrees. */
  rot: number;
  /** Side length in px. */
  size: number;
  /** Block colour name (a `--block-*` CSS variable). */
  color: string;
}

/** Particles spread evenly around the circle, with jitter, in the block colours. */
export function burstParticles(
  count: number,
  random: () => number = Math.random,
  colors: readonly string[] = Object.keys(theme.blocks),
): BurstParticle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = ((i + (random() - 0.5) * 0.6) / count) * 2 * Math.PI;
    const dist = 90 + random() * 80;
    return {
      dx: Math.round(Math.cos(angle) * dist),
      dy: Math.round(Math.sin(angle) * dist),
      rot: Math.round((random() - 0.5) * 540),
      size: Math.round(12 + random() * 10),
      color: colors[i % colors.length]!,
    };
  });
}

export interface Splash {
  /** End the intro now (idempotent): everything jumps to its settled state. */
  finish(): void;
}

/**
 * Run (or skip) the intro on `root`, the start screen with class `intro`. With `animate`
 * false (reduced motion, frozen test mode) it ends at once.
 */
export function setupSplash(
  root: HTMLElement,
  { animate, random = Math.random }: { animate: boolean; random?: () => number },
): Splash {
  const burst = root.querySelector<HTMLElement>('.burst');
  let done = false;

  function finish(): void {
    if (done) return;
    done = true;
    root.classList.remove('intro');
    burst?.replaceChildren();
    root.removeEventListener('click', finish);
    root.removeEventListener('animationend', onAnimation);
    root.removeEventListener('animationcancel', onAnimation);
  }

  function onAnimation(e: Event): void {
    if (e.target === root && (e as AnimationEvent).animationName === DONE_ANIMATION) finish();
  }

  if (!animate) {
    finish();
    return { finish };
  }

  for (const p of burstParticles(BURST_COUNT, random)) {
    const i = document.createElement('i');
    i.style.setProperty('--dx', `${p.dx}px`);
    i.style.setProperty('--dy', `${p.dy}px`);
    i.style.setProperty('--rot', `${p.rot}deg`);
    i.style.setProperty('--size', `${p.size}px`);
    i.style.setProperty('--c', `var(--block-${p.color})`);
    burst?.append(i);
  }
  // On click, not pointerdown: skipping moves the buttons to where they settle, and a press
  // that started on a rising button must still end on it, or the tap is lost.
  root.addEventListener('click', finish);
  // Cancelled when the screen is hidden mid-intro (New game, Continue, Settings).
  root.addEventListener('animationend', onAnimation);
  root.addEventListener('animationcancel', onAnimation);
  return { finish };
}
