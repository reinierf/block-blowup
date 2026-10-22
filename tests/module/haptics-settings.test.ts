import { describe, expect, it, vi } from 'vitest';
import { createHaptics } from '../../src/haptics';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  loadSettings,
  reduceMotion,
  saveSettings,
} from '../../src/settings';

describe('haptics', () => {
  it('vibrates where the API exists and haptics are on', () => {
    const vibrate = vi.fn(() => true);
    const h = createHaptics({ vibrate });
    expect(h.supported).toBe(true);
    h.vibrate([10, 20]);
    expect(vibrate).toHaveBeenCalledWith([10, 20]);
    h.enabled = false;
    h.vibrate(10);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('does nothing, without crashing, where navigator.vibrate is missing (iOS Safari)', () => {
    const h = createHaptics({});
    expect(h.supported).toBe(false);
    expect(() => h.vibrate(10)).not.toThrow();
    expect(createHaptics(undefined).supported).toBe(false);
  });

  it('swallows errors from vibrate', () => {
    const h = createHaptics({
      vibrate: () => {
        throw new Error('needs user activation');
      },
    });
    expect(() => h.vibrate(10)).not.toThrow();
  });
});

describe('settings', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      data,
    };
  };

  it('round-trips through storage', () => {
    const store = memory();
    const s = { muted: true, haptics: false, reducedMotion: 'on' as const };
    saveSettings(s, store);
    expect(JSON.parse(store.data.get(SETTINGS_KEY)!)).toEqual(s);
    expect(loadSettings(store)).toEqual(s);
  });

  it('uses defaults when nothing is stored', () => {
    expect(loadSettings(memory())).toEqual(DEFAULT_SETTINGS);
  });

  it('uses defaults when localStorage is unavailable', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, throwing)).not.toThrow();
  });

  it('survives corrupt and old-format data, keeping valid fields', () => {
    const store = memory();
    for (const bad of ['{not json', '"a string"', '42', 'null', '[]']) {
      store.data.set(SETTINGS_KEY, bad);
      expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    }
    store.data.set(SETTINGS_KEY, JSON.stringify({ muted: 'yes', haptics: false, sound: 1 }));
    expect(loadSettings(store)).toEqual({ ...DEFAULT_SETTINGS, haptics: false });
    store.data.set(SETTINGS_KEY, JSON.stringify({ reducedMotion: 'sometimes' }));
    expect(loadSettings(store).reducedMotion).toBe('system');
  });

  it('works with the real (happy-dom) localStorage', () => {
    localStorage.clear();
    saveSettings({ ...DEFAULT_SETTINGS, muted: true });
    expect(loadSettings().muted).toBe(true);
  });

  it('resolves reduced motion against the OS preference', () => {
    const s = (reducedMotion: 'system' | 'on' | 'off') => ({ ...DEFAULT_SETTINGS, reducedMotion });
    expect(reduceMotion(s('system'), true)).toBe(true);
    expect(reduceMotion(s('system'), false)).toBe(false);
    expect(reduceMotion(s('on'), false)).toBe(true);
    expect(reduceMotion(s('off'), true)).toBe(false);
  });
});
