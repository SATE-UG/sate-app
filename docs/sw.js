// Service Worker: hält die App-Hülle im Cache, damit die App schnell (und ohne Netz) startet.
// Die Schnittstelle (script.google.com, POST) läuft immer übers Netz, nie aus dem Cache.
// Nach JEDER Änderung an Dateien in docs/ VERSION hochzählen, sonst bleibt auf den iPhones die alte Fassung.
const VERSION = 'v2';
const CACHE = 'sate-huelle-' + VERSION;
const HUELLE = [
  './',
  'index.html',
  'style.css',
  'config.js',
  'hilfen.js',
  'app.js',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(HUELLE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((namen) => Promise.all(namen.filter((n) => n.startsWith('sate-huelle-') && n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  // Nur eigene GET-Anfragen aus dem Cache; alles andere (API, fremde Hosts) geht unverändert ans Netz.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith(caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((treffer) => {
    if (treffer) return treffer;
    return fetch(req).catch(() => (req.mode === 'navigate' ? c.match('./') : Response.error()));
  })));
});
