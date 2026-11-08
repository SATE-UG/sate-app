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
  assert.match(lies('docs/style.css'), /prefers-color-scheme: dark/);
});

test('PWA: Service Worker cacht alle Hüllen-Dateien, Version im Cache-Namen', () => {
  const sw = lies('docs/sw.js');
  assert.match(sw, /const VERSION = 'v\d+';/);
  assert.match(sw, /const CACHE = 'sate-huelle-' \+ VERSION;/);
  const liste = JSON.parse(/const HUELLE = (\[[\s\S]*?\]);/.exec(sw)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const d of liste) if (d !== './') assert.ok(fs.existsSync(path.join(WURZEL, 'docs', d)), 'fehlt: ' + d);
  const verweise = (lies('docs/index.html').match(/(?:src|href)="([^"]+)"/g) || []).map((s) => s.replace(/^(src|href)="|"$/g, ''));
  for (const v of verweise) assert.ok(liste.includes(v), 'nicht im Cache: ' + v);
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
