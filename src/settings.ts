// src/settings.ts
// Player settings, persisted in localStorage. Loading never throws: unavailable storage,
// corrupt JSON or fields of the wrong type fall back to the defaults field by field.

export type ReducedMotionSetting = 'system' | 'on' | 'off';

export interface Settings {
  muted: boolean;
  haptics: boolean;
  /** 'system' follows prefers-reduced-motion. */
  reducedMotion: ReducedMotionSetting;
}

export const SETTINGS_KEY = 'block-blowup.settings';

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  muted: false,
  haptics: true,
  reducedMotion: 'system',
});

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // e.g. Safari private mode or blocked third-party storage
  }
}

export function loadSettings(store: StorageLike | null = storage()): Settings {
  let raw: unknown;
  try {
    const text = store?.getItem(SETTINGS_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    muted: typeof o.muted === 'boolean' ? o.muted : DEFAULT_SETTINGS.muted,
    haptics: typeof o.haptics === 'boolean' ? o.haptics : DEFAULT_SETTINGS.haptics,
    reducedMotion:
      o.reducedMotion === 'system' || o.reducedMotion === 'on' || o.reducedMotion === 'off'
        ? o.reducedMotion
        : DEFAULT_SETTINGS.reducedMotion,
  };
}

export function saveSettings(settings: Settings, store: StorageLike | null = storage()): void {
  try {
    store?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage full or unavailable: settings just won't persist */
  }
}

/** Whether to reduce motion, given the setting and the OS preference. */
export function reduceMotion(settings: Settings, prefersReducedMotion: boolean): boolean {
  return settings.reducedMotion === 'system'
    ? prefersReducedMotion
    : settings.reducedMotion === 'on';
}
