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

// Aktion uebersicht, Tab Lager, Trigger (synthetische Tabs aus test/daten.js) ---------------------------------

const D = require('./daten');

/** Welt mit allen Tabs (erfundene Werte) und einem Code für Jonas. */
function mitTabs() {
  const { welt, k } = aufbau();
  welt.tabs['Verkäufe'] = [D.verkaufKopf(),
    D.altzeile(2026, 8, 'Karlsruhe', 'Bar Eins', 300, 360),
    D.rechnungszeile(2026, 10, 2, 'Berlin', 'Späti Zwei', 48, 55.5),
    D.rechnungszeile(2026, 11, 4, 'Karlsruhe', 'Dörflinger Test', 120, 140)];
  welt.zellen.B9 = 468;
  welt.tabs['Lager-Log'] = [D.lagerKopf(),
    [D.zelle(2026, 10, 31), 'Lager Süd', 'Inventur', 2000, '', 'Mark', '', new Date('2026-10-31T17:00:00Z'), 'i1', ''],
    [D.zelle(2026, 10, 31), 'Lager Nord', 'Inventur', 100, '', 'Dave', '', '', 'i2', ''],
    [D.zelle(2026, 11, 2), 'Lager Süd', 'Umlagerung', 50, 'Lager Nord', 'Mark', '', '', 'u1', '']];
  welt.tabs['App-Einstellungen'] = D.einstellungen();
  welt.tabs['Abfüllungen'] = [['Abfüllung', 'Monat', 'Flaschen'], ['1. Abfüllung', D.serie(2026, 7, 1), 3000]];
  welt.tabs['Lager'] = [['Standort', 'Bestand (Flaschen)', 'Kisten', 'Letzte Inventur', 'Schwund bei letzter Inventur', 'Stand'],
    ['Lager Süd', '', '', 'noch keine'], ['Lager Nord', '', '', 'noch keine'], ['Lager Ost', '', '', 'noch keine'], ['Summe'], [],
    ['Hinweis', 'nicht ändern']];
  k.codeAnlegen('Jonas');
  return { welt, k, code: codeAusLog(welt) };
}

test('doPost uebersicht: Kennzahlen, Lager, Verkäufe, Bestellung als JSON, nichts geschrieben', () => {
  const { welt, k, code } = mitTabs();
  welt.sheetLesen.length = 0;
  const a = post(k, { code: code, aktion: 'uebersicht' });
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.strictEqual(a.name, 'Jonas');
  assert.strictEqual(a.kennzahlen.verkauft, 468);
  assert.strictEqual(a.kennzahlen.gesamtQuelle, 'rechnerisch', 'Lager Ost hat noch keine Inventur');
  assert.strictEqual(a.kennzahlen.gesamtbestand, 8041);
  assert.strictEqual(a.kennzahlen.bestandGezaehlt, 2100);
  // Dörflinger-Rechnung 04.11. zählt am 31.10. → nicht nach der Inventur
  assert.deepStrictEqual(a.lager.map((s) => s.bestand), [1950, 150, null]);
  assert.strictEqual(a.lager[0].letzteInventur, '2026-10-31');
  assert.strictEqual(a.verkaeufe.monate.length, 13);
  assert.ok(['ok', 'bald', 'jetzt bestellen'].includes(a.bestellung.status));
  assert.match(a.hinweise[0], /Noch keine Inventur bei Lager Ost/);
  assert.deepStrictEqual(welt.sheetSchreiben, []);
  // jeder Tab genau einmal gelesen
  assert.deepStrictEqual(welt.sheetLesen.slice().sort(), ['Abfüllungen!alles', 'App-Einstellungen!alles', 'B8:B13',
    'Lager-Log!alles', 'Verkäufe!alles'].sort());
  assert.ok(JSON.stringify(a).length < 20000, 'Antwort kompakt');
});

test('doPost uebersicht: falscher Code liest nichts, fehlender Tab → Serverfehler', () => {
  const { welt, k, code } = mitTabs();
  welt.sheetLesen.length = 0;
  assert.deepStrictEqual(post(k, { code: 'ABCD-EFGH-JKMN', aktion: 'uebersicht' }), { ok: false, fehler: 'Code ungültig' });
  assert.deepStrictEqual(welt.sheetLesen, []);
  delete welt.tabs['Lager-Log'];
  assert.deepStrictEqual(post(k, { code: code, aktion: 'uebersicht' }), { ok: false, fehler: 'Serverfehler, bitte später nochmal versuchen' });
  // ping geht weiter
  assert.strictEqual(post(k, { code: code, aktion: 'ping' }).bestand, 8041);
});

test('lagerTabSchreiben / taeglich: nur Lager!B2:F5, Datum als Datum, Formate', () => {
  const { welt, k } = mitTabs();
  k.taeglich();
  assert.deepStrictEqual(welt.sheetSchreiben, ['Lager!B2:F5']);
  const lager = welt.tabs['Lager'];
  assert.deepStrictEqual(lager[1].slice(0, 3), ['Lager Süd', 1950, 81.3]);
  assert.strictEqual(Object.prototype.toString.call(lager[1][3]), '[object Date]');
  assert.strictEqual(D.berlin(lager[1][3]), '2026-10-31', 'Inventurdatum als Datum (Mitternacht Berlin)');
  assert.strictEqual(lager[1][4], '', 'erste Inventur: kein Schwund');
  assert.strictEqual(Object.prototype.toString.call(lager[1][5]), '[object Date]', 'Stand = jetzt');
  assert.deepStrictEqual(lager[3].slice(1, 5), ['', '', 'noch keine', '']);
  assert.deepStrictEqual(lager[4].slice(0, 4), ['Summe', 2100, 87.5, '2 von 3 gezählt']);
  assert.deepStrictEqual(lager[6], ['Hinweis', 'nicht ändern'], 'Hinweis bleibt');
  assert.strictEqual(welt.formate['Lager!B2:F5'].length, 4);
  assert.deepStrictEqual(roh(welt.formate['Lager!B2:F5'][0]), roh(k.__k.LAGER_FORMATE));
  assert.match(welt.logs[welt.logs.length - 1], /Lager!B2:F5 geschrieben: Lager Süd 1950, Lager Nord 150, Lager Ost noch keine Inventur/);
});

test('triggerEinrichten: neuer Trigger 7 Uhr Berlin, alte gleichnamige erst danach gelöscht, fremde bleiben', () => {
  const { welt, k } = aufbau();
  const alt = k.ScriptApp.newTrigger('taeglich').timeBased().everyDays(1).atHour(3).create();
  const fremd = k.ScriptApp.newTrigger('anderes').timeBased().everyDays(1).atHour(5).create();
  k.triggerEinrichten();
  assert.strictEqual(welt.trigger.length, 2);
  assert.ok(welt.trigger.includes(fremd));
  assert.ok(!welt.trigger.includes(alt));
  const neu = welt.trigger.find((t) => t.getHandlerFunction() === 'taeglich');
  assert.deepStrictEqual(neu.daten, { fn: 'taeglich', tage: 1, stunde: 7, zone: 'Europe/Berlin' });
  assert.match(welt.logs[welt.logs.length - 1], /1 alte gelöscht/);
  k.triggerEinrichten();
  assert.strictEqual(welt.trigger.filter((t) => t.getHandlerFunction() === 'taeglich').length, 1);
});
