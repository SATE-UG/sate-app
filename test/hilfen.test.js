'use strict';

const test = require('node:test');
const assert = require('node:assert');
const H = require('../docs/hilfen.js');

test('Code bereinigen und prüfen', () => {
  assert.strictEqual(H.codeBereinigen(' abcd-efgh jkmn '), 'ABCDEFGHJKMN');
  assert.strictEqual(H.codeBereinigen('ABCD–EFGH–JKMN'), 'ABCDEFGHJKMN');
  assert.strictEqual(H.codePruefen('abcd-efgh-jkmn'), '');
  assert.match(H.codePruefen(''), /Zugangscode/);
  assert.match(H.codePruefen('ABC'), /12 Zeichen/);
});

test('Web-App-URL', () => {
  assert.ok(!H.apiUrlGueltig('HIER_WEB_APP_URL_EINTRAGEN'));
  assert.ok(!H.apiUrlGueltig(''));
  assert.ok(!H.apiUrlGueltig(undefined));
  assert.ok(!H.apiUrlGueltig('https://example.com/macros/s/x/exec'));
  assert.ok(!H.apiUrlGueltig('https://script.google.com/macros/s/AKfy/dev'));
  assert.ok(H.apiUrlGueltig('https://script.google.com/macros/s/AKfycbx_abc-123/exec'));
  assert.ok(H.apiUrlGueltig('https://script.google.com/a/macros/trinksate.de/s/AKfycbx_abc-123/exec'));
});

test('Zahlen und Zeit deutsch', () => {
  assert.strictEqual(H.zahlFormat(8041, 0), '8.041');
  assert.strictEqual(H.zahlFormat(7.3, 1), '7,3');
  assert.strictEqual(H.zahlFormat(7, 1), '7,0');
  assert.strictEqual(H.zahlFormat(null, 0), '–');
  assert.strictEqual(H.zeitFormat('2026-11-08T15:05:00.000Z'), '8. November 2026, 16:05 Uhr');
  assert.strictEqual(H.zeitFormat('2026-07-01T10:00:00.000Z'), '1. Juli 2026, 12:00 Uhr', 'Sommerzeit');
  assert.strictEqual(H.zeitFormat('quatsch'), '–');
  assert.strictEqual(H.zeitFormat(''), '–');
});

test('Antwort deuten', () => {
  const ok = H.antwortDeuten(200, JSON.stringify({ ok: true, name: 'Jonas', bestand: 8041, reichweite: 7.3, zeit: 'x' }));
  assert.strictEqual(ok.art, 'ok');
  assert.strictEqual(ok.daten.name, 'Jonas');
  assert.strictEqual(H.antwortDeuten(200, '{"ok":false,"fehler":"Code ungültig"}').art, 'code');
  const f = H.antwortDeuten(200, '{"ok":false,"fehler":"Serverfehler, bitte später nochmal versuchen"}');
  assert.deepStrictEqual(f, { art: 'fehler', meldung: 'Serverfehler, bitte später nochmal versuchen' });
  assert.match(H.antwortDeuten(200, '<html>Anmelden</html>').meldung, /richtig bereitgestellt/);
  assert.match(H.antwortDeuten(500, 'kaputt').meldung, /Fehler 500/);
  assert.strictEqual(H.antwortDeuten(200, '{"ok":false}').meldung, 'Unbekannter Fehler.');
});
