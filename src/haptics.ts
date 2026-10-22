// src/haptics.ts
// Vibration feedback. Feature-detected: iOS Safari has no Vibration API, so there (and
// anywhere vibrate is missing or throws) this silently does nothing.

export interface Haptics {
  /** Whether this device can vibrate at all. */
  readonly supported: boolean;
  enabled: boolean;
  vibrate(pattern: number | number[]): void;
}

type NavigatorLike = { vibrate?: (pattern: number | number[]) => boolean };

export function createHaptics(
  nav: NavigatorLike | undefined = globalThis.navigator as NavigatorLike | undefined,
  enabled = true,
): Haptics {
  const supported = typeof nav?.vibrate === 'function';
  return {
    supported,
    enabled,
    vibrate(pattern) {
      if (!this.enabled || !supported) return;
      try {
        nav!.vibrate!(pattern);
      } catch {
        /* some browsers throw without a user gesture: ignore */
      }
    },
  };
}
