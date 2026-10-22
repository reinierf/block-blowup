import { describe, expect, it } from 'vitest';
import { cssVariables, theme } from '../../src/render/theme';
import { BURST_COUNT, DONE_ANIMATION, burstParticles, setupSplash } from '../../src/splash';
import { Mulberry32 } from '../../src/game/rng';

function splashRoot(): HTMLElement {
  const root = document.createElement('section');
  root.className = 'screen splash intro';
  root.innerHTML = '<span class="burst"></span><button>New game</button>';
  document.body.replaceChildren(root);
  return root;
}

function animationEvent(type: string, animationName: string): Event {
  return Object.assign(new Event(type, { bubbles: true }), { animationName });
}

describe('burstParticles', () => {
  const particles = burstParticles(BURST_COUNT, new Mulberry32(1).next);

  it('spreads the particles all around the burst', () => {
    expect(particles).toHaveLength(BURST_COUNT);
    for (const p of particles) {
      const dist = Math.hypot(p.dx, p.dy);
      expect(dist).toBeGreaterThanOrEqual(89);
      expect(dist).toBeLessThanOrEqual(171);
    }
    // Every quadrant gets some.
    const quadrants = new Set(particles.map((p) => `${Math.sign(p.dx)},${Math.sign(p.dy)}`));
    expect(quadrants.size).toBeGreaterThanOrEqual(4);
  });

  it('uses every block colour', () => {
    expect(new Set(particles.map((p) => p.color))).toEqual(new Set(Object.keys(theme.blocks)));
  });
});

describe('setupSplash', () => {
  it('without animation, ends the intro at once and adds no particles', () => {
    const root = splashRoot();
    setupSplash(root, { animate: false });
    expect(root.classList.contains('intro')).toBe(false);
    expect(root.querySelector('.burst')!.children).toHaveLength(0);
  });

  it('adds the burst particles, then ends when the intro animation does', () => {
    const root = splashRoot();
    setupSplash(root, { animate: true, random: new Mulberry32(2).next });
    expect(root.querySelector('.burst')!.children).toHaveLength(BURST_COUNT);
    expect(root.classList.contains('intro')).toBe(true);

    // Another element's animation ending (a tile, a button) doesn't end the intro.
    root.querySelector('button')!.dispatchEvent(animationEvent('animationend', DONE_ANIMATION));
    root.dispatchEvent(animationEvent('animationend', 'tile-drop'));
    expect(root.classList.contains('intro')).toBe(true);

    root.dispatchEvent(animationEvent('animationend', DONE_ANIMATION));
    expect(root.classList.contains('intro')).toBe(false);
    expect(root.querySelector('.burst')!.children).toHaveLength(0);
  });

  it('ends when hidden mid-intro (animation cancelled)', () => {
    const root = splashRoot();
    setupSplash(root, { animate: true });
    root.dispatchEvent(animationEvent('animationcancel', DONE_ANIMATION));
    expect(root.classList.contains('intro')).toBe(false);
  });

  it('a tap skips to the end, for good', () => {
    const root = splashRoot();
    setupSplash(root, { animate: true });
    // Not on the press: the button under the finger must not move before it is released.
    root.dispatchEvent(new Event('pointerdown'));
    expect(root.classList.contains('intro')).toBe(true);
    root.querySelector('button')!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(root.classList.contains('intro')).toBe(false);
    // Shown again later (back to the menu): nothing replays it.
    root.dispatchEvent(new Event('click'));
    expect(root.classList.contains('intro')).toBe(false);
  });
});

describe('cssVariables', () => {
  it('exposes every block colour for the splash', () => {
    const vars = cssVariables();
    for (const [name, hex] of Object.entries(theme.blocks)) {
      expect(vars[`--block-${name}`]).toBe(hex);
    }
  });
});
