// @ts-check
/// <reference lib="webworker" />

/**
 * KitnaPay's service worker — what lets the web counter open with no
 * connection at all, even after the browser has been closed (requirement 30).
 *
 * It keeps every file of one build — the page, each page's own chunk, the Hindi,
 * Gujarati and Marathi words — so the whole app opens offline, not only the
 * counter. The bills themselves are kept by the app (IndexedDB), never here.
 *
 * - **Pages**: the network first, so a deploy reaches anyone online at once; with
 *   no answer in 4 seconds, no connection, or a server error, the kept page of
 *   this build. A page from the network is never written back, so a kept page and
 *   its chunks always come from the same build.
 * - **`/assets/*`** (content-hashed): the kept copy, else the network — and only a
 *   real script or stylesheet is kept: the host answers a missing file with the
 *   app's own page, which must never be filed under a script's name.
 * - **The API is never touched** — another origin, and `/api/` on this one. Money
 *   is not something to answer from a cache.
 *
 * The file list below is written in by the build (`vite.config.ts`), which fails
 * if the marker is missing rather than shipping a worker that keeps nothing.
 */
const BUILD = /* @hk-build */ { version: 'dev', files: /** @type {string[]} */ ([]) } /* @end */;

const PREFIX = 'kitnapay-shell-';
const CACHE = PREFIX + BUILD.version;
const NAVIGATION_TIMEOUT_MS = 4000;

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // All or nothing: a half-kept build would open offline and then fail to
      // load a page's chunk.
      await Promise.all(
        BUILD.files.map(async (url) => {
          const response = await fetch(new Request(url, { cache: url === '/index.html' ? 'no-cache' : 'default' }));
          if (!response.ok) throw new Error(`Could not keep ${url}: ${response.status}`);
          await cache.put(url, response);
        })
      );
      await sw.skipWaiting();
    })()
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // This build and the one before it: a tab still open on the old build can
      // still load the chunks it was built with. Older ones go.
      const others = (await caches.keys()).filter((key) => key.startsWith(PREFIX) && key !== CACHE);
      const previous = others[others.length - 1];
      await Promise.all(others.filter((key) => key !== previous).map((key) => caches.delete(key)));
      await sw.clients.claim();
    })()
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(page(request));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(asset(request));
  } else if (BUILD.files.includes(url.pathname)) {
    event.respondWith(kept(request));
  }
});

/** @param {Request} request */
async function page(request) {
  try {
    if (sw.navigator.onLine === false) throw new Error('offline');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
    try {
      const response = await fetch(request, { signal: controller.signal });
      if (response.status >= 500) throw new Error('server error');
      return response;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    const own = await caches.open(CACHE);
    return (await own.match('/index.html')) ?? (await caches.match('/index.html')) ?? Response.error();
  }
}

/** @param {Request} request */
async function asset(request) {
  // Across every kept build, so a newer worker's files are usable before it takes over.
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  const type = response.headers.get('content-type') ?? '';
  if (response.ok && !type.includes('text/html')) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

/** @param {Request} request */
async function kept(request) {
  return (await caches.match(request)) ?? fetch(request);
}
