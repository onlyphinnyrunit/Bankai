// Bankai service worker: offline app shell + cached fonts.
// Bump VERSION whenever any app file changes so phones pick up the update.
const VERSION = 'bankai-v1.1.1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/boot.js',
  './js/app.js',
  './js/store.js',
  './js/db.js',
  './js/ui.js',
  './js/media.js',
  './js/mediaview.js',
  './js/templates.js',
  './js/workout.js',
  './js/backup.js',
  './js/aiz.js',
  './js/aiz-brain.js',
  './js/aiz-kb.js',
  './js/tour.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];
const FONT_CACHE = 'bankai-fonts';

self.addEventListener('install', (e) => {
  // Take over as soon as the new files are cached, so updates arrive by themselves.
  // cache: 'reload' skips the browser's HTTP cache, so an update never stores stale copies of old files.
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== FONT_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: stale-while-revalidate so text looks right offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })());
    return;
  }

  if (url.origin !== self.location.origin) return; // videos, embeds, thumbnails: straight to network

  // App shell: cache first, fall back to network; navigations fall back to index.html.
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && SHELL.some((p) => url.pathname.endsWith(p.replace('./', '/')))) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      throw err;
    }
  })());
});
