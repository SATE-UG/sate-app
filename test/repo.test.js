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
  // Seit v28: helles Blau als Akzent (nur Antippbares, Auswahl, Diagramm), Orange nur als Warnfarbe, kein Gelb mehr
  assert.match(css, /--akzent: #5EB5FF;/);
  assert.match(css, /--warn: #FFB340;/);
  assert.doesNotMatch(css + lies('docs/ansichten.js'), /E8C547|232, 197, 71/i, 'kein Gelb mehr fest im Code');
  assert.match(css, /font-variant-numeric: tabular-nums/);
  // Glas (Leiste, Rückmeldung, Rückfrage): Unschärfe ausgeschrieben, Safari nimmt -webkit-backdrop-filter nicht aus einer Variable
  assert.match(css, /\n\.leiste \{[^}]*-webkit-backdrop-filter: saturate\(180%\) blur\(22px\);\s*backdrop-filter: saturate\(180%\) blur\(22px\);/, 'Reiterleiste als Glas');
  assert.doesNotMatch(css, /backdrop-filter: var\(/, 'keine Variable im backdrop-filter');
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/, 'Glas abschaltbar');
  assert.match(h, /<span class="leiste-pille" aria-hidden="true"><\/span>/, 'Pille hinter dem gewählten Reiter');
  // Kleiner Titel im Kopf (nur Zierde, Vorleser haben die Überschrift), Rückfrage mit Titel und Erklärung
  assert.match(h, /<p id="kopf-titel" class="kopf-titel" aria-hidden="true"><\/p>/);
  assert.match(h, /<dialog id="dialog" class="dialog" aria-labelledby="dialog-titel" aria-describedby="dialog-text">\s*<h2 id="dialog-titel" class="dialog-titel" tabindex="-1"><\/h2>\s*<p id="dialog-text" tabindex="-1"><\/p>/);
  // Blatt: Bewegung per Web Animations (kein CSS-Keyframe mehr), Schließen auch per Escape mit Bewegung
  const kern = lies('docs/kern.js');
  assert.doesNotMatch(css, /blatt-hoch/);
  assert.match(kern, /S\.el\('blatt'\)\.addEventListener\('cancel', \(ev\) => \{ ev\.preventDefault\(\); S\.blattSchliessen\(\); \}\);/);
  assert.match(kern, /if \(ruhig\(\) \|\| typeof b\.animate !== 'function'\) \{ if \(fertig\) fertig\(\); return; \}/, 'ohne Bewegung bei „Bewegung reduzieren“');
  // Pfeile sind gezeichnet, kein Schriftzeichen
  assert.doesNotMatch(lies('docs/ansichten.js'), /text: '[›‹]'/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, 'Bewegung abschaltbar');
  assert.doesNotMatch(css, /border: 2px solid var\(--weiss\)/, 'keine weiß umrandeten Kästen mehr');
  // Reiter mit Symbol und Text
  for (const r of ['uebersicht', 'verkaeufe', 'eintragen', 'kunden', 'lager']) {
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
  // Bilder aus dem Stil (mit oder ohne Anführungszeichen) müssen auch im Cache liegen, sonst fehlen sie offline
  const cssBilder = [...lies('docs/style.css').matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g)].map((m) => m[1]).filter((v) => v.charAt(0) !== '#');
  assert.ok(cssBilder.includes('bilder/auswahl.svg'), 'Auswahl-Pfeil wird im Stil benutzt');
  for (const v of cssBilder) assert.ok(liste.includes(v), 'CSS-Bild nicht im Cache: ' + v);
  assert.match(sw, /req\.method !== 'GET'/);
});

test('PWA: keine fremden Skripte, Code nie in URLs', () => {
  const skripte = ['docs/app.js', 'docs/kern.js', 'docs/ansichten.js', 'docs/eintragen.js', 'docs/aufgaben.js', 'docs/hilfen.js', 'docs/sw.js', 'docs/config.js',
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
  // Je Touch-Listener: wer hört auf was, und ist er passiv? (die erste passive-Angabe nach dem addEventListener)
  const alle = [...gesten.matchAll(/(\w+)\.addEventListener\('(touch\w+)'/g)].map((m) => {
    const p = /\{ passive: (true|false) \}/.exec(gesten.slice(m.index));
    return { wer: m[1], was: m[2], passiv: !!p && p[1] === 'true' };
  });
  const touch = alle.filter((x) => x.passiv);
  // Ansichten: touchstart, touchmove, touchend, touchcancel, alle passiv. Blatt (seit v28): dieselben vier, nur sein
  // touchmove ist nicht passiv, weil der Finger das Blatt festhält (nach unten ziehen schließt).
  assert.strictEqual(alle.length, 8, 'je vier für die Ansichten und für das Blatt');
  assert.strictEqual(touch.length, 7, 'alle Touch-Listener passiv außer dem Ziehen am Blatt');
  assert.deepStrictEqual(alle.filter((x) => !x.passiv), [{ wer: 'blatt', was: 'touchmove', passiv: false }]);
  assert.strictEqual(alle.filter((x) => x.wer === 'leiste').length, 4);
  // preventDefault nur beim Ziehen am Blatt und für die Safari-Zoom-Gesten, nie beim Scrollen der Ansichten
  assert.strictEqual((gesten.match(/preventDefault/g) || []).length, 2);
  const ansichtenTeil = gesten.slice(0, gesten.indexOf('// Blatt: nach unten ziehen'));
  assert.doesNotMatch(ansichtenTeil, /preventDefault/, 'Ziehen zum Aktualisieren blockiert nie das Scrollen');
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
    'var(--leiste)', 'touch-action: pan-x pan-y;']) {
    assert.ok(ansicht.includes(d), '.ansicht: ' + d);
  }
  // Platz unter dem Inhalt = Höhe der schwebenden Leiste plus ihr Abstand über der Home-Leiste (Safe Area)
  assert.match(css, /--unten: max\(calc\(env\(safe-area-inset-bottom\) - 14px\), 10px\);\s*--leiste: calc\(var\(--leiste-h\) \+ var\(--unten\)\);/);
  assert.doesNotMatch(css, /pan-y pinch-zoom|rein-von-rechts/, 'alte Wischlogik ist raus');
  assert.match(regel('html'), /overscroll-behavior: none;[\s\S]*touch-action: pan-x pan-y;/);
  assert.match(css, /\.diagramm \{[^}]*touch-action: manipulation;/, 'Diagramm: Tippen bleibt Tippen, waagerecht scrollt die Leiste');
  assert.match(css, /user-select: none;/);
  // Drücken (seit v28): gesten.js setzt .gedrueckt (auch bei kurzem Tipp sichtbar, beim Scrollen sofort weg), kein :active mehr
  for (const sel of ['.knopf.gedrueckt', '.rund.gedrueckt', '.leiste button.gedrueckt .icon', '.art.gedrueckt .art-kachel', '.segment button.gedrueckt', '.zeilen-knopf.gedrueckt']) {
    assert.ok(css.includes(sel + ' {'), sel);
  }
  assert.doesNotMatch(css, /:active/, 'kein :active mehr, alles über .gedrueckt');
  assert.match(gesten, /const DRUCK_ZIELE = 'button, label\.art';/);
  for (const art of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
    assert.match(gesten, new RegExp("document\\.addEventListener\\('" + art + "',[\\s\\S]*?\\{ passive: true \\}\\)"), art);
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

test('PWA: Mehr Zahlen (früher Dashboard, v30 bis v35) – dichte Tabellen und Listen, gerechnet in hilfen.js, Darstellung in ansichten.js', () => {
  const html = lies('docs/index.html');
  const css = lies('docs/style.css');
  const ansichten = lies('docs/ansichten.js');
  // Seit v36 gibt es kein eigenes Dashboard mehr: keine Karte oben auf dem Start (v31 bis v35), keine Kapsel neben dem Datum (v30)
  assert.match(html, /<p id="datum-zeile" class="datum-zeile"><\/p>\s*<div id="uebersicht-inhalt"><\/div>/);
  assert.doesNotMatch(html + css + lies('docs/app.js'), /kapsel-knopf|gruss-zeile/);
  assert.doesNotMatch(ansichten + css + html + lies('docs/app.js'), /dashboard-knopf|dashboardEinstieg|dash-einstieg|dashboardZeigen|dashboardAuffrischen|S\.blattZeigen\('Dashboard'/);
  assert.match(ansichten, /S\.fuellen\(ziel,\s*typeof S\.aufgabenStart === 'function' \? S\.aufgabenStart\(\) : null,\s*bestellKarte\(u, a\),\s*inventurHinweis\(u, a\.heute\),\s*jahrStart\(a\),\s*imBlick\(u, a\),/);
  // Gerechnet wird in hilfen.js, einmal pro Antwort (zahlenDaten)
  assert.match(ansichten, /const d = H\.dashboardDaten\(a\.zeilen, a\.werte, a\.jv, a\.heute\);/);
  // Neuer Stand bei offenem Zahlen-Blatt: Inhalt wird an Ort und Stelle neu gebaut (Codex v30)
  assert.match(ansichten, /S\.zahlenAuffrischen = function/);
  assert.match(lies('docs/app.js'), /S\.renderAlle = function \(\) \{[\s\S]{0,200}S\.zahlenAuffrischen\(\);/);
  const dash = css.slice(css.indexOf('/* Dashboard (Blatt, seit v30)'), css.indexOf('/* Trends (Verkäufe, Kunden, Start)'));
  assert.ok(dash.length > 500);
  assert.doesNotMatch(dash, /!important/);
  assert.match(dash, /\.dash-s5 \.dash-zeile \{ grid-template-columns: minmax\(0, 1fr\) 52px 50px 68px 50px; \}/);
  assert.match(dash, /@media \(max-width: 350px\) \{[\s\S]*\.dash-s5 \.dash-zeile > :last-child, \.dash-kan \.dash-zeile > :last-child \{ display: none; \}/);
  // Seit v31: viele weitere Abschnitte zum Runterscrollen, jede Tabellenart hat ihre Spalten, Gruppen als Überschriften
  assert.match(ansichten, /H\.dashboardMehr\(a\.zeilen, a\.werte, a\.heute, u\.kennzahlen\.flaschenProKiste, u\.abfuellungen, lagerStand\)/);
  const arten = Array.from(new Set(Array.from(ansichten.matchAll(/dashTabelle\('([a-z0-9]+)/g), (m) => m[1])));
  assert.deepStrictEqual(arten.sort(), ['abf', 'bleibt', 'gr', 'jahre', 'kan', 'lager', 'lief', 'preis', 'roh', 'rohabf', 'rohkan', 's5', 'top', 'treppe', 'vj', 'weg']);
  arten.forEach((art) => assert.match(dash, new RegExp('\\.dash-' + art + ' \\.dash-zeile \\{ grid-template-columns: '), art));
  // Jede Gruppe ist ein Thema für sich (Überblick, fünf Gruppen, Rohertrag und Marge, Ohne Verkauf weg), jedes hat seinen Titel
  const themen = Array.from(ansichten.matchAll(/seite\('([a-z]+)', '/g), (m) => m[1]);
  assert.deepStrictEqual(themen, ['ueberblick', 'vergleich', 'rohertrag', 'abgaenge', 'gewinn', 'bestellungen', 'kunden', 'bestand', 'rekorde']);
  const titel = /const ZAHLEN_TITEL = \{([^}]*)\};/.exec(ansichten)[1];
  assert.deepStrictEqual(Array.from(titel.matchAll(/([a-z]+): '/g), (m) => m[1]).sort(), themen.slice().sort());
  // Seit v33: Was ohne Verkauf wegging, ist nicht „neutral“, sondern steht mit seinen Herstellkosten in einer eigenen Statistik
  assert.doesNotMatch(ansichten + lies('docs/hilfen.js'), /neutral zum Herstellpreis/);
  assert.match(ansichten, /dashTitel\('Was vom Rohertrag bleibt'/);
  assert.match(ansichten, /dashTitel\('Flaschen-Abgleich'/);
  // Die Marge bezieht sich nur auf verkaufte Flaschen (Mark, 2026-11-10): nach den Abgängen gibt es keinen Prozentwert
  assert.doesNotMatch(ansichten, /nj\.marge|nach\.[a-z]+\.marge|Rohertrag nach Abgängen/);
  assert.doesNotMatch(lies('docs/hilfen.js'), /marge: bleibt/);
  // Seit v34: dasselbe je Abfüllung (Marge nur aus ihren verkauften Flaschen, „bleibt“ nur in Euro), und die alte Lücke
  // steht für sich: Sie zählt zu keinem Jahr und keiner Abfüllung
  assert.match(ansichten, /dashTitel\('Rohertrag je Abfüllung', 'nur verkaufte Flaschen'\)/);
  assert.match(ansichten, /dashTitel\('Was je Abfüllung bleibt'/);
  assert.match(ansichten, /dashTitel\('Wohin die Flaschen gingen'/);
  assert.match(ansichten, /const lueckeName = \(flaschen\) => \(flaschen < 0 \? 'Altes Plus' : 'Alte Lücke'\);/);
  assert.match(lies('docs/hilfen.js'), /art: x\[2\] === '' \? 'Lücke' : 'Schwund'/);
  // Herstellkosten (v32): je Abfüllung aus dem Sheet (Spalte E im Tab Abfüllungen), verteilt nach First in, First out.
  // Im öffentlichen Repo steht keine Kostenzahl: nur der Spaltenkopf, das Eingabefeld und die Rechnung.
  const konfig = lies('api/src/Konfig.js');
  assert.match(konfig, /const AB = \{ NAME: 0, MONAT: 1, FLASCHEN: 2, QUELLE: 3, KOSTEN: 4 \};/);
  assert.match(konfig, /const AB_KOSTEN_KOPF = 'Kosten\/Fl \(€\)';/);
  assert.match(lies('docs/hilfen.js'), /function fifoSchichten\(abfuellungen\)[\s\S]*function fifoKosten\(zeilen, schichten, abgaenge, heute\)/);
  // Eingabe: Feld nur bei einer Abfüllung sichtbar, gesendet nur mit Wert
  assert.match(html, /<div class="feld" id="b-kosten-feld" hidden>\s*<label for="b-kosten" class="feld-label">Herstellkosten pro Flasche in Euro/);
  assert.match(html, /<input id="b-kosten" type="text" inputmode="decimal" autocomplete="off"/);
  const eintragen = lies('docs/eintragen.js');
  assert.match(eintragen, /S\.el\('b-kosten-feld'\)\.hidden = art\(\) !== 'Abfüllung' \|\| !kostenMoeglich\(\);/);
  assert.match(eintragen, /const kostenMoeglich = \(\) => !!\(Z\.daten && Z\.daten\.kennzahlen\.abfuellungKosten === true\);/, 'ohne Kosten-Spalte kein Feld');
  assert.match(eintragen, /if \(b\.art === 'Abfüllung' && b\.kosten !== null\) daten\.kostenProFlasche = b\.kosten;/);
  assert.match(dash, /\.dash-zeile \{[^}]*min-height: 27px;/);
  assert.doesNotMatch(dash, /var\(--akzent\)/, 'in den Zahlen-Blättern ist nichts antippbar, also keine Akzentfarbe');
});

test('PWA: Start als Zusammenfassung (v37, seit v43 als Zeilen ohne Kacheln) – Aufgaben, Bestelltermin, „Dieses Jahr“ in Euro mit Verlauf, „Im Blick“', () => {
  const css = lies('docs/style.css');
  const ansichten = lies('docs/ansichten.js');
  // Reihenfolge: die eigenen Aufgaben (aufgaben.js, nur mit dem Tab im Sheet), Bestell-Karte (Mark: gut so), im
  // Dezember/Januar die Jahresinventur, „Dieses Jahr“ als Zeilen, „Im Blick“ als Liste (Bestand, Kunden, seit v41 die
  // offenen Rechnungen aus Lexware), „Zuletzt passiert“
  assert.match(ansichten, /S\.fuellen\(ziel,\s*typeof S\.aufgabenStart === 'function' \? S\.aufgabenStart\(\) : null,\s*bestellKarte\(u, a\),\s*inventurHinweis\(u, a\.heute\),\s*jahrStart\(a\),\s*imBlick\(u, a\),\s*h\('div', \{ id: 'aktivitaet-inhalt' \}\),/);
  // Zeile „Dieses Jahr“: links klein der Name, groß die Zahl (zählt beim ersten Erscheinen hoch), darunter eine Zeile,
  // rechts der Verlauf; die ganze Zeile ist ein Knopf in die Zahlen mit ihrer Kennzahl
  assert.match(ansichten, /return h\('li', \{ class: 'kunde-zeile jz' \}, h\('button', \{ type: 'button', class: 'zeilen-knopf', 'data-start': o\.schluessel, onclick: o\.beiTipp, 'aria-label': o\.vorlesen \},/);
  assert.match(ansichten, /zahlDa\(o\.zahl\) \? zaehl\(o\.zahl, o\.stellen \|\| 0\) : '–'/);
  assert.match(ansichten, /const zuV = \(kennzahlWahl\) => \(\) => zuVerkaeufen\(null, kennzahlWahl, jv\.jahr\);/);
  assert.match(ansichten, /jahrZeile\(\{ schluessel: 'umsatz', titel: 'Umsatz', zahl: umsatz, einheit: '€', unter: trend\(pUmsatz, vjHinweis \|\| wann\),\s*bild: funkenBalken\(reihe\('umsatz'\), li\), beiTipp: zuV\('umsatz'\),/);
  assert.match(ansichten, /jahrZeile\(\{ schluessel: 'flaschen', titel: 'Flaschen', zahl: jv\.bisher\.flaschen, unter: trend\(pFlaschen, wann\),\s*bild: funkenBalken\(reihe\('flaschen'\), li\), beiTipp: zuV\('flaschen'\),/);
  assert.match(ansichten, /h\('div', \{ class: 'karte liste-karte' \}, h\('ul', \{ class: 'liste jahr-liste', role: 'list' \}, zeilen\)\),/);
  // Anfang Januar ohne Verkäufe im neuen Jahr: die Zeilen zeigen das Jahr davor (dasselbe Jahr wie die Zahlen), keine Nullen
  assert.match(ansichten, /const jv = !hat\(a\.jv\) && hat\(a\.jvVorjahr\) \? a\.jvVorjahr : a\.jv;/);
  assert.match(ansichten, /const passt = !!x && x\.jahr === jv\.jahr;\s*const j = passt \? x\.summe : laeuft && mg \? mg\.jahr : null;/);
  assert.match(ansichten, /const pUmsatz = vg \? H\.veraenderung\(vg\.dieses\.umsatz, vg\.vorjahr\.umsatz\) : null;/);
  // Verlauf als kleine Balken: laufender Monat in der Akzentfarbe, Leeres als Strich, ein Monat im Minus rot (Codex v37)
  assert.match(ansichten, /class: minus \? 'jb-minus' : !\(plus\[i\] > 0\) \? 'jb-leer' : i === laufend \? 'jb-laufend' : 'jb-monat' \}\)\);/);
  assert.match(css, /\.funken \.jb-minus \{ fill: var\(--rot\); \}/);
  assert.match(css, /\.funken \.jb-laufend \{ fill: var\(--akzent\); \}/);
  // Rohertrag mit der Marge in der Zeile darunter; der Vergleich läuft über dieselben vollen Monate wie in den Zahlen
  // (H.auswerten). Fehlen die Herstellkosten nur zum Teil, bleibt die Zeile mit Strich und Hinweis (Codex v37)
  assert.match(ansichten, /H\.auswerten\(a\.zeilen, mg\.kostenJeZeile, a\.heute, \{ kennzahl: 'rohertrag', jahr: jv\.jahr, nach: 'kanal' \}\)/);
  assert.match(ansichten, /mg && j \? jahrZeile\(\{ schluessel: 'rohertrag', titel: 'Rohertrag', zahl: zahlDa\(j\.rohertrag\) \? j\.rohertrag : null, einheit: '€',/);
  assert.match(ansichten, /unter: zahlDa\(j\.rohertrag\) \? \(zahlDa\(j\.marge\) \? 'Marge ' \+ H\.zahlFormat\(j\.marge, 1\) \+ ' %' : wann\) : 'Kosten fehlen',/);
  assert.match(ansichten, /beiTipp: zuV\('rohertrag'\),/);
  // Ohne Herstellkosten: Flaschen und Umsatz pro Flasche
  assert.match(ansichten, /!\(mg && j\) \? jahrZeile\(\{ schluessel: 'proflasche', titel: 'Pro Flasche',/);
  // Der Vorjahreshinweis im Januar steht sichtbar da und im Namen des Knopfs (Codex v37)
  assert.match(ansichten, /\+ mitTrend\(pUmsatz\) \+ \(pUmsatz === null && vjHinweis \? ', ' \+ vjHinweis : ''\)/);
  assert.match(ansichten, /vorlesen: 'Umsatz ' \+ wann \+ ' ' \+ H\.euroFormat\(umsatz\) \+ mitTrend\(pUmsatz\)/);
  // „Im Blick“: Bestand (öffnet das Lager) und Kunden (öffnet die Kunden) als Zeilen einer Liste
  assert.match(ansichten, /blickZeile\(\{ schluessel: 'bestand', symbol: 'flasche', titel: 'Bestand', unter: lagerText, wert: H\.zahlFormat\(k\.gesamtbestand, 0\) \+ ' Fl\.',\s*beiTipp: \(\) => \{ S\.ansichtZeigen\('lager'\); S\.nachOben\('lager'\); \},/);
  assert.match(ansichten, /blickZeile\(\{ schluessel: 'kunden', symbol: 'kunden', titel: 'Kunden', unter: teile\.join\(', '\) \|\| 'dieses Jahr', wert: H\.zahlFormat\(n, 0\),\s*beiTipp: \(\) => \{ S\.ansichtZeigen\('kunden'\); S\.nachOben\('kunden'\); \},/);
  assert.match(ansichten, /return \[h\('h2', \{\}, h\('strong', \{ text: 'Im' \}\), ' Blick'\), h\('div', \{ class: 'karte liste-karte' \}, h\('ul', \{ class: 'liste', role: 'list' \}, zeilen\)\)\];/);
  // Der alte Aufbau ist weg: keine Jahr-Karte mit Kopf und Kacheln, keine Kennzahl-Karten, keine Kacheln für Bestand und Kunden
  assert.doesNotMatch(ansichten + css, /jahr-start|jahr-balken|kachel-tipp|kpi-raster|kpiKarte|\.kpi\b/);
  assert.doesNotMatch(ansichten, /function kennzahlen\(|function kennzahl\(|function verteilungMini\(|offenStart\(|rohertragHinweis|kundenHinweis|mitUmsatz|umsatzDazu/);
  assert.match(css, /\.jz-wert \{[^}]*font-variant-numeric: tabular-nums;/);
});

test('PWA: App im Ganzen geordnet (v36) – Wahl oben in den Verkäufen, je Thema eine Zeile im passenden Reiter, kein eigenes Dashboard', () => {
  const css = lies('docs/style.css');
  const ansichten = lies('docs/ansichten.js');
  const kern = lies('docs/kern.js');
  const app = lies('docs/app.js');
  const dash = css.slice(css.indexOf('/* Dashboard (Blatt, seit v30)'), css.indexOf('/* Trends (Verkäufe, Kunden, Start)'));
  // Zahlen (bis v42 „Verkäufe“): oben die Wahl (Kennzahl, seit v43 mit Gewinn als vierter; Zeitraum; Kanal) …
  assert.match(ansichten, /umschalter\('Kennzahl', \[\['flaschen', 'Flaschen'\], \['umsatz', 'Umsatz'\]\]\.concat\(x\.mitKosten \? \[\['rohertrag', 'Rohertrag'\], \['gewinn', 'Gewinn'\]\] : \[\]\), v\.g, \(w\) => waehlen\(\{ diagramm: w \}\)\)/);
  assert.match(ansichten, /wahlChips\('Zeitraum', 'jahr', x\.jahre\.map\(\(j\) => \[j, String\(j\)\]\)\.concat\(gewinn \? \[\] : \[\[null, 'Alle Jahre'\]\]\), x\.jahr, \(w\) => waehlen\(\{ verkaufJahr: w \}\)\)/);
  assert.match(ansichten, /gewinn \? null : wahlChips\('Kanal', 'kanal', \[\['', 'Alle Kanäle'\]\]\.concat\(x\.kanaele\.map\(\(n\) => \[n, n\]\)\), x\.kanal, \(w\) => waehlen\(\{ verkaufKanal: w \}\)\)/);
  // … und sie gilt für alles darunter: Karte mit Zahl und Jahreslinie, Monate, Aufteilung; am Ende die Themen als Zeilen
  assert.match(ansichten, /summeKarte\(v, waehlen\),\s*v\.g === 'rohertrag' \? gleichung\(x\.summe\) : null,\s*v\.jv \? \[h\('h2', \{ id: 'monate-anker' \}, h\('strong', \{ text: 'Pro' \}\), ' Monat'\), monateKarte\(v, waehlen\)\] : null,\s*aufteilung\(v, waehlen\),\s*\/\/ [^\n]*\n\s*zahlenAbschnitt\(\['ueberblick', 'vergleich', 'rohertrag', 'bestellungen', 'rekorde'\]\),/, 'der Gewinn hat seit v43 seine eigene Wahl');
  assert.match(ansichten, /H\.auswerten\(a\.zeilen, kosten, a\.heute, \{ kennzahl: gewinn \? 'rohertrag' : Z\.diagramm, jahr: jahr, kanal: kanal\(\),/);
  assert.match(ansichten, /const kosten = zd && zd\.mehr && zd\.mehr\.marge \? zd\.mehr\.marge\.kostenJeZeile : null;/);
  assert.match(ansichten, /const jv = x\.jahr === null \? null : H\.jahresVergleich\(x\.werte, a\.heute, x\.jahr\);/, 'die Diagramme rechnen mit den Monatswerten der Wahl');
  assert.match(ansichten, /if \(jv && !davor\) jv\.monate\.forEach\(\(m\) => \{ m\.vorjahr = null; \}\);/, 'erstes Jahr: keine Linie und keine Balken für ein Jahr davor');
  assert.match(lies('docs/hilfen.js'), /verluste: verluste, mehr: fifo\.mehr, flaschen: flaschen, kostenJeZeile: fifo\.kosten,/);
  // Umsatz und Rohertrag sind Euro; fehlen Herstellkosten, steht ein Strich statt einer Zahl
  assert.match(ansichten, /const IST_EURO = \{ umsatz: true, rohertrag: true, gewinn: true \};/);
  assert.match(ansichten, /function mitEinheit\(z, g\) \{\s*if \(!zahlDa\(z\)\) return '–';/);
  // Ein Tipp auf einen Kanal wählt ihn (und springt nach oben), ein Tipp auf einen Kunden öffnet sein Blatt, ein Jahr in der Liste wählt das Jahr
  assert.match(ansichten, /\(\) => \{ waehlen\(\{ verkaufKanal: gr\.schluessel \}\); S\.nachOben\('verkaeufe'\); \}, 'Nur diesen Kanal zeigen'\)/);
  assert.match(ansichten, /teilZeile\(gr, g, gr\.name, mitAnteil, \(\) => S\.kundeZeigen\(gr\.schluessel\), 'Details'\)/);
  assert.match(ansichten, /\(\) => waehlen\(\{ verkaufJahr: Number\(j\.schluessel\) \}\), 'Nur dieses Jahr zeigen'\)/);
  // Über den Jahreswechsel blättern wechselt die Wahl oben mit
  assert.match(ansichten, /waehlen\(\{ verkaufJahr: Number\(monat\.slice\(0, 4\)\), monatWahl: monat \}\);/);
  // Kein erzwungener Fokus nach einem Tipp (blauer Rahmen auf dem iPhone): nur wer mit der Tastatur unterwegs ist, behält ihn
  assert.match(ansichten, /f\.dataset\.fokus !== undefined && f\.matches\(':focus-visible'\) \? f\.dataset\.fokus : null;/);
  assert.match(ansichten, /const tastatur = ev\.currentTarget\.matches\(':focus-visible'\);/);
  // Codex v36: unbekannter Rohertrag (Herstellkosten fehlen) bekommt im Monatsdiagramm keinen Balken und einen Strich
  // statt „0“; gibt es den gewählten Kanal nicht mehr, wird erst die Wahl berichtigt; entfällt ein Thema, geht sein Blatt zu;
  assert.match(ansichten, /text: da \? H\.achsenText\(Math\.round\(m\.dieses\[g\]\)\) : m\.dieses \? '–' : '',/);
  assert.match(ansichten, /if \(!gewinn && x\.kanal !== Z\.verkaufKanal\) \{ Z\.verkaufKanal = x\.kanal; x = rechnen\(jahr0\); \}/);
  assert.match(ansichten, /if \(!neu\) return S\.blattSchliessen\(true\);/);
  // Ohne die einzelnen Verkaufszeilen (alter gespeicherter Stand) sagt der Reiter das, statt halb zu rechnen
  assert.match(ansichten, /leerKarte\('Verkäufe noch nicht geladen',/);
  assert.doesNotMatch(ansichten, /function kanaeleTeil|function kanalListe|function summenZeile|function jahrKarte|Z\.zeitraum\b/);
  // Themen als Zeilen im passenden Reiter: Kunden in Kunden, Bestand und Abgänge im Lager; je Thema ein Blatt
  assert.match(ansichten, /nachfassenKarte\(a\),\s*zahlenListe\(\['kunden'\]\),/);
  assert.match(ansichten, /lagerListe\(Z\.daten\), zahlenListe\(\['bestand', 'abgaenge'\]\)\);/);
  assert.match(ansichten, /h\('button', \{ type: 'button', class: 'zeilen-knopf', 'data-zahlen': id, onclick: \(\) => S\.zahlenZeigen\(id, jahr\) \},/);
  assert.match(ansichten, /S\.zahlenZeigen = function \(id, jahr, zurueck\) \{\s*Z\.zahlenJahr = typeof jahr === 'number' \? jahr : undefined;\s*const inhalt = zahlenInhalt\(id\);\s*if \(inhalt\) S\.blattZeigen\(ZAHLEN_TITEL\[id\], inhalt, typeof zurueck === 'function' \? zurueck : \(\) => document\.querySelector\('#app \[data-zahlen="' \+ id \+ '"\]'\), true\);/);
  assert.doesNotMatch(ansichten + css, /dash-nav|dash-oben|dash-weiter|dashboardSeite\(|auswertenInhalt|dash-chips/, 'keine Seiten-Reihe mehr');
  // Vom Start aus beginnt die Wahl neu (ohne Kanal, laufendes Jahr bzw. Jahr des Monats), mit der angetippten Kennzahl
  assert.match(ansichten, /Object\.assign\(Z, \{ diagramm: kennzahl \|\| 'flaschen', verkaufKanal: '', verkaufJahr: monat \? Number\(monat\.slice\(0, 4\)\) : jahr, verkaufAlle: false \}\);/);
  assert.match(kern, /ertrag: \[\['path', /);
  // Wahl im Zustand, beim Abmelden zurückgesetzt; die Felder des früheren Dashboards sind weg
  ['verkaufJahr', 'verkaufKanal', 'verkaufNach', 'verkaufAlle'].forEach((feld) => {
    assert.match(kern, new RegExp('\\n      ' + feld + ': '), feld + ' im Zustand');
    assert.match(app, new RegExp('function vergessen\\(\\)[\\s\\S]{0,1500}' + feld + ': '), feld + ' wird beim Abmelden zurückgesetzt');
  });
  assert.doesNotMatch(kern + app + ansichten, /dashSeite|dashKennzahl|dashJahr|dashKanal|dashNach|dashAlle/);
  // Blätter mit vielen Zahlen sind auf breiten Bildschirmen breit (zwei Spalten als Raster, verteilt in hilfen.js);
  // keine feste Höhe mehr, keine CSS-Spalten (zerrissen in Safari die Tabellen), kein :has (ältere iPhones)
  assert.match(kern, /S\.blattZeigen = function \(titel, inhalt, zurueck, gross\) \{[\s\S]{0,500}b\.classList\.toggle\('gross', gross === true\);/);
  assert.strictEqual((ansichten.match(/S\.blattZeigen\(/g) || []).length, 4, 'Zahlen, Kunde, Lager, offene Rechnungen (v41)');
  assert.strictEqual((ansichten.match(/S\.blattZeigen\([^;]*, true\);/g) || []).length, 1, 'nur die Zahlen-Blätter sind groß');
  assert.match(ansichten, /H\.spaltenTeilen\(bloecke\.map\(/);
  assert.match(dash, /@media \(min-width: 900px\) \{\s*\.blatt\.gross \{ max-width: 1040px; \}\s*\.dash-spalten \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(css, /\.blatt\.gross \{ height|column-count|column-span/);
  assert.doesNotMatch(dash, /:has\(|touch-action/);
});

test('PWA: Neuaufbau v43 – Plus bleibt in der Mitte, Gewinn und Kosten als vierte Wahl in „Zahlen“, flach ohne Kacheln, Bewegung beim Scrollen', () => {
  const html = lies('docs/index.html');
  const css = lies('docs/style.css');
  const ansichten = lies('docs/ansichten.js');
  const app = lies('docs/app.js');
  const kern = lies('docs/kern.js');
  // Mark, 2026-11-21: unten höchstens fünf, links zwei, Plus in der Mitte, rechts zwei. Der Reiter „Verkäufe“ heißt
  // sichtbar „Zahlen“ (intern weiter `verkaeufe`), einen eigenen Reiter für die Finanzen gibt es nicht
  assert.match(app, /const ANSICHTEN = \['uebersicht', 'verkaeufe', 'eintragen', 'kunden', 'lager'\];/);
  const leiste = html.slice(html.indexOf('<nav id="leiste"'), html.indexOf('</nav>'));
  assert.deepStrictEqual(Array.from(leiste.matchAll(/data-ansicht="([a-z]+)"/g), (m) => m[1]), ['uebersicht', 'verkaeufe', 'eintragen', 'kunden', 'lager']);
  assert.deepStrictEqual(Array.from(leiste.matchAll(/<span>([^<]+)<\/span>/g), (m) => m[1]), ['Start', 'Zahlen', 'Eintragen', 'Kunden', 'Lager']);
  assert.match(html, /<section id="ansicht-verkaeufe"[^>]*>\s*<h1 class="titel"><strong>Zahlen<\/strong><\/h1>/);
  assert.doesNotMatch(html + app + ansichten + kern + css, /finanzen|finanzJahr|leiste-kapsel/i);
  // Gewinn als Wahl: gerechnet wird mit den Zahlen des Rohertrags ohne Kanal, immer mit einem Jahr; die gemerkte
  // Kanal-Wahl bleibt für die anderen Kennzahlen stehen; ohne Herstellkosten fällt die Wahl auf Flaschen zurück
  assert.match(ansichten, /const gewinn = Z\.diagramm === 'gewinn';\s*const kanal = \(\) => \(gewinn \? '' : Z\.verkaufKanal\);/);
  assert.match(ansichten, /const ohneJahr = Z\.verkaufJahr === undefined \|\| \(gewinn && Z\.verkaufJahr === null\);/);
  assert.match(ansichten, /const g = gewinn && x\.mitKosten && x\.jahr !== null \? 'gewinn' : x\.kennzahl;\s*\/\/ [^\n]*\n\s*Object\.assign\(Z, \{ diagramm: g \}, g === 'gewinn' \? \(Z\.verkaufJahr === null \? null : \{ verkaufJahr: x\.jahr \}\) : \{ verkaufJahr: x\.jahr, verkaufKanal: x\.kanal \}\);/,
    '„Alle Jahre“ bleibt gemerkt, wenn man kurz den Gewinn ansieht (Codex v43)');
  assert.match(ansichten, /gewinn \? gewinnTeile\(x\) : \[/);
  // Aufbau der Wahl Gewinn: die Zahl mit „Einnahmen gegen Kosten“, Monate, sonstige Kosten, Break-even, offene
  // Rechnungen, das Blatt mit allen Tabellen (fürs gewählte Jahr)
  const gt = ansichten.slice(ansichten.indexOf('function gewinnTeile(x) {'), ansichten.indexOf('// Verkäufe ---'));
  assert.ok(gt.length > 3000);
  assert.match(gt, /return \[\s*gewinnKarte,\s*gb && gwDa \? \[h\('h2', \{\}, h\('strong', \{ text: 'Pro' \}\), ' Monat'\), bildKarte\([^\n]*, gb\.monate\(\)\)\] : null,\s*gb && gw\.kategorien\.some\(\(y\) => y\.netto > 0\) \? \[h\('h2', \{\}, h\('strong', \{ text: 'Wohin' \}\), ' das Geld geht'\),\s*bildKarte\([^\n]*, gb\.ring\(\)\)\] : null,\s*breakEvenKarte\(\),\s*offenKarte\(\),\s*zahlenAbschnitt\(\['gewinn'\], jahr\),\s*\];/);
  // Dieselbe Rechnung und dieselben Bilder wie im Blatt „Gewinn und Kosten“ (gewinnBilder), nichts wird doppelt gerechnet
  assert.match(gt, /const gw = gewinnFuer\(jahr\);/);
  assert.match(gt, /const kostenDa = !!gw && !gw\.hinweis && gw\.jahr === jahr;\s*const gwDa = kostenDa && !\(gw\.ohneEinnahmen && !gw\.guv\);\s*const gb = kostenDa \? gewinnBilder\(gw\) : null;/,
    'fehlen nur die Einnahmen, bleiben Kostenring und Break-even (Codex v43)');
  assert.match(gt, /kostenDa \? 'Einnahmen netto aus Lexware fehlen noch \(Tab „Lexware-Rechnungen“, Spalte „netto \(€\)“\)\. Deshalb gibt es noch keinen Gewinn\.'/);
  // Kosten zusammen = Einnahmen − Gewinn (dieselbe Rechnung wie die große Zahl, auch bei einer Lagerzunahme); ein
  // fehlendes GuV-Feld ist unbekannt, nicht 0 (Codex v43)
  assert.match(gt, /const kosten = zahlDa\(einnahmen\) && zahlDa\(sg\.gewinn\) \? einnahmen - sg\.gewinn : null;/);
  assert.match(gt, /geldBalken\(einnahmen, kosten, teile\)\);/);
  assert.match(ansichten, /\(t\[1\] \/ plus\) \* \(lang \/ hoch\) \* 100\)\) : null\),/);
  assert.match(ansichten, /function gewinnBilder\(gw\) \{[\s\S]{0,200}const kd = H\.kostenRechnen\(gw, a\.zeilen, u\.kosten, a\.heute\);/);
  assert.match(ansichten, /const gb = gewinnBilder\(gw\);\s*const kd = gb\.kd;/, 'das Blatt nutzt denselben Baustein');
  assert.doesNotMatch(gt, /H\.gewinnRechnen|H\.kostenRechnen|dashboardSeiten|Z\.zahlenJahr/);
  // Der Prozentwert steht nur bei einem Gewinn da (bei einem Verlust wäre „−140 % der Einnahmen“ Unsinn)
  assert.match(gt, /zahlDa\(sg\.anteil\) && sg\.gewinn > 0 \? h\('span', \{ class: 'aw-marge', text: marge\(sg\.anteil\) \+ ' der Einnahmen' \}\) : null,/);
  // Ohne Kosten aus Lexware für das Jahr: Hinweis statt Gewinn
  assert.match(gt, /Für ' \+ jahr \+ ' gibt es keine Kosten aus Lexware, deshalb keinen Gewinn\./);
  // Break-even als ein Satz mit Bild; die Herleitung steht im Blatt
  assert.match(gt, /h\('p', \{ class: 'be-zahl', 'aria-hidden': 'true' \}, h\('strong', \{\}, zaehl\(be\.verkauftProMonat, 0\)\), ' von ' \+ fl\(be\.flaschen\) \+ ' Flaschen im Monat'\),\s*breakEvenBalken\(be\),/);
  // Wahl Rohertrag: was an einer Flasche bleibt, als Gleichung
  assert.match(ansichten, /glied\(cent\(sum\.proFlasche\), 'Umsatz'\), zeichen\('−'\), glied\(cent\(kostenProFlasche\), 'Herstellung'\), zeichen\(genau \? '=' : '≈'\),\s*glied\(cent\(sum\.rohProFlasche\), 'Rohertrag', 'gl-ergebnis'\)/);
  assert.match(ansichten, /c\(sum\.proFlasche\) - c\(kostenProFlasche\) === c\(sum\.rohProFlasche\);/, 'geht die gerundete Rechnung nicht auf, steht „≈“ (Codex v43)');
  // Die Themen-Zeilen geben das Jahr an ihr Blatt weiter und zeigen die Kernzahl dieses Jahrs
  assert.match(ansichten, /function zahlenListe\(ids, jahr\) \{/);
  assert.match(ansichten, /function zahlenKern\(id, zd, a, wahlJahr\) \{/);
  assert.match(ansichten, /text: zahlenKern\(id, zd, a, jahr\) \}\)\),/);
  assert.match(ansichten, /if \(typeof wahlJahr === 'number' && g && !g\.hinweis && g\.jahr !== wahlJahr\) return 'Für ' \+ wahlJahr \+ ' keine Kosten aus Lexware';/);
  // Blatt zu: Gibt es die auslösende Zeile nicht mehr oder liegt sie in einer stillgelegten Ansicht, geht der Fokus auf den Reiter (Codex v43)
  assert.match(kern, /v\.closest\('\[inert\]'\)\)\) v = S\.el\('reiter-' \+ S\.zustand\.ansicht\);/);
  // Flach (Mark: weg von den Kacheln): `.karte` ist ein Abschnitt ohne Kasten, die Kacheln sind ein Band mit feinen Linien
  assert.match(css, /\n\.karte \{ margin: 0 0 28px; \}/);
  assert.doesNotMatch(css, /\n\.karte \{[^}]*background/);
  assert.match(css, /\.dash-kachel \{ padding: 2px 12px; border-left: 0\.5px solid var\(--linie\); min-width: 0; \}/);
  assert.match(css, /\.jahr-karte \.info-wert, \.gesamt-karte \.info-wert \{[^}]*font-size: min\(56px, 14\.5vw\);/);
  // Bewegung beim Scrollen: Abschnitte blenden einmal ein, Zahlen zählen hoch, Diagramme wachsen; abschaltbar
  assert.match(kern, /S\.bewegung = function \(wurzel\) \{/);
  assert.match(kern, /const bewegt = typeof window\.IntersectionObserver === 'function';/);
  assert.match(kern, /if \(!isFinite\(bis\) \|\| ruhig\(\)\) return;/, 'bei „Bewegung reduzieren“ zählt nichts hoch');
  assert.match(kern, /pruefUhr = setTimeout\(nachsehen, 700\);/, 'Sicherheitsnetz, falls der Beobachter sich nicht meldet');
  assert.match(kern, /document\.addEventListener\('scroll', \(\) => \{[\s\S]{0,200}if \(document\.querySelector\('\.auf:not\(\.da\)'\)\) nachsehen\(\);[\s\S]{0,40}\{ capture: true, passive: true \}\);/,
    'auch beim Scrollen: kein Abschnitt bleibt unsichtbar, selbst wenn der Beobachter sich nie meldet');
  assert.match(css, /@media screen and \(prefers-reduced-motion: no-preference\) \{\s*\.bewegt \.auf \{ opacity: 0; transform: translate3d\(0, 22px, 0\); \}/, 'nur am Bildschirm, im Druck ist alles da (Codex v43)');
  ['uebersicht', 'verkaeufe', 'kunden', 'lager'].forEach((n) => {
    const f = ansichten.slice(ansichten.indexOf('S.ansichten.' + n + ' = function'));
    assert.match(f.slice(0, f.indexOf('\n  };')), /S\.bewegung\(ziel\);/, n);
  });
  assert.match(app, /S\.bewegungNeu\(\);/, 'beim Abmelden zurückgesetzt');
  assert.match(ansichten, /function zaehl\(wert, stellen, schluessel\) \{\s*return h\('span', \{ 'data-zaehl': String\(wert\),/);
  assert.match(ansichten, /class: 'linie-dieses zieh', pathLength: 1 \}/);
  assert.match(css, /\.rein-anim \.zieh \{ stroke-dasharray: 1; animation: ziehen 1\.1s var\(--sanft\) both; animation-delay: var\(--seit, 0s\); \}/);
  // Wird ein Abschnitt neu gezeichnet, während er noch einblendet (frischer Stand kurz nach dem Start), läuft die Bewegung weiter
  assert.match(kern, /const laeuft = !neu && bewegt && !ruhig\(\) && jetzt - start < Math\.max\(EIN_MS, ZAEHL_MS\);/);
  assert.match(kern, /el\.style\.setProperty\('--seit', Math\.round\(start - jetzt\) \+ 'ms'\);/);
  // Keine Trennpunkte zwischen Wörtern (Mark)
  const startNeu = ansichten.slice(ansichten.indexOf('// Start als Zusammenfassung (seit v43)'), ansichten.indexOf('/**\n   * Dezember und Januar, solange nicht alle Lager'));
  assert.ok(startNeu.length > 3000);
  assert.doesNotMatch(gt + startNeu + leiste, /[·•]/);
});

test('PWA: Aufgaben fürs Team (v43) – eigene Aufgaben auf dem Start, Team als Reihe, Blatt je Person, Anlegen über das Plus', () => {
  const html = lies('docs/index.html');
  const css = lies('docs/style.css');
  const auf = lies('docs/aufgaben.js');
  const kern = lies('docs/kern.js');
  const app = lies('docs/app.js');
  // Eingebunden nach eintragen.js, im Cache der App-Hülle
  assert.match(html, /<script src="eintragen\.js"><\/script>\s*<script src="aufgaben\.js"><\/script>\s*<script src="app\.js"><\/script>/);
  assert.match(lies('docs/sw.js'), /'eintragen\.js',\s*'aufgaben\.js',/);
  // Ohne den Tab „Aufgaben“ (Feld fehlt oder null) zeigt die App nichts davon
  assert.match(auf, /S\.aufgabenStart = function \(\) \{\s*const d = daten\(\);\s*if \(!d\) return null;/);
  assert.match(auf, /if \(!daten\(\)\) return ziel\.replaceChildren\(\);/);
  // Start: die nächsten drei eigenen, rechts „Neu“, darunter das Team; ein Tipp auf eine Person öffnet das Blatt bei ihr
  assert.match(auf, /const START_ANZAHL = 3;/);
  assert.match(auf, /h\('h2', \{\}, h\('strong', \{ text: 'Deine' \}\), ' Aufgaben'\)/);
  assert.match(auf, /'data-person': p\.name, onclick: \(\) => S\.aufgabenZeigen\(p\.name\),/);
  // Gerechnet und geprüft wird in hilfen.js
  assert.match(auf, /H\.aufgabenSicht\(d, Z\.name, heute\(\)\)/);
  assert.match(auf, /H\.aufgabePruefen\(\{ titel: titel\.value, fuer: wahl\.fuer, faellig: wahl\.faellig, uhrzeit: zeit\.value, notiz: notiz\.value \}, team, heute\(\)\)/);
  // Abhaken wirkt sofort und springt nicht zurück; gesendet wird nacheinander und nie während eine Buchung läuft
  assert.match(auf, /senden\('aufgabeAendern', \{ id: x\.id, status: fertig \? 'erledigt' : 'offen' \}, x\.id,/);
  // Codex v43 (hoch): Die Sitzung gilt ab dem Tipp; nach einem Abmelden in der kurzen Pause wird der Haken verworfen
  assert.match(auf, /const sitzung = Z\.sitzung;\s*const los = \(\) => \{\s*if \(sitzung !== Z\.sitzung\) return;\s*senden\('aufgabeAendern',/);
  // Codex v43: eine Anfrage-ID je Entwurf (kein Doppel nach einer Zeitüberschreitung); beim Ändern nur geänderte Felder
  assert.match(auf, /const entwurfId = S\.neueAnfrageId\(\);/);
  assert.match(auf, /neu \? Object\.assign\(\{ anfrageId: entwurfId \}, p\.daten\) : Object\.assign\(\{ id: x\.id \}, aenderung\)\);/);
  assert.match(auf, /const aenderung = neu \? null : H\.aufgabeAenderung\(x, p\.daten\);\s*if \(!neu && !Object\.keys\(aenderung\)\.length\) return zurueck\(\);/);
  // Codex v43: Fokus bleibt bei Tastaturbedienung auf derselben Aufgabe bzw. demselben Chip
  assert.match(auf, /'data-fokus': 'haken:' \+ x\.id,/);
  assert.match(auf, /const druecken = \(reihe, wert\) => Array\.from\(reihe\.children\)\.forEach\(\(c\) => c\.setAttribute\('aria-pressed', c\.dataset\.wert === wert \? 'true' : 'false'\)\);/);
  // Codex v43: bleibt die App über Mitternacht offen, zählt der Tag der Uhr
  assert.match(auf, /const uhr = H\.heuteBerlin\(\);\s*return uhr > stand \? uhr : stand;/);
  assert.match(auf, /for \(let i = 0; i < 100 && Z\.schreibt && sitzung === Z\.sitzung; i\+\+\) await new Promise/);
  assert.match(auf, /if \(e\.art === 'fehler'\) S\.melden\(e\.meldung \|\| 'Das hat nicht geklappt\.', true\);/);
  // Nichts wird gelöscht: „Löschen“ setzt den Status, nach einer Rückfrage
  assert.match(auf, /await S\.frage\('„' \+ x\.titel \+ '“ löschen\? Die Aufgabe verschwindet für alle\.', 'Löschen', 'Abbrechen', true\)/);
  assert.match(auf, /senden\('aufgabeAendern', \{ id: x\.id, status: 'entfernt' \}, x\.id, \{ status: 'entfernt' \}\);/);
  // Die Antwort einer Aufgaben-Aktion bringt nur die Aufgaben mit: Start und offenes Blatt werden gezeichnet
  assert.match(kern, /if \(e\.art === 'ok' && e\.daten\.uebersicht === undefined && e\.daten\.aufgaben !== undefined\) \{[\s\S]{0,400}\n\s*S\.aufgabenSetzen\(e\.daten\.aufgaben\);/);
  assert.doesNotMatch(kern, /frisch = S\.aufgabenSetzen/, 'keine frische Übersicht: ein verworfenes Neuladen wird nachgeholt (Codex v43)');
  assert.match(app, /S\.aufgabenSetzen = function \(aufgaben\) \{\s*if \(!Z\.daten\) return false;\s*Z\.daten\.aufgaben = aufgaben;/);
  assert.match(app, /if \(typeof S\.aufgabenAuffrischen === 'function'\) S\.aufgabenAuffrischen\(\);/);
  assert.match(app, /if \(typeof S\.aufgabenVergessen === 'function'\) S\.aufgabenVergessen\(\);/);
  // Plus: oben die Zeile „Aufgabe fürs Team“
  assert.match(html, /<div id="eintragen-aufgabe"><\/div>\s*<form id="buchen-form" novalidate>/);
  // Nur DOM-Knoten, kein HTML-Text; keine Trennpunkte zwischen Wörtern (Mark); Fokusrahmen für die Tastatur
  assert.doesNotMatch(auf, /innerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(auf, /[·•]/);
  assert.match(css, /\.af-haken:focus-visible::before \{ outline: 2px solid var\(--akzent\); outline-offset: 2px; \}/);
  assert.match(css, /\.aufgabe\.fertig \.af-haken::before, \.aufgabe\.abgehakt \.af-haken::before \{ background: var\(--akzent\); box-shadow: none; \}/);
});

test('PWA: Gewinn vorläufig (v38) – Zeile auf dem Start, Thema „Gewinn und Kosten“ (seit v43 unter der Wahl Gewinn in den Zahlen), Lexware-Kosten nur gelesen', () => {
  const css = lies('docs/style.css');
  const ansichten = lies('docs/ansichten.js');
  const hilfen = lies('docs/hilfen.js');
  // Gerechnet in hilfen.js aus dem, was die App schon hat (Rohertrag-Kosten je Zeile, Abgänge je Monat) und uebersicht.kosten
  assert.match(ansichten, /return H\.gewinnRechnen\(a\.zeilen, zd\.mehr\.marge, u\.kosten, u\.abfuellungen, a\.heute, jahr, extra\);/);
  assert.match(hilfen, /wegJeMonat: !bekannt \? null : /);
  // Start: Zeile „Gewinn“ nur mit Kosten für das gezeigte Jahr, sie öffnet seit v43 die Zahlen mit der Wahl Gewinn und diesem Jahr
  assert.match(ansichten, /const gs = gw && !gw\.hinweis && gw\.jahr === jv\.jahr && !\(gw\.ohneEinnahmen && !gw\.guv\) \? gw\.summe : null;/);
  assert.match(ansichten, /gs \? jahrZeile\(\{ schluessel: 'gewinn', titel: 'Gewinn', zahl: zahlDa\(gs\.gewinn\) \? gs\.gewinn : null, einheit: '€', minus: gs\.gewinn < 0,/);
  assert.match(ansichten, /bild: zahlDa\(gs\.gewinn\) \? gewinnSpark\(gw\) : null, beiTipp: zuV\('gewinn'\),/);
  // seit v39: „unvollständig“ bei unlesbaren Zeilen im Tab, „bis …“, wenn Lexware das Jahr nur zum Teil abdeckt;
  // seit v42 laut Lexware mit bzw. ohne Lager, die Zeile steht vor dem Umsatz
  assert.match(ansichten, /const gKlein = !gs \? '' : !zahlDa\(gs\.gewinn\) \? 'Herstellkosten fehlen' : gw\.fehler \|\| gw\.fehlerEinnahmen \? 'unvollständig' : gBis \|\| \(gw\.lager \? 'steuerlich, vorläufig' : 'laut Lexware, ohne Lager'\);/);
  assert.match(ansichten, /const zeilen = \[\s*\/\/ [^\n]*\n\s*gs \? jahrZeile\(\{ schluessel: 'gewinn',[\s\S]{0,1400}\}\) : null,\s*jahrZeile\(\{ schluessel: 'umsatz',/);
  assert.doesNotMatch(ansichten, /gewinnKachel/);
  assert.match(css, /\.jz-wert\.minus \{ color: var\(--rot\); \}/, 'ein Verlust steht rot da');
  // Blatt: Treppe, Kategorien, Vergleich, Monate; die Hinweise zu Grenzen und Stand stehen sichtbar da
  assert.match(ansichten, /gewinn: 'Gewinn und Kosten'/);
  assert.match(ansichten, /'Wie GuV in Lexware plus Lagerveränderung\. Buchungen ohne Beleg fehlen\.'/);
  assert.match(ansichten, /'\. Wie GuV in Lexware plus Lagerveränderung\. Buchungen ohne Beleg fehlen' \+ \(gw\.guv \? ' nur in den Monaten\.' : '\.'\)/);
  assert.match(ansichten, /'Stand: Lexware-GuV vom ' \+ H\.datumFormat\(gw\.guv\.stand\)/);
  assert.match(ansichten, /'Stand: Lexware, täglich, aus Belegen, ohne Buchungen ohne Beleg'/);
  // seit v40: Wareneinkauf je Kategorie mit Summe; seit v42 zählt Ware laut Lexware im Gewinn, die Abfüllungen nur zum Vergleich
  assert.match(ansichten, /zellen: \['Wareneinkauf', eur\(gw\.wareLexware\), klein\(''\)\]/);
  assert.match(ansichten, /dashTitel\('Wareneinkauf und Abfüllungen', 'zum Vergleich'\)/);
  // seit v42 die Treppe laut Lexware: Einnahmen, Ware/Material, sonstige Kosten, Lagerabnahme, Gewinn
  ["nameMit('Einnahmen', 'Lexware')", "nameMit('Ware/Material', 'Lexware')", "nameMit('Sonstige Kosten', 'Lexware')", "nameMit(lagerName(sg.lager))"]
    .forEach((x) => assert.ok(ansichten.indexOf('zellen: [' + x) >= 0, x));
  // Ohne Kosten aus Lexware kein Gewinn, nur der Hinweis
  assert.match(hilfen, /hinweis: 'Noch keine Kosten aus Lexware\./);
  // Keine Trennpunkte zwischen Wörtern (Mark)
  const neu = ansichten.slice(ansichten.indexOf('// Gewinn und Kosten (seit v38'), ansichten.indexOf('// Preise und Bestellungen'));
  assert.ok(neu.length > 1000);
  assert.doesNotMatch(neu + hilfen.slice(hilfen.indexOf('function gewinnRechnen')), /[·•]/);
  // Schnittstelle: Tab nur lesen, fehlt er, ist es null
  const api = lies('api/src/Api.js');
  assert.match(api, /const kosten = ss\.getSheetByName\(LEXWARE_KOSTEN_TAB\);/);
  assert.match(api, /lexwareKosten: kosten \? kosten\.getDataRange\(\)\.getValues\(\) : null,/);
  assert.match(lies('api/src/Konfig.js'), /const LEXWARE_KOSTEN_TAB = 'Lexware-Kosten';/);
});

test('PWA: offene Rechnungen aus Lexware (v41) – Zeile auf dem Start, Zeile unter der Wahl Gewinn (v43), Blatt, Kunden-Blatt, Hinweis in der Kundenliste', () => {
  const css = lies('docs/style.css');
  const ansichten = lies('docs/ansichten.js');
  const hilfen = lies('docs/hilfen.js');
  // Start (seit v43 als Zeile in „Im Blick“) und Zahlen (Wahl Gewinn): nur wenn etwas offen ist; antippen öffnet das
  // Blatt, danach zurück auf die Stelle, von der es kam
  assert.match(ansichten, /if \(fd && \(fd\.offen > 0 \|\| fd\.ueberfaellig > 0\)\) \{/);
  assert.match(ansichten, /blickZeile\(\{ schluessel: 'offen', symbol: 'rechnung', titel: 'Offene Rechnungen',/);
  assert.match(ansichten, /wert: H\.summeFormat\(fd\.offen\), beiTipp: \(\) => S\.offeneZeigen\(\),/);
  assert.match(ansichten, /if \(!fd \|\| !\(fd\.offen > 0 \|\| fd\.ueberfaellig > 0\)\) return null;/);
  assert.match(ansichten, /class: 'karte offen-karte', 'data-offen': 'zahlen', onclick: \(\) => S\.offeneZeigen\(\),/);
  assert.match(ansichten, /S\.blattZeigen\('Offene Rechnungen', \[/);
  assert.match(ansichten, /\], \(\) => document\.querySelector\(Z\.ansicht === 'verkaeufe' \? '#app \[data-offen="zahlen"\]' : '#app \[data-start="offen"\]'\)\);/);
  // Kunden: Abschnitt im Kunden-Blatt vor den letzten Bestellungen, rotes „überfällig“ in der Liste
  assert.match(ansichten, /offenKunde\(schluessel\),\s*h\('p', \{ class: 'blatt-titel-klein', text: 'Letzte Bestellungen' \}\),/);
  assert.match(ansichten, /ueber \? h\('span', \{ class: 'badge badge-ueber', text: 'überfällig' \}\) : null/);
  assert.match(css, /\.badge\.badge-ueber \{ background: var\(--rot-weich\); color: var\(--rot\); \}/);
  // Gerechnet in hilfen.js, keine Trennpunkte zwischen Wörtern (Mark)
  const neu = ansichten.slice(ansichten.indexOf('// Offene Rechnungen aus Lexware (seit v41)'), ansichten.indexOf('/** Eine Zeile „Zuletzt passiert“'));
  assert.ok(neu.length > 1000);
  const neuH = hilfen.slice(hilfen.indexOf('// Offene Rechnungen aus Lexware (seit v41) ---'), hilfen.indexOf('function zehntel('));
  assert.ok(neuH.length > 1000);
  assert.doesNotMatch(neu + neuH, /[·•]/);
  // Schnittstelle: Tab nur lesen, fehlt er, ist es null
  const api = lies('api/src/Api.js');
  assert.match(api, /const rechnungen = ss\.getSheetByName\(LEXWARE_RECHNUNGEN_TAB\);/);
  assert.match(api, /lexwareRechnungen: rechnungen \? rechnungen\.getDataRange\(\)\.getValues\(\) : null,/);
  assert.match(lies('api/src/Konfig.js'), /const LEXWARE_RECHNUNGEN_TAB = 'Lexware-Rechnungen';/);
});

test('PWA: Gewinn und Kosten als Dashboard (v40) – Monatsbild, Fixkosten und Break-even, Ring, Lieferanten, Wareneinkauf, eingebettet', () => {
  const css = lies('docs/style.css');
  const ansichten = lies('docs/ansichten.js');
  const hilfen = lies('docs/hilfen.js');
  // Gerechnet in hilfen.js aus dem Gewinn des Blatts, gezeichnet als eigenes SVG (keine fremden Bibliotheken)
  assert.match(ansichten, /const kd = H\.kostenRechnen\(gw, a\.zeilen, u\.kosten, a\.heute\);/);
  ['function gewinnDiagramm(gw)', 'function ringDiagramm(teile, mitte, unter)', 'function breakEvenBalken(be)', 'function vergleichBalken(paare)', 'function gewinnSpark(gw)']
    .forEach((f) => assert.ok(ansichten.includes(f), f));
  assert.doesNotMatch(lies('docs/index.html'), /chart|d3|cdn/i);
  // Kein neuer Einstieg: dasselbe Thema „Gewinn und Kosten“, auf dem Start nur die feine Linie in der Kachel
  assert.match(ansichten, /zahlDa\(gs\.gewinn\) \? gewinnSpark\(gw\) : null,/);
  assert.doesNotMatch(ansichten, /seite\('kosten'/);
  assert.match(ansichten, /fixBlock\(\),[\s\S]{0,1200}lieferantenBlock\(\),\s*wareBlock\(\),/);
  // Die Regel für Fixkosten steht sichtbar in der Fußnote
  assert.match(ansichten, /Nicht mitgerechnet wird Einmaliges: eine Kategorie, die nur in einem Monat Kosten hat, wenn der Betrag größer ist als ein typischer Monat \(Median\)/);
  // Farben aus den Variablen, die Spaltenbreiten der Lieferanten-Tabelle, keine Trennpunkte zwischen Wörtern (Mark)
  assert.match(css, /\.diagramm \.gm-linie \{ fill: none; stroke: var\(--akzent\);/);
  assert.match(css, /\.kat-0 \{ background: var\(--akzent\); stroke: var\(--akzent\); \}/);
  const neu = ansichten.slice(ansichten.indexOf('// Gewinn und Kosten als Bilder (seit v40'), ansichten.indexOf('function dashboardSeiten()'));
  assert.ok(neu.length > 2000);
  assert.doesNotMatch(neu + hilfen.slice(hilfen.indexOf('const TOP_LIEFERANTEN'), hilfen.indexOf('function spaltenTeilen')), /[·•]/);
  // Schnittstelle: Lieferant nur mit passendem Kopf, sonst fehlt das Feld
  assert.match(lies('api/src/Konfig.js'), /const LK_LIEFERANT_KOPF = 'Lieferant';/);
  assert.match(lies('api/src/UebersichtLogik.js'), /if \(mitLieferant\) \{\s*aus\.lieferanten = /);
});

test('PWA: Gewinn laut Lexware (v42) – Einnahmen und Bestand aus der Schnittstelle, Lager-Block, Wareneinsatz zur Erklärung', () => {
  const css = lies('docs/style.css');
  const ansichten = lies('docs/ansichten.js');
  // Einnahmen netto, Bestand zum Jahresende, Bestand heute und jüngste Inventur gehen in die Rechnung; Start und Blatt nutzen dieselbe Funktion
  assert.match(ansichten, /const extra = \{ einnahmen: u\.einnahmen \|\| null, guv: u\.guv \|\| null, jahresende: u\.jahresende, flaschen: typeof k\.gesamtbestand === 'number' \? k\.gesamtbestand : null,\s*geschaetzt: k\.gesamtQuelle !== 'inventur', inventurAm: inventurAm \};/);
  assert.match(css, /\.dash-zeile\.dash-lagerdiff \{ background: var\(--akzent-weich\); border-radius: 6px; \}/);
  assert.match(ansichten, /const gw = mg && j \? gewinnFuer\(jv\.jahr\) : null;/, 'Start');
  assert.match(ansichten, /const gw = gewinnFuer\(jahr\);/, 'Zahlen, Wahl Gewinn');
  // Lager-Block mit Quelle des Anfangsbestands, Hinweis bei geschätztem Bestand, Aufteilung des Wareneinsatzes
  const block = ansichten.slice(ansichten.indexOf('const lagerBlock = () => {'), ansichten.indexOf("dashTitel('Gewinn ' + gj, gw.fehler"));
  assert.ok(block.length > 1000);
  assert.match(ansichten, /'laut Jahresabschluss ' \+ x\.stichtag\.slice\(0, 4\)/);
  assert.match(ansichten, /'laut Inventur ' \+ H\.datumFormat\(x\.datum\)/);
  assert.match(block, /Bestand teils geschätzt/);
  assert.match(block, /minus Verkauftes und Gebuchtes/);
  assert.match(block, /\{ klasse: 'dash-lagerdiff', zellen: \['Weggekommen', ca\(wg\), eur\(wg\.euro\)\] \}/);
  assert.match(block, /Der Gewinn ist hier nur die GuV in Lexware, ohne Lagerveränderung\./);
  assert.doesNotMatch(block, /[·•]/, 'keine Trennpunkte (Mark)');
  // Schnittstelle: Einnahmen aus Spalte M des Tabs Lexware-Rechnungen
  assert.match(lies('api/src/UebersichtLogik.js'), /const einnahmen = einnahmenLesen\(roh\.lexwareRechnungen, formatieren, hinweise, heute\);/);
  assert.match(lies('api/src/Konfig.js'), /const LR_NETTO_KOPF = 'netto \(€\)';/);
});

test('PWA: Gewinn mit Lexware-GuV (v42) – Treppe aus der GuV, Abgleich in den Monaten, Hinweis ohne Einnahmen', () => {
  const ansichten = lies('docs/ansichten.js');
  const treppe = ansichten.slice(ansichten.indexOf('const gewinnTreppe = () => {'), ansichten.indexOf('teile.push(', ansichten.indexOf('const gewinnTreppe = () => {')));
  ["'Umsatzerlöse'", "'Sonstige Erträge'", "'Materialaufwand'", "'Sonstige Aufwendungen'", "'Zinsen'", "nameMit('Ergebnis', 'laut Lexware')", 'lagerZeile()', 'gewinnName']
    .forEach((x) => assert.ok(treppe.indexOf(x) >= 0, x));
  assert.match(ansichten, /const gewinnName = nameMit\('Gewinn', gw\.fehler \|\| gw\.fehlerEinnahmen \? 'unvollständig' : 'steuerlich'\);/);
  assert.match(ansichten, /\['Abgleich zur GuV', /);
  assert.match(ansichten, /'Einnahmen netto aus Lexware fehlen noch \(Tab „Lexware-Rechnungen“, Spalte „netto \(€\)“\)\. '/);
  assert.match(lies('api/src/Api.js'), /lexwareGuv: guv \? guv\.getDataRange\(\)\.getValues\(\) : null,/);
  assert.doesNotMatch(treppe, /[·•]/);
});
