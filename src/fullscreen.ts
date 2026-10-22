// src/fullscreen.ts
// Fullscreen toggle for the browser tab. Feature-detected: offered only where the
// Fullscreen API works (not on iPhone Safari) and only in a browser tab, since the
// installed PWA already fills the screen.

export interface Fullscreen {
  /** Whether a fullscreen toggle should be offered at all. */
  readonly supported: boolean;
  readonly active: boolean;
  toggle(): void;
  /** Calls `listener` whenever fullscreen is entered or left (also by Esc or Back). */
  onChange(listener: () => void): void;
}

/** The standard API plus the `webkit` prefix that older iPadOS Safari still needs. */
export type DocumentLike = {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
  documentElement: {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => void;
  };
  addEventListener(type: string, listener: () => void): void;
};

export type WindowLike = {
  matchMedia(query: string): { matches: boolean };
  navigator: { standalone?: boolean };
};

/** True when running as an installed app (Android/desktop PWA, or iOS home screen). */
export function isStandalone(win: WindowLike): boolean {
  return win.matchMedia('(display-mode: standalone)').matches || win.navigator.standalone === true;
}

export function createFullscreen(
  doc: DocumentLike = document as unknown as DocumentLike,
  win: WindowLike = window as unknown as WindowLike,
): Fullscreen {
  const root = doc.documentElement;
  const enabled =
    (doc.fullscreenEnabled === true && typeof root.requestFullscreen === 'function') ||
    (doc.webkitFullscreenEnabled === true && typeof root.webkitRequestFullscreen === 'function');
  const supported = enabled && !isStandalone(win);
  const isActive = () => (doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null) !== null;

  return {
    supported,
    get active() {
      return isActive();
    },
    toggle() {
      if (!supported) return;
      try {
        // A refused request (no user gesture, permissions policy) just leaves things as they are.
        if (isActive()) {
          if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => {});
          else doc.webkitExitFullscreen?.();
        } else if (root.requestFullscreen) {
          void root.requestFullscreen().catch(() => {});
        } else {
          root.webkitRequestFullscreen?.();
        }
      } catch {
        /* older WebKit throws instead of rejecting */
      }
    },
    onChange(listener) {
      doc.addEventListener('fullscreenchange', listener);
      doc.addEventListener('webkitfullscreenchange', listener);
    },
  };
}
