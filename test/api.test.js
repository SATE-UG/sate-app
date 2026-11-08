'use strict';

// Ablauf mit Google-Attrappen: Code anlegen → doPost → sperren, und dass Codes nirgends sonst auftauchen.

const test = require('node:test');
const assert = require('node:assert');
const { ladeAlles, roh } = require('./lade');
const { neueWelt } = require('./google');

function aufbau() {
  const { welt, globals } = neueWelt();
  const k = ladeAlles(globals);
  return { welt, k };
}

/** Code aus der Log-Zeile von codeAnlegen holen. */
function codeAusLog(welt) {
  const m = /Zugangscode für .+?: ([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})/.exec(welt.logs[welt.logs.length - 1]);
  assert.ok(m, 'Code steht im Log');
  return m[1];
}

function post(k, body) {
  const aus = k.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body), type: 'text/plain' } });
  assert.strictEqual(aus.mime, 'application/json');
  return JSON.parse(aus.text);
}

test('doGet: nur kurzer Text, keine Daten, kein Sheet-Zugriff', () => {
  const { welt, k } = aufbau();
  const aus = k.doGet({ parameter: {} });
  assert.match(aus.text, /SATE-App/);
  assert.ok(aus.text.length < 100);
  assert.deepStrictEqual(welt.sheetLesen, []);
});

test('einrichten: liest Übersicht!B10 und loggt den Wert', () => {
  const { welt, k } = aufbau();
  k.einrichten();
  assert.deepStrictEqual(welt.sheetIds, ['test-sheet-id']);
  assert.deepStrictEqual(welt.sheetLesen, ['B10']);
  assert.match(welt.logs[0], /Übersicht!B10 .*= 8041/);
});

test('Sheet-ID fehlt (nur Platzhalter): klare Fehlermeldung', () => {
  const { welt, globals } = neueWelt();
  const k = ladeAlles(globals, 'HIER_SHEET_ID_EINTRAGEN');
  assert.throws(() => k.einrichten(), /LOKAL_SHEET_ID fehlt/);
  assert.deepStrictEqual(welt.sheetIds, []);
});

test('Code anlegen → ping klappt, Code nur einmal im Log, nur Hash gespeichert', () => {
  const { welt, k } = aufbau();
  k.codeAnlegen('  Jonas ');
  const code = codeAusLog(welt);
  assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9-]{14}$/);
  assert.match(welt.props.CODE_SALZ, /^[0-9a-f]{64}$/);
  const eintrag = JSON.parse(welt.props['CODE:Jonas']);
  assert.match(eintrag.hash, /^[0-9a-f]{64}$/);
  assert.strictEqual(eintrag.gesperrt, false);

  const a = post(k, { code: code.toLowerCase(), aktion: 'ping' });
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.name, 'Jonas');
  assert.strictEqual(a.bestand, 8041);
  assert.strictEqual(a.reichweite, 7.3);
  assert.ok(!isNaN(Date.parse(a.zeit)));
  assert.deepStrictEqual(welt.sheetLesen, ['B10:B13']);

  // Code (mit und ohne Bindestriche) taucht außer in der einen Log-Zeile nirgends auf
  const ohne = code.replace(/-/g, '');
  const treffer = welt.alleAusgaben().filter((t) => t.includes(code) || t.includes(ohne));
  assert.strictEqual(treffer.length, 1);
  assert.deepStrictEqual(welt.sheetSchreiben, []);
});

test('Salz bleibt beim zweiten Code gleich, neuer Code für dieselbe Person ersetzt den alten', () => {
  const { welt, k } = aufbau();
  k.codeAnlegen('Jonas');
  const alt = codeAusLog(welt);
  const salz = welt.props.CODE_SALZ;
  k.codeAnlegen('Nina');
  const nina = codeAusLog(welt);
  k.codeAnlegen('Jonas');
  const neu = codeAusLog(welt);
  assert.match(welt.logs[welt.logs.length - 1], /alte Code von Jonas gilt ab sofort nicht mehr/);
  assert.strictEqual(welt.props.CODE_SALZ, salz);
  assert.notStrictEqual(alt, neu);
  assert.deepStrictEqual(post(k, { code: alt, aktion: 'ping' }), { ok: false, fehler: 'Code ungültig' });
  assert.strictEqual(post(k, { code: neu, aktion: 'ping' }).name, 'Jonas');
  assert.strictEqual(post(k, { code: nina, aktion: 'ping' }).name, 'Nina');
});

test('codeAnlegen ohne Namen: Fehler mit Hinweis, nichts gespeichert', () => {
  const { welt, k } = aufbau();
  assert.throws(() => k.codeAnlegen(), /codeAnlegen\('Jonas'\)/);
  assert.throws(() => k.codeAnlegen('   '), /Name fehlt/);
  assert.deepStrictEqual(welt.props, {});
});

test('codeSperren: danach „Code ungültig“, codesAnzeigen ohne Codes und Hashes', () => {
  const { welt, k } = aufbau();
  k.codeAnlegen('Jonas');
  const code = codeAusLog(welt);
  k.codeAnlegen('Nina');
  k.codeSperren('Jonas');
  assert.deepStrictEqual(post(k, { code: code, aktion: 'ping' }), { ok: false, fehler: 'Code ungültig' });
  assert.throws(() => k.codeSperren('Unbekannt'), /Vorhanden: Jonas, Nina/);

  welt.logs.length = 0;
  k.codesAnzeigen();
  assert.match(welt.logs[0], /^Jonas: gesperrt seit \d{4}-\d\d-\d\d\nNina: aktiv seit \d{4}-\d\d-\d\d$/);
  const hashes = [JSON.parse(welt.props['CODE:Jonas']).hash, JSON.parse(welt.props['CODE:Nina']).hash, welt.props.CODE_SALZ];
  for (const h of hashes) assert.ok(!welt.logs[0].includes(h));
});

test('codesAnzeigen ohne Codes', () => {
  const { welt, k } = aufbau();
  k.codesAnzeigen();
  assert.deepStrictEqual(welt.logs, ['Noch keine Zugangscodes angelegt.']);
});

test('doPost: Müll, leerer Body, falscher Code → JSON-Fehler, kein Sheet-Zugriff, nichts geloggt', () => {
  const { welt, k } = aufbau();
  k.codeAnlegen('Jonas');
  welt.logs.length = 0;
  assert.deepStrictEqual(post(k, 'quatsch'), { ok: false, fehler: 'Ungültige Anfrage' });
  assert.deepStrictEqual(post(k, { code: 'ABCD-EFGH-JKMN', aktion: 'ping' }), { ok: false, fehler: 'Code ungültig' });
  const leer = JSON.parse(k.doPost({}).text);
  assert.deepStrictEqual(leer, { ok: false, fehler: 'Ungültige Anfrage' });
  assert.deepStrictEqual(welt.sheetLesen, []);
  assert.deepStrictEqual(welt.logs, []);
  assert.deepStrictEqual(welt.fehlerLogs, []);
});

test('doPost: Fehler beim Sheet → Serverfehler, Log ohne Code', () => {
  const { welt, k } = aufbau();
  k.codeAnlegen('Jonas');
  const code = codeAusLog(welt);
  welt.tabFehlt = true;
  assert.deepStrictEqual(post(k, { code: code, aktion: 'ping' }), { ok: false, fehler: 'Serverfehler, bitte später nochmal versuchen' });
  assert.strictEqual(welt.fehlerLogs.length, 1);
  assert.ok(!welt.fehlerLogs[0].includes(code.replace(/-/g, '')) && !welt.fehlerLogs[0].includes(code));
});

test('ohne Salz (noch kein Code angelegt) → „Code ungültig“', () => {
  const { k } = aufbau();
  assert.deepStrictEqual(roh(post(k, { code: 'ABCD-EFGH-JKMN', aktion: 'ping' })), { ok: false, fehler: 'Code ungültig' });
});
