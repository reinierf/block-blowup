import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cssVariables,
  cssVariablesRule,
  currentThemeName,
  resolveThemeName,
  setTheme,
  theme,
  THEME_KEY,
  THEMES,
} from '../../src/render/theme';

describe('cssVariablesRule', () => {
  it('is a :root rule declaring every theme variable', () => {
    const rule = cssVariablesRule();
    expect(rule.startsWith(':root{')).toBe(true);
    expect(rule.endsWith('}')).toBe(true);
    for (const [name, value] of Object.entries(cssVariables())) {
      expect(rule).toContain(`${name}:${value}`);
    }
  });

  it('includes the page background, so the first paint is not white', () => {
    expect(cssVariablesRule()).toContain(`--bg-top:${theme.bgTop}`);
    expect(cssVariablesRule()).toContain(`--bg-bottom:${theme.bgBottom}`);
  });
});

describe('resolveThemeName', () => {
  it('prefers a valid URL parameter, then the remembered choice, then vivid', () => {
    expect(resolveThemeName('neon', 'subdued')).toBe('neon');
    expect(resolveThemeName(null, 'neon')).toBe('neon');
    expect(resolveThemeName('bogus', 'subdued')).toBe('subdued');
    expect(resolveThemeName(null, null)).toBe('vivid');
    expect(resolveThemeName('toString', 'constructor')).toBe('vivid');
  });

  it('defaults to VIVID outside a browser (build, icons, Node tests)', () => {
    expect(theme).toEqual(THEMES.vivid);
    expect(currentThemeName()).toBe('vivid');
  });
});

describe('setTheme', () => {
  afterEach(() => setTheme('vivid'));

  it('swaps the active theme in place, so held references see it', () => {
    const held = theme;
    setTheme('neon');
    expect(held).toBe(theme);
    expect(theme).toEqual(THEMES.neon);
    expect(currentThemeName()).toBe('neon');
    expect(cssVariables()['--bg-top']).toBe(THEMES.neon.bgTop);
  });

  it('drops optional tokens the new theme lacks, and leaves THEMES untouched', () => {
    setTheme('neon');
    setTheme('vivid');
    expect(theme).toEqual(THEMES.vivid);
    expect(theme.blockStyle).toBeUndefined();
    expect(THEMES.neon.blockStyle).toBe('tube');
  });

  it('remembers the choice', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    try {
      setTheme('subdued');
      expect(store.get(THEME_KEY)).toBe('subdued');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
