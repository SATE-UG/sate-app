'use strict';

// Manifest, Geheimnis-Schutz (Sheet-ID nie im Git) und PWA-Dateien.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const WURZEL = path.join(__dirname, '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Apps-Script-Manifest: Berlin, V8, Web-App, nur Sheet lesen', () => {
  const m = JSON.parse(lies('api/src/appsscript.json'));
  assert.strictEqual(m.timeZone, 'Europe/Berlin');
  assert.strictEqual(m.runtimeVersion, 'V8');
  assert.deepStrictEqual(m.webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
  assert.deepStrictEqual(m.oauthScopes, ['https://www.googleapis.com/auth/spreadsheets.readonly']);
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
  assert.match(lies('docs/style.css'), /env\(safe-area-inset-top\)/, 'black-translucent braucht Abstand oben');
});

test('PWA: SATE-Look (immer schwarz, Courier New, Icons deckend)', () => {
  const h = lies('docs/index.html');
  const css = lies('docs/style.css');
  const m = JSON.parse(lies('docs/manifest.webmanifest'));
  assert.strictEqual(m.theme_color, '#000000');
  assert.strictEqual(m.background_color, '#000000');
  assert.match(h, /<meta name="theme-color" content="#000000">/);
  assert.match(h, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">/);
  assert.match(css, /font-family: "Courier New", Courier, monospace;/);
  assert.match(css, /color-scheme: dark;/);
  assert.doesNotMatch(css, /prefers-color-scheme/, 'kein Hell-Modus mehr');
  // Eingaben ≥ 16 px, sonst zoomt iOS
  const input = /\ninput \{([^}]*)\}/.exec(css)[1];
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
  for (const d of ['docs/index.html', 'docs/app.js', 'docs/hilfen.js', 'docs/sw.js', 'docs/config.js']) {
    const t = lies(d);
    const urls = t.match(/https?:\/\/[^\s"'`)\\]+/g) || [];
    for (const u of urls) assert.match(u, /^https:\/\/script\.google(usercontent)?\.com/, d + ': ' + u);
  }
  const app = lies('docs/app.js');
  assert.doesNotMatch(app, /[?&]code=/);
  assert.doesNotMatch(app, /innerHTML/);
  assert.match(app, /method: 'POST'/);
  assert.match(app, /'Content-Type': 'text\/plain;charset=utf-8'/);
  // Platzhalter oder echte Web-App-URL (die ist nicht geheim, geschützt wird über den Zugangscode)
  assert.match(lies('docs/config.js'),
    /apiUrl: '(HIER_WEB_APP_URL_EINTRAGEN|https:\/\/script\.google\.com\/(macros|a\/macros\/[\w.-]+)\/s\/[\w-]+\/exec)'/);
});
