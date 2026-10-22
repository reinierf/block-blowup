import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }));

import { checkForUpdatesOnResume } from '../../src/pwa';

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

describe('checkForUpdatesOnResume', () => {
  afterEach(() => setOnline(true));

  it('checks for a new service worker when the app returns to the foreground', () => {
    const registration = { installing: null, update: vi.fn(() => Promise.resolve()) };
    checkForUpdatesOnResume(registration);
    setVisibility('hidden');
    expect(registration.update).not.toHaveBeenCalled();
    setVisibility('visible');
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('skips the check while offline or while an update is installing', () => {
    const offline = { installing: null, update: vi.fn(() => Promise.resolve()) };
    const busy = {
      installing: {} as ServiceWorker,
      update: vi.fn(() => Promise.resolve()),
    };
    checkForUpdatesOnResume(offline);
    checkForUpdatesOnResume(busy);
    setOnline(false);
    setVisibility('visible');
    expect(offline.update).not.toHaveBeenCalled();
    setOnline(true);
    setVisibility('visible');
    expect(busy.update).not.toHaveBeenCalled();
  });

  it('swallows a failed check', async () => {
    const registration = { installing: null, update: vi.fn(() => Promise.reject(new Error('x'))) };
    checkForUpdatesOnResume(registration);
    setVisibility('visible');
    await expect(registration.update.mock.results[0]!.value).rejects.toThrow();
  });
});
