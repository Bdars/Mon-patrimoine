// Service worker V5 : cache d’application uniquement. Aucune donnée financière n’est mise en cache.
const CACHE = 'mp-v5-phase2-4';
const FILES = [
  './',
  './app.js',
  './charts/svg.js',
  './finance/core.js',
  './finance/jeu-fictif.js',
  './finance/model.js',
  './finance/validate.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './index.html',
  './manifest.json',
  './src/crypto.js',
  './src/vault.js',
  './style.css',
  './views/finance.js',
  './views/ui.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // aucune requête externe n’est servie ni mise en cache
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
