// Service worker : mise en cache des fichiers de l'application pour le fonctionnement hors ligne.
// Aucune requête vers un autre domaine n'est faite ni mise en cache.
// Pour publier une nouvelle version : incrémenter CACHE_NAME (sinon l'ancienne version reste en cache).
const CACHE_NAME = 'mp-test-v1';
const FILES = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './src/crypto.js',
  './src/vault.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then(cached => cached || fetch(event.request))
  );
});
