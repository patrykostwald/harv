/* Harv: cache offline. Podbij CACHE przy każdej zmianie plików. */
const CACHE = 'harv-v19';
const FILES = ["./", "./index.html", "./bg.js", "./colors.js", "./audio.js", "./gas.js", "./game.js", "./gestosc.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-180.png", "./icon-maskable-512.png", "./fonts/fonts.css", "./fonts/manrope-400-latin-ext.woff2", "./fonts/manrope-400-latin.woff2", "./fonts/manrope-600-latin-ext.woff2", "./fonts/manrope-600-latin.woff2", "./fonts/manrope-800-latin-ext.woff2", "./fonts/manrope-800-latin.woff2", "./fonts/unbounded-600-latin-ext.woff2", "./fonts/unbounded-600-latin.woff2", "./fonts/unbounded-800-latin-ext.woff2", "./fonts/unbounded-800-latin.woff2"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => { if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request))); });
