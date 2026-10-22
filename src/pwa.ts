// src/pwa.ts
// Service worker registration (vite-plugin-pwa, prompt mode). When a new version is
// waiting, show a small "Update available" prompt; the page only reloads when the player
// taps it, never mid-game on its own.

import { registerSW } from 'virtual:pwa-register';

export function setupPwa(prompt: HTMLElement, reloadButton: HTMLButtonElement): void {
  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      prompt.hidden = false;
    },
    onRegisteredSW(_url, registration) {
      if (registration) checkForUpdatesOnResume(registration);
    },
  });
  reloadButton.addEventListener('click', () => {
    prompt.hidden = true;
    void updateSW(true);
  });
}

/**
 * The browser only looks for a new service worker when the app is launched, and a mobile
 * PWA can sit suspended for days. Check again whenever the app comes back to the
 * foreground, unless offline or an update is already installing.
 */
export function checkForUpdatesOnResume(registration: {
  readonly installing: ServiceWorker | null;
  update(): Promise<unknown>;
}): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!navigator.onLine || registration.installing) return;
    // A failed check (flaky network, server down) just means we try again next time.
    registration.update().catch(() => {});
  });
}
