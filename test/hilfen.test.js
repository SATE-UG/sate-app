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

test('Antwort deuten: Rückfrage bei brauchtBestaetigung', () => {
  const b = H.antwortDeuten(200, JSON.stringify({ ok: false, brauchtBestaetigung: true, warnung: 'Danach wäre der Bestand negativ: Lager Süd -2 Flaschen. Trotzdem eintragen?' }));
  assert.deepStrictEqual(b, { art: 'bestaetigen', warnung: 'Danach wäre der Bestand negativ: Lager Süd -2 Flaschen. Trotzdem eintragen?' });
  assert.strictEqual(H.antwortDeuten(200, '{"ok":false,"brauchtBestaetigung":true}').warnung, 'Trotzdem speichern?');
  assert.strictEqual(H.antwortDeuten(200, '{"ok":false,"brauchtBestaetigung":"ja","fehler":"x"}').art, 'fehler', 'nur echtes true');
  assert.strictEqual(H.antwortDeuten(200, '{"ok":true}').art, 'fehler', 'ok ohne Name gilt nicht');
});

test('Zahlen, Euro, Kisten, Datum und Monate deutsch', () => {
  assert.strictEqual(H.euroFormat(12345.67), '12.346 €');
  assert.strictEqual(H.euroFormat(null), '–');
  assert.strictEqual(H.kistenFormat(12), '12');
  assert.strictEqual(H.kistenFormat(12.54), '12,5');
  assert.strictEqual(H.kistenFormat(1234.5), '1.234,5');
  assert.strictEqual(H.datumFormat('2026-11-08'), '08.11.2026');
  assert.strictEqual(H.datumFormat('2026-02-30'), '–');
  assert.strictEqual(H.datumFormat(null), '–');
  assert.strictEqual(H.monatFormat('2026-03'), 'Mär');
  assert.strictEqual(H.monatFormat('2026-03', true), 'März 2026');
  assert.strictEqual(H.monatFormat('2026-13'), '–');
  assert.strictEqual(H.zeitraumFormat('2025-11', '2026-10'), 'Nov 2025 – Okt 2026');
  assert.strictEqual(H.zeitraumFormat('2026-01', '2026-01'), 'Jan 2026');
  assert.strictEqual(H.zeitraumFormat(null, '2026-01'), '');
});

test('Heute in Berlin, Tage rechnen', () => {
  assert.strictEqual(H.heuteBerlin(new Date('2026-11-08T23:30:00Z')), '2026-11-09', 'nach Mitternacht Berlin');
  assert.strictEqual(H.heuteBerlin(new Date('2026-07-01T21:59:00Z')), '2026-07-01', 'Sommerzeit');
  assert.strictEqual(H.tagePlus('2026-11-08', 1), '2026-11-09');
  assert.strictEqual(H.tagePlus('2026-11-08', -400), '2025-10-04');
  assert.strictEqual(H.tagePlus('2026-03-28', 2), '2026-03-30', 'über die Zeitumstellung');
  assert.strictEqual(H.tageZwischen('2026-11-08', '2026-11-10'), 2);
  assert.strictEqual(H.tageZwischen('2026-11-08', '2025-10-04'), -400);
});

test('Bestellstatus als Stufe', () => {
  assert.deepStrictEqual(H.bestellStufe('jetzt bestellen'), { stufe: 'jetzt', text: 'Jetzt bestellen!' });
  assert.strictEqual(H.bestellStufe('bald').stufe, 'bald');
  assert.strictEqual(H.bestellStufe('ok').stufe, 'ok');
  assert.strictEqual(H.bestellStufe(null).stufe, '');
});

test('Flaschen-Eingabe mit Kisten-Hilfe', () => {
  assert.strictEqual(H.ganzeZahlEingabe(''), 0);
  assert.strictEqual(H.ganzeZahlEingabe(' 12 '), 12);
  assert.strictEqual(H.ganzeZahlEingabe('1.200'), 1200);
  assert.strictEqual(H.ganzeZahlEingabe('1 200'), 1200);
  for (const x of ['1,5', '-3', '1.5', '12a', '1e3', '12345678']) assert.strictEqual(H.ganzeZahlEingabe(x), null, x);
  assert.deepStrictEqual(H.flaschenAusEingabe('3', '7', 24), { flaschen: 79, leer: false });
  assert.deepStrictEqual(H.flaschenAusEingabe('', '', 24), { flaschen: 0, leer: true });
  assert.deepStrictEqual(H.flaschenAusEingabe('', '0', 24), { flaschen: 0, leer: false }, 'Inventur mit 0');
  assert.deepStrictEqual(H.flaschenAusEingabe('2', '', 24), { flaschen: 48, leer: false });
  assert.match(H.flaschenAusEingabe('x', '', 24).fehler, /Kisten/);
  assert.match(H.flaschenAusEingabe('', '1,5', 24).fehler, /Flaschen/);
  assert.match(H.flaschenAusEingabe('2', '', null).fehler, /pro Kiste unbekannt/);
  assert.deepStrictEqual(H.flaschenAusEingabe('', '5', null), { flaschen: 5, leer: false });
  assert.strictEqual(H.kistenText(79, 24), '79 Flaschen = 3 Kisten + 7 Flaschen');
  assert.strictEqual(H.kistenText(48, 24), '48 Flaschen = 2 Kisten');
  assert.strictEqual(H.kistenText(25, 24), '25 Flaschen = 1 Kiste + 1 Flasche');
  assert.strictEqual(H.kistenText(1, 24), '1 Flasche');
  assert.strictEqual(H.kistenText(2400, 24), '2.400 Flaschen = 100 Kisten');
  assert.strictEqual(H.kistenText(30, null), '30 Flaschen');
  assert.strictEqual(H.kistenText(-1, 24), '');
});

test('Buchung prüfen wie die Schnittstelle', () => {
  const orte = ['Lager Süd', 'Lager Nord'];
  const heute = '2026-11-08';
  const gut = { art: 'Promo', standort: 'Lager Süd', nach: '', flaschen: 12, datum: heute, kommentar: '' };
  const p = (x) => H.buchungPruefen(Object.assign({}, gut, x), orte, heute);
  assert.strictEqual(p({}), '');
  assert.match(p({ art: 'Storno' }), /wähle aus/);
  assert.match(p({ art: '' }), /wähle aus/);
  assert.match(p({ standort: '' }), /Standort/);
  assert.match(p({ standort: 'Keller' }), /Standort/);
  assert.match(p({ art: 'Umlagerung' }), /wohin/);
  assert.match(p({ art: 'Umlagerung', nach: 'Lager Süd' }), /gleich/);
  assert.strictEqual(p({ art: 'Umlagerung', nach: 'Lager Nord' }), '');
  assert.match(p({ flaschen: 0 }), /von 1 bis 50\.000/);
  assert.strictEqual(p({ art: 'Inventur', flaschen: 0 }), '', 'Inventur darf 0');
  assert.match(p({ art: 'Inventur', flaschen: 50001 }), /von 0 bis 50\.000/);
  assert.match(p({ flaschen: 1.5 }), /ganze Zahl/);
  assert.strictEqual(p({ flaschen: 50000 }), '');
  assert.match(p({ datum: '' }), /gültiges Datum/);
  assert.match(p({ datum: '2026-02-30' }), /gültiges Datum/);
  assert.strictEqual(p({ datum: '2026-11-09' }), '', 'morgen geht');
  assert.match(p({ datum: '2026-11-10' }), /Zukunft/);
  assert.strictEqual(p({ datum: '2025-10-04' }), '', '400 Tage zurück geht');
  assert.match(p({ datum: '2025-10-03' }), /400 Tage/);
  assert.strictEqual(p({ kommentar: 'x'.repeat(200) }), '');
  assert.match(p({ kommentar: 'x'.repeat(201) }), /200 Zeichen/);
  assert.strictEqual(p({ kommentar: '🍹'.repeat(200) }), '', 'Emoji zählt als ein Zeichen');
  assert.deepStrictEqual(H.ARTEN.map((a) => a.art), ['Inventur', 'Umlagerung', 'Promo', 'Eigenverbrauch', 'Bruch', 'Abfüllung']);
  assert.ok(H.ARTEN.every((a) => a.text.length > 10));
  assert.strictEqual(H.buchungText({ art: 'Umlagerung', flaschen: 48, standort: 'Lager Süd', nach: 'Lager Nord' }),
    'Umlagerung: 48 Flaschen von Lager Süd nach Lager Nord');
  assert.strictEqual(H.buchungText({ art: 'Bruch', flaschen: 1, standort: 'Lager Süd' }), 'Bruch: 1 Flasche bei Lager Süd');
});

test('Anfrage-ID passt zum Muster der Schnittstelle', () => {
  const id = H.anfrageIdAus(new Uint8Array([0, 1, 15, 16, 255, 128, 7, 200, 9, 10, 11, 12, 13, 14, 15, 16]));
  assert.strictEqual(id, '00010f10ff8007c8090a0b0c0d0e0f10');
  assert.match(id, /^[A-Za-z0-9_-]{8,64}$/);
  assert.strictEqual(H.anfrageIdAus([-1, 300]), 'ff2c', 'vorzeichenbehaftet und zu groß');
});

test('Diagramm: schöne Achse und Balkenmaße', () => {
  assert.deepStrictEqual(H.achse(0), { max: 1, schritt: 1, striche: [0, 1] });
  assert.deepStrictEqual(H.achse(1234), { max: 1500, schritt: 500, striche: [0, 500, 1000, 1500] });
  assert.deepStrictEqual(H.achse(400), { max: 400, schritt: 100, striche: [0, 100, 200, 300, 400] });
  assert.deepStrictEqual(H.achse(7.3).striche, [0, 2, 4, 6, 8]);
  assert.deepStrictEqual(H.achse(0.3).striche, [0, 0.1, 0.2, 0.3]);
  const m = { breite: 340, hoehe: 200, links: 40, unten: 30, oben: 10, luecke: 4 };
  const d = H.diagrammMasse([100, 200, null, -50], m);
  assert.strictEqual(d.basis, 170);
  assert.strictEqual(d.platz, 75);
  assert.deepStrictEqual(d.striche.map((s) => s.wert), [0, 50, 100, 150, 200]);
  assert.deepStrictEqual(d.striche.map((s) => s.y), [170, 130, 90, 50, 10]);
  assert.deepStrictEqual(d.balken[0], { x: 42, y: 90, b: 71, h: 80, wert: 100 });
  assert.deepStrictEqual(d.balken[1], { x: 117, y: 10, b: 71, h: 160, wert: 200 });
  assert.strictEqual(d.balken[2].h, 0, 'null → 0');
  assert.strictEqual(d.balken[3].h, 0, 'Gutschrift zeichnet als 0');
  assert.strictEqual(d.balken[3].wert, -50);
  // alle Balken in der Fläche
  for (const b of d.balken) assert.ok(b.x >= m.links && b.x + b.b <= m.breite && b.y >= m.oben && b.y + b.h <= d.basis + 1e-9);
  assert.strictEqual(H.diagrammMasse([0, 0], m).balken[0].h, 0, 'alles 0: keine Division durch 0');
  assert.strictEqual(H.achsenText(1500), '1.500');
  assert.strictEqual(H.achsenText(12000), '12 Tsd.');
  assert.strictEqual(H.achsenText(12500), '12,5 Tsd.');
});

test('Übersicht erkennen und Stände vergleichen', () => {
  const u = { stand: '2026-11-08T10:00:00.000Z', kennzahlen: {}, bestellung: {}, lager: [], verkaufListe: [], hinweise: [],
    verkaeufe: { monate: [], letzte12: {}, jahr: {} } };
  assert.ok(H.uebersichtGueltig(u));
  assert.ok(!H.uebersichtGueltig(null));
  assert.ok(!H.uebersichtGueltig(Object.assign({}, u, { lager: null })));
  assert.ok(!H.uebersichtGueltig(Object.assign({}, u, { verkaeufe: { monate: [] } })));
  assert.ok(!H.uebersichtGueltig({ ok: true, name: 'Jonas', bestand: 1 }), 'alte ping-Antwort');
  assert.ok(H.neuer('2026-11-08T10:00:01Z', '2026-11-08T10:00:00Z'));
  assert.ok(H.neuer('2026-11-08T10:00:00Z', '2026-11-08T10:00:00Z'), 'gleich alt zählt');
  assert.ok(!H.neuer('2026-11-08T09:00:00Z', '2026-11-08T10:00:00Z'));
  assert.ok(H.neuer('2026-11-08T09:00:00Z', undefined));
  assert.ok(!H.neuer('quatsch', '2026-11-08T10:00:00Z'));
});
