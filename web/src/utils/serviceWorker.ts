/**
 * Registers the service worker (`sw/service-worker.js`, written into the build
 * by `vite.config.ts`) — what lets the counter open with no connection, even
 * after the browser was closed (requirement 30).
 *
 * Only in a production build, and only on a secure page (https, or localhost),
 * which is the only place a browser allows one. In development any worker left
 * from a production build on the same address is removed, so a dev page is never
 * served from yesterday's cache. `VITE_SERVICE_WORKER=off` is the way back if a
 * worker ever misbehaves: that build publishes one that removes itself.
 *
 * A counter tab stays open all day, so the worker is asked to look for a new
 * build whenever the tab comes back into view.
 */
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  if (!import.meta.env.PROD || import.meta.env.VITE_SERVICE_WORKER === 'off') {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => undefined);
    return;
  }
  if (!window.isSecureContext) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void registration.update().catch(() => undefined);
        });
      })
      .catch(() => undefined);
  });

  // A page loaded before a deploy can ask for a chunk the host no longer has:
  // load the current build, once — never in a loop.
  window.addEventListener('vite:preloadError', (event) => {
    const key = 'kitnapay_reloaded_for_chunk';
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      return;
    }
    event.preventDefault();
    window.location.reload();
  });
}
