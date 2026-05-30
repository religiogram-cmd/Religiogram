/**
 * ReligioGram Service Worker
 * Strategy:
 *   - App shell (HTML, CSS, JS, icons): Cache-first with network fallback
 *   - API calls (/api/, /v1/): Network-only — never serve stale financial data
 *   - Next.js build artifacts (/_next/): NEVER cache — they have hashed names
 *     and a stale webpack runtime serving wrong chunk IDs breaks the entire app.
 *   - Everything else: Network-first, falling back to cache, then offline page
 */

const CACHE_NAME  = 'religiogram-shell-v3';
const IMG_CACHE   = 'religiogram-imgs-v3';
const OFFLINE_URL = '/offline.html';
const IMG_CACHE_MAX = 80;            // hard ceiling so the cache doesn't grow forever

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/logo-icon.png',
  '/logo-icon.svg',
  '/logo.png',
  // Hot heroes — pre-cached so they paint instantly on revisit even before
  // the page has fully booted.
  '/home-hero.jpg',
  '/holy-places-hero.jpg',
  OFFLINE_URL,
];

/** Trim the image cache to IMG_CACHE_MAX entries (LRU-ish, oldest first). */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys  = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
}

// ── Install: precache shell assets ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  // Take over immediately — don't wait for old SW to be released
  self.skipWaiting();
});

// ── Activate: clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const keep = new Set([CACHE_NAME, IMG_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)),
      ),
    ),
  );
  // Claim all open clients so the new SW applies to existing tabs immediately
  self.clients.claim();
});

// ── Fetch: routing strategy ──────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // CRITICAL: never touch Next.js build output. These files have content-hashed
  // names that change every build; caching them stales the webpack runtime and
  // breaks the entire app with "Cannot read properties of undefined (reading
  // 'call')" the next time you rebuild. Let the browser fetch them directly.
  if (url.pathname.startsWith('/_next/')) return;

  // Hot-reload websocket / dev endpoints
  if (url.pathname.startsWith('/__next') || url.pathname.includes('hot-update')) return;

  // API calls: network-only — never cache payment/OTP/auth responses
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) {
    return; // Let the browser handle it (network only)
  }

  // Firebase messaging SW: don't interfere
  if (url.pathname.includes('firebase')) return;

  // Same-origin static images → stale-while-revalidate against a dedicated
  // image cache. Returns the cached copy instantly if we have one, then
  // refreshes it in the background. Keeps the cache bounded at IMG_CACHE_MAX.
  if (url.pathname.match(/\.(png|svg|ico|jpg|jpeg|webp|avif)$/)) {
    event.respondWith((async () => {
      const cache  = await caches.open(IMG_CACHE);
      const cached = await cache.match(request);
      const fetchAndCache = fetch(request).then((res) => {
        if (res.ok) {
          cache.put(request, res.clone()).then(() => trimCache(IMG_CACHE, IMG_CACHE_MAX));
        }
        return res;
      }).catch(() => cached);                  // offline → keep cached
      return cached || fetchAndCache;
    })());
    return;
  }

  // App shell: cache-first for the explicit precache list + fonts.
  if (PRECACHE_URLS.includes(url.pathname) || url.pathname.match(/\.(woff2?|ttf|otf)$/)) {
    event.respondWith(
      caches.match(request).then(
        (cached) => cached || fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        }),
      ).catch(() => caches.match(OFFLINE_URL)),
    );
    return;
  }

  // HTML navigation: network-first, cache fallback, then offline page
  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request) || caches.match(OFFLINE_URL)),
    );
  }
});
