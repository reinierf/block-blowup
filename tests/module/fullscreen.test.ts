import { describe, expect, it, vi } from 'vitest';
import {
  createFullscreen,
  isStandalone,
  type DocumentLike,
  type WindowLike,
} from '../../src/fullscreen';

function browserWindow(displayMode = 'browser', standalone?: boolean): WindowLike {
  return {
    matchMedia: (q: string) => ({ matches: q === `(display-mode: ${displayMode})` }),
    navigator: { standalone },
  };
}

/** A document with the standard Fullscreen API that tracks its own state. */
function standardDoc() {
  const listeners: Record<string, (() => void)[]> = {};
  const fire = (type: string) => listeners[type]?.forEach((l) => l());
  const doc = {
    fullscreenEnabled: true,
    fullscreenElement: null as Element | null,
    exitFullscreen: vi.fn(async () => {
      doc.fullscreenElement = null;
      fire('fullscreenchange');
    }),
    documentElement: {
      requestFullscreen: vi.fn(async () => {
        doc.fullscreenElement = {} as Element;
        fire('fullscreenchange');
      }),
    },
    addEventListener: (type: string, l: () => void) => (listeners[type] ??= []).push(l),
  } satisfies DocumentLike;
  return doc;
}

describe('isStandalone', () => {
  it('detects an installed PWA, including iOS home-screen apps', () => {
    expect(isStandalone(browserWindow())).toBe(false);
    expect(isStandalone(browserWindow('standalone'))).toBe(true);
    expect(isStandalone(browserWindow('browser', true))).toBe(true);
  });
});

describe('createFullscreen', () => {
  it('toggles fullscreen in a browser tab and reports changes', async () => {
    const doc = standardDoc();
    const fs = createFullscreen(doc, browserWindow());
    const changed = vi.fn();
    fs.onChange(changed);
    expect(fs.supported).toBe(true);
    expect(fs.active).toBe(false);

    fs.toggle();
    await Promise.resolve();
    expect(doc.documentElement.requestFullscreen).toHaveBeenCalledOnce();
    expect(fs.active).toBe(true);

    fs.toggle();
    await Promise.resolve();
    expect(doc.exitFullscreen).toHaveBeenCalledOnce();
    expect(fs.active).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('is not offered in the installed app', () => {
    const doc = standardDoc();
    const fs = createFullscreen(doc, browserWindow('standalone'));
    expect(fs.supported).toBe(false);
    fs.toggle();
    expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
  });

  it('is not offered where the API is missing or disabled (iPhone Safari)', () => {
    const none: DocumentLike = { documentElement: {}, addEventListener: () => {} };
    expect(createFullscreen(none, browserWindow()).supported).toBe(false);
    const disabled = { ...standardDoc(), fullscreenEnabled: false };
    expect(createFullscreen(disabled, browserWindow()).supported).toBe(false);
  });

  it('uses the webkit-prefixed API where that is all there is', () => {
    const doc: DocumentLike = {
      webkitFullscreenEnabled: true,
      webkitFullscreenElement: null,
      webkitExitFullscreen: vi.fn(),
      documentElement: { webkitRequestFullscreen: vi.fn() },
      addEventListener: vi.fn(),
    };
    const fs = createFullscreen(doc, browserWindow());
    expect(fs.supported).toBe(true);
    fs.toggle();
    expect(doc.documentElement.webkitRequestFullscreen).toHaveBeenCalledOnce();
    doc.webkitFullscreenElement = {} as Element;
    expect(fs.active).toBe(true);
    fs.toggle();
    expect(doc.webkitExitFullscreen).toHaveBeenCalledOnce();
    fs.onChange(() => {});
    expect(doc.addEventListener).toHaveBeenCalledWith(
      'webkitfullscreenchange',
      expect.any(Function),
    );
  });

  it('swallows refused requests', async () => {
    const doc = standardDoc();
    doc.documentElement.requestFullscreen.mockRejectedValueOnce(new TypeError('no gesture'));
    const fs = createFullscreen(doc, browserWindow());
    expect(() => fs.toggle()).not.toThrow();
    await Promise.resolve();
    expect(fs.active).toBe(false);
  });
});
