// Service Worker: hält die App-Hülle im Cache, damit die App schnell (und ohne Netz) startet.
// Die Schnittstelle (script.google.com, POST) läuft immer übers Netz, nie aus dem Cache.
// Nach JEDER Änderung an Dateien in docs/ VERSION hochzählen, sonst bleibt auf den iPhones die alte Fassung.
const VERSION = 'v44';
const CACHE = 'sate-huelle-' + VERSION;
const HUELLE = [
  './',
  'index.html',
  'style.css',
  'config.js',
  'hilfen.js',
  'kern.js',
  'ansichten.js',
  'eintragen.js',
  'aufgaben.js',
  'app.js',
  'gesten.js',
  'update.js',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'bilder/logo.png',
  'bilder/flasche.png',
  'bilder/herz.png',
  'bilder/pfeil.png',
  'bilder/auswahl.svg',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(HUELLE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((namen) => Promise.all(namen.filter((n) => n.startsWith('sate-huelle-') && n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

// Die App fragt nach einem Wechsel die Version ab (update.js: pro Version höchstens einmal automatisch neu laden)
self.addEventListener('message', (ev) => {
  if (ev.data === 'version' && ev.ports && ev.ports[0]) ev.ports[0].postMessage(VERSION);
});

// Mitteilungen (seit v44): Bekommt jemand eine Aufgabe, schickt die Schnittstelle eine Mitteilung ohne Inhalt; der
// Text steht deshalb hier fest. iOS verlangt, dass auf jede Mitteilung auch eine Anzeige folgt.
self.addEventListener('push', (ev) => {
  ev.waitUntil(self.registration.showNotification('SATE', {
    body: 'Neue Aufgabe für dich',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
  }));
});

// Tipp auf die Mitteilung: die offene App nach vorn holen und ihr Bescheid geben (sie lädt neu und zeigt den Start),
// sonst die App mit dem Start öffnen. Nur Fenster dieser App zählen: Unter derselben Adresse können andere Seiten
// liegen (Codex v44). Lässt sich das Fenster nicht nach vorn holen, wird die App geöffnet.
self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const oeffnen = () => self.clients.openWindow('./#aufgaben');
  ev.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenster) => {
    const bereich = self.registration.scope;
    const offen = fenster.find((f) => typeof f.url === 'string' && f.url.indexOf(bereich) === 0 && typeof f.focus === 'function');
    if (!offen) return oeffnen();
    offen.postMessage('aufgaben');
    return offen.focus().catch(oeffnen);
  }));
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
