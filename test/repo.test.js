'use strict';

// Manifest, Geheimnis-Schutz (Sheet-ID nie im Git) und PWA-Dateien.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const WURZEL = path.join(__dirname, '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Apps-Script-Manifest: Berlin, V8, Web-App, Sheet und Trigger', () => {
  const m = JSON.parse(lies('api/src/appsscript.json'));
  assert.strictEqual(m.timeZone, 'Europe/Berlin');
  assert.strictEqual(m.runtimeVersion, 'V8');
  assert.deepStrictEqual(m.webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
  assert.deepStrictEqual(m.oauthScopes,
    ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/script.scriptapp']);
});

test('clasp: rootDir api/src, Lokal.js wird gepusht, aber nie committet', () => {
  const c = JSON.parse(lies('.clasp.json'));
  assert.strictEqual(c.rootDir, 'api/src');
  assert.match(lies('.gitignore'), /^api\/src\/Lokal\.js$/m);
  if (fs.existsSync(path.join(WURZEL, '.claspignore'))) assert.doesNotMatch(lies('.claspignore'), /Lokal/);
  assert.match(lies('api/Lokal.example.js'), /const LOKAL_SHEET_ID = 'HIER_SHEET_ID_EINTRAGEN';/);
});

test('Sheet-ID aus Lokal.js steht in keiner Datei, die ins Git kommt', (t) => {
  const lokal = path.join(WURZEL, 'api', 'src', 'Lokal.js');
  if (!fs.existsSync(lokal)) return t.skip('keine Lokal.js');
  const m = /LOKAL_SHEET_ID\s*=\s*'([^']+)'/.exec(fs.readFileSync(lokal, 'utf8'));
  assert.ok(m, 'LOKAL_SHEET_ID in Lokal.js');
  let dateien;
  try {
    dateien = execFileSync('git', ['-C', WURZEL, 'ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch (e) {
    return t.skip('git nicht verfügbar');
  }
  assert.ok(!dateien.includes('api/src/Lokal.js'), 'Lokal.js wäre im Git');
  for (const d of dateien) {
    const p = path.join(WURZEL, d);
    if (fs.existsSync(p)) assert.ok(!fs.readFileSync(p).includes(m[1]), 'Sheet-ID steht in ' + d);
  }
});

/** Breite und Höhe aus dem PNG-Kopf (IHDR). */
function pngGroesse(datei) {
  const b = fs.readFileSync(path.join(WURZEL, datei));
  assert.strictEqual(b.toString('latin1', 1, 4), 'PNG', datei + ' ist kein PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

/** 8-Bit-RGBA-PNG (wie von werkzeuge/bilder.js) in Pixel entpacken: IDAT zusammensetzen, entpacken, Zeilenfilter rückgängig. */
function pngLesen(datei) {
  const b = fs.readFileSync(path.join(WURZEL, datei));
  const [breite, hoehe] = [b.readUInt32BE(16), b.readUInt32BE(20)];
  assert.deepStrictEqual([b[24], b[25], b[28]], [8, 6, 0], datei + ': erwartet 8 Bit RGBA ohne Interlace');
  const teile = [];
  for (let o = 8; o < b.length;) {
    const laenge = b.readUInt32BE(o);
    if (b.toString('latin1', o + 4, o + 8) === 'IDAT') teile.push(b.subarray(o + 8, o + 8 + laenge));
    o += 12 + laenge;
  }
  const roh = require('node:zlib').inflateSync(Buffer.concat(teile));
  const z = breite * 4;
  const pixel = Buffer.alloc(z * hoehe);
  for (let y = 0; y < hoehe; y++) {
    const filter = roh[y * (z + 1)];
    for (let x = 0; x < z; x++) {
      const w = roh[y * (z + 1) + 1 + x];
      const a = x >= 4 ? pixel[y * z + x - 4] : 0;
      const o = y > 0 ? pixel[(y - 1) * z + x] : 0;
      const c = x >= 4 && y > 0 ? pixel[(y - 1) * z + x - 4] : 0;
      const p = a + o - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - o) && Math.abs(p - a) <= Math.abs(p - c) ? a : (Math.abs(p - o) <= Math.abs(p - c) ? o : c);
      const vor = [0, a, o, (a + o) >> 1, paeth][filter];
      assert.ok(vor !== undefined, datei + ': unbekannter Filter ' + filter);
      pixel[y * z + x] = (w + vor) & 255;
    }
  }
  return { breite, hoehe, pixel };
}

test('PWA: Manifest und Icons', () => {
  const m = JSON.parse(lies('docs/manifest.webmanifest'));
  assert.strictEqual(m.name, 'SATE');
  assert.strictEqual(m.short_name, 'SATE');
  assert.strictEqual(m.display, 'standalone');
  assert.strictEqual(m.start_url, './');
  assert.strictEqual(m.scope, './');
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  for (const i of m.icons) {
    const [b, h] = pngGroesse('docs/' + i.src);
    assert.strictEqual(i.sizes, b + 'x' + h);
  }
  assert.deepStrictEqual(m.icons.map((i) => i.sizes).sort(), ['192x192', '512x512']);
  assert.deepStrictEqual(pngGroesse('docs/icons/apple-touch-icon.png'), [180, 180]);
});

test('PWA: iOS-Kopfzeilen in index.html', () => {
  const h = lies('docs/index.html');
  assert.match(h, /<meta name="viewport" content="[^"]*viewport-fit=cover/);
  assert.match(h, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(h, /<meta name="apple-mobile-web-app-title" content="SATE">/);
  assert.match(h, /<link rel="apple-touch-icon" sizes="180x180" href="icons\/apple-touch-icon.png">/);
  assert.match(h, /<link rel="manifest" href="manifest.webmanifest">/);
  assert.match(lies('docs/style.css'), /env\(safe-area-inset-bottom\)/);
  assert.match(lies('docs/style.css'), /env\(safe-area-inset-top\)/, 'Abstand oben (Notch im Querformat, ältere Installationen)');
});

test('PWA: SATE-Look (schwarz, Systemschrift, Courier New als Akzent, eine Akzentfarbe, Icons deckend)', () => {
  const h = lies('docs/index.html');
  const css = lies('docs/style.css');
  const m = JSON.parse(lies('docs/manifest.webmanifest'));
  assert.strictEqual(m.theme_color, '#000000');
  assert.strictEqual(m.background_color, '#000000');
  assert.match(h, /<meta name="theme-color" content="#000000">/);
  // deckend schwarz: black-translucent lässt unter iOS 26 unten einen Streifen frei (Mark 2026-11-08)
  assert.match(h, /<meta name="apple-mobile-web-app-status-bar-style" content="black">/);
  assert.match(css, /font-family: "Courier New", Courier, monospace;/, 'Courier New bleibt für die Überschriften');
  const body = /\nbody \{([^}]*)\}/.exec(css)[1];
  assert.match(body, /font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;/, 'Fließtext in Systemschrift');
  assert.match(css, /--akzent: #E8C547;/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
  assert.match(css, /backdrop-filter: saturate\(180%\) blur\(20px\)/, 'Reiterleiste durchscheinend');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, 'Bewegung abschaltbar');
  assert.doesNotMatch(css, /border: 2px solid var\(--weiss\)/, 'keine weiß umrandeten Kästen mehr');
  // Reiter mit Symbol und Text
  for (const r of ['uebersicht', 'verkaeufe', 'lager', 'eintragen']) {
    assert.match(h, new RegExp('<button id="reiter-' + r + '"[^>]*>\\s*<svg class="icon"[^>]*aria-hidden="true"'), 'Symbol im Reiter ' + r);
  }
  assert.match(css, /color-scheme: dark;/);
  assert.doesNotMatch(css, /prefers-color-scheme/, 'kein Hell-Modus mehr');
  // Eingaben ≥ 16 px, sonst zoomt iOS
  const input = /\ninput, select, textarea \{([^}]*)\}/.exec(css)[1];
  assert.ok(Number(/font-size: (\d+)px/.exec(input)[1]) >= 16);
  // Icons ohne Transparenz (iOS füllt durchsichtige Flächen sonst unschön auf), Ecken schwarz
  for (const d of ['docs/icons/apple-touch-icon.png', 'docs/icons/icon-192.png', 'docs/icons/icon-512.png']) {
    const { breite, pixel } = pngLesen(d);
    for (let i = 3; i < pixel.length; i += 4) assert.strictEqual(pixel[i], 255, d + ': durchsichtiges Pixel');
    assert.deepStrictEqual([...pixel.subarray(0, 3)], [0, 0, 0], d + ': Ecke nicht schwarz');
    assert.ok(pixel.some((w, i) => i % 4 !== 3 && w > 200), d + ': kein weißes Motiv');
    assert.ok(breite > 0);
  }
  for (const d of ['logo', 'flasche', 'herz', 'pfeil']) {
    const datei = 'docs/bilder/' + d + '.png';
    const [b, hoehe] = pngGroesse(datei);
    assert.ok(b <= 600 && hoehe <= 200, datei + ' zu groß: ' + b + 'x' + hoehe);
    assert.ok(fs.statSync(path.join(WURZEL, datei)).size < 50000, datei + ' Datei zu groß');
  }
});

test('PWA: Service Worker cacht alle Hüllen-Dateien, Version im Cache-Namen', () => {
  const sw = lies('docs/sw.js');
  assert.match(sw, /const VERSION = 'v\d+';/);
  assert.match(sw, /const CACHE = 'sate-huelle-' \+ VERSION;/);
  const liste = JSON.parse(/const HUELLE = (\[[\s\S]*?\]);/.exec(sw)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const d of liste) if (d !== './') assert.ok(fs.existsSync(path.join(WURZEL, 'docs', d)), 'fehlt: ' + d);
  const verweise = (lies('docs/index.html').match(/(?:src|href)="([^"]+)"/g) || []).map((s) => s.replace(/^(src|href)="|"$/g, ''));
  for (const v of verweise) assert.ok(liste.includes(v), 'nicht im Cache: ' + v);
  const cssBilder = (lies('docs/style.css').match(/url\('([^']+)'\)/g) || []).map((s) => s.replace(/^url\('|'\)$/g, ''));
  for (const v of cssBilder) assert.ok(liste.includes(v), 'CSS-Bild nicht im Cache: ' + v);
  assert.match(sw, /req\.method !== 'GET'/);
});

test('PWA: keine fremden Skripte, Code nie in URLs', () => {
  const skripte = ['docs/app.js', 'docs/kern.js', 'docs/ansichten.js', 'docs/eintragen.js', 'docs/hilfen.js', 'docs/sw.js', 'docs/config.js',
    'docs/gesten.js', 'docs/update.js'];
  for (const d of ['docs/index.html'].concat(skripte)) {
    const t = lies(d);
    const urls = t.match(/https?:\/\/[^\s"'`)\\]+/g) || [];
    // Einzige Ausnahme: der SVG-Namensraum (nur ein Name, wird nie geladen)
    for (const u of urls) if (u !== 'http://www.w3.org/2000/svg') assert.match(u, /^https:\/\/script\.google(usercontent)?\.com/, d + ': ' + u);
  }
  // Alle Skripte aus index.html stehen in der Liste oben
  const eingebunden = (lies('docs/index.html').match(/<script src="([^"]+)"/g) || []).map((s) => 'docs/' + /"([^"]+)"/.exec(s)[1]);
  for (const d of eingebunden) assert.ok(skripte.includes(d), 'Skript nicht geprüft: ' + d);
  for (const d of skripte) {
    assert.doesNotMatch(lies(d), /[?&]code=/, d);
    assert.doesNotMatch(lies(d), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/, d);
  }
  const kern = lies('docs/kern.js');
  assert.match(kern, /method: 'POST'/);
  assert.match(kern, /'Content-Type': 'text\/plain;charset=utf-8'/);
  assert.match(kern, /credentials: 'omit'/);
  // Platzhalter oder echte Web-App-URL (die ist nicht geheim, geschützt wird über den Zugangscode)
  assert.match(lies('docs/config.js'),
    /apiUrl: '(HIER_WEB_APP_URL_EINTRAGEN|https:\/\/script\.google\.com\/(macros|a\/macros\/[\w.-]+)\/s\/[\w-]+\/exec)'/);
});

test('PWA: Reiter per nativem Scroll Snap, Ziehen blockiert nie das Scrollen, kein Zoomen', () => {
  const gesten = lies('docs/gesten.js');
  const touch = gesten.match(/addEventListener\('touch\w+',[\s\S]*?\}, \{ passive: true \}\)|addEventListener\('touch\w+', \w+, \{ passive: true \}\)/g) || [];
  const alle = gesten.match(/addEventListener\('touch\w+'/g) || [];
  assert.strictEqual(alle.length, 4, 'touchstart, touchmove, touchend, touchcancel');
  assert.strictEqual(touch.length, alle.length, 'alle Touch-Listener passiv');
  // preventDefault nur für die Safari-Zoom-Gesten, nie für Touch-Ereignisse (Scrollen bleibt frei)
  assert.strictEqual((gesten.match(/preventDefault/g) || []).length, 1);
  assert.match(gesten, /\['gesturestart', 'gesturechange', 'gestureend'\][\s\S]*?ev\.preventDefault\(\), \{ passive: false \}/);
  assert.doesNotMatch(gesten, /wischRichtung|wischenZeigen|ansichtZeigen|translate3d\(' \+ weg/, 'keine eigene Wischlogik mehr');

  const html = lies('docs/index.html');
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"/);
  assert.match(html, /<div id="ansichten" class="ansichten">/);
  assert.doesNotMatch(html, /class="ansicht"[^>]*hidden/, 'alle Ansichten liegen sichtbar nebeneinander');

  const css = lies('docs/style.css');
  const regel = (sel) => { const m = new RegExp('\\n' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}').exec(css); assert.ok(m, sel); return m[1]; };
  const leiste = regel('.ansichten');
  for (const d of ['overflow-x: auto;', 'scroll-snap-type: x mandatory;', 'overscroll-behavior-x: contain;', 'scrollbar-width: none;', 'touch-action: pan-x pan-y;']) {
    assert.ok(leiste.includes(d), '.ansichten: ' + d);
  }
  assert.match(css, /\.ansichten::-webkit-scrollbar \{ display: none;/);
  const ansicht = regel('.ansicht');
  for (const d of ['flex: 0 0 100%;', 'overflow-y: auto;', '-webkit-overflow-scrolling: touch;', 'scroll-snap-align: start;', 'scroll-snap-stop: always;',
    'env(safe-area-inset-bottom)', 'touch-action: pan-x pan-y;']) {
    assert.ok(ansicht.includes(d), '.ansicht: ' + d);
  }
  assert.doesNotMatch(css, /pan-y pinch-zoom|rein-von-rechts/, 'alte Wischlogik ist raus');
  assert.match(regel('html'), /overscroll-behavior: none;[\s\S]*touch-action: pan-x pan-y;/);
  assert.match(css, /\.diagramm \{[^}]*touch-action: manipulation;/, 'Diagramm: Tippen bleibt Tippen, waagerecht scrollt die Leiste');
  assert.match(css, /user-select: none;/);
  for (const sel of ['.knopf:active', '.rund:active', '.leiste button:active', '.art:active .art-kachel', '.segment button:active']) {
    assert.ok(css.includes(sel + ' {'), sel);
  }
  // Eingabefelder ≥ 16 px, sonst zoomt iOS beim Fokus trotzdem
  for (const m of css.matchAll(/\n(input, select, textarea|\.zuordnen select|#code) \{([^}]*)\}/g)) {
    const px = /font-size: (\d+)px/.exec(m[2]);
    if (px) assert.ok(Number(px[1]) >= 16, m[1]);
  }

  const app = lies('docs/app.js');
  assert.match(app, /scrollTo\(\{ left: links, behavior: 'smooth' \}\)/);
  assert.match(app, /prefers-reduced-motion: reduce/);
  assert.match(app, /'scrollend'/);
  assert.match(app, /\.inert = n !== a/);
  assert.doesNotMatch(app + lies('docs/eintragen.js'), /window\.scrollTo/, 'die Seite selbst scrollt nicht mehr');
});

test('PWA: automatisches Update – Service Worker nennt seine Version, App sucht beim Start und Zurückkehren', () => {
  const sw = lies('docs/sw.js');
  assert.match(sw, /addEventListener\('message'[\s\S]*?ev\.data === 'version'[\s\S]*?postMessage\(VERSION\)/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
  const up = lies('docs/update.js');
  assert.match(up, /'controllerchange'/);
  assert.match(up, /'visibilitychange'/);
  assert.match(up, /\.update\(\)/);
  assert.match(lies('docs/index.html'), /<button id="update" type="button" class="banner update-banner" hidden>/);
  assert.doesNotMatch(lies('docs/app.js'), /serviceWorker/, 'Registrierung nur noch in update.js');
});
