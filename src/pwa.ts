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
  });
  reloadButton.addEventListener('click', () => {
    prompt.hidden = true;
    void updateSW(true);
  });
}
