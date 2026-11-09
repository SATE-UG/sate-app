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
  assert.deepStrictEqual(H.bestellStufe('jetzt bestellen'), { stufe: 'jetzt', text: 'Jetzt bestellen' });
  assert.deepStrictEqual(H.bestellStufe('bald'), { stufe: 'bald', text: 'Bald bestellen' });
  assert.deepStrictEqual(H.bestellStufe('ok'), { stufe: 'ok', text: 'Alles gut' });
  assert.strictEqual(H.bestellStufe(null).stufe, '');
});

test('Datum lang und Reichweiten-Balken (Bestell-Karte)', () => {
  assert.strictEqual(H.datumText('2027-01-26'), '26. Jan 2027');
  assert.strictEqual(H.datumText('2026-03-05'), '5. Mär 2026');
  assert.strictEqual(H.datumText('2026-02-30'), '–');
  assert.strictEqual(H.datumText(null), '–');
  assert.deepStrictEqual(H.reichweiteBalken(6, 3, 0), { fuell: 50, grenze: 25 });
  assert.deepStrictEqual(H.reichweiteBalken(20, 2, 2), { fuell: 100, grenze: 20.5 }, 'über 12 Monate voll, 2 Wochen ≈ 0,46 Monate');
  assert.deepStrictEqual(H.reichweiteBalken(-1, null, null), { fuell: 0, grenze: 0 });
  assert.deepStrictEqual(H.reichweiteBalken(3, 1, 0, 6), { fuell: 50, grenze: 16.7 });
  assert.strictEqual(H.reichweiteBalken(null, 2, 2), null);
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
  assert.strictEqual(p({ datum: heute }), '', 'heute geht');
  assert.strictEqual(p({ datum: '2026-11-09' }), 'Das Datum liegt in der Zukunft (höchstens heute).', 'morgen nicht mehr');
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
    verkaeufe: { monate: [], jahr: {}, vorjahr: {}, gesamt: {} } };
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

test('Kisten teilen: volle Kisten und Rest', () => {
  assert.deepStrictEqual(H.kistenTeilen(3400, 24), { kisten: 141, rest: 16 });
  assert.deepStrictEqual(H.kistenTeilen(48, 24), { kisten: 2, rest: 0 });
  assert.deepStrictEqual(H.kistenTeilen(5, 24), { kisten: 0, rest: 5 });
  assert.strictEqual(H.kistenTeilen(-3, 24), null);
  assert.strictEqual(H.kistenTeilen(100, null), null);
  assert.strictEqual(H.kistenTeilen(100, 0), null);
});

test('Relative Zeit für „Aktualisiert vor …“', () => {
  const jetzt = new Date('2026-11-08T15:00:00.000Z');
  const vor = (ms) => new Date(jetzt.getTime() - ms).toISOString();
  assert.strictEqual(H.relativZeit(vor(0), jetzt), 'gerade eben');
  assert.strictEqual(H.relativZeit(vor(59 * 1000), jetzt), 'gerade eben');
  assert.strictEqual(H.relativZeit(vor(-2 * 60000), jetzt), 'gerade eben', 'Uhr des Servers geht leicht vor');
  assert.strictEqual(H.relativZeit(vor(60 * 1000), jetzt), 'vor 1 Min.');
  assert.strictEqual(H.relativZeit(vor(5 * 60000 + 30000), jetzt), 'vor 5 Min.');
  assert.strictEqual(H.relativZeit(vor(59 * 60000), jetzt), 'vor 59 Min.');
  assert.strictEqual(H.relativZeit(vor(60 * 60000), jetzt), 'vor 1 Std.');
  assert.strictEqual(H.relativZeit(vor(2.5 * 3600000), jetzt), 'vor 2 Std.');
  assert.strictEqual(H.relativZeit(vor(23.9 * 3600000), jetzt), 'vor 23 Std.');
  assert.strictEqual(H.relativZeit('2026-11-06T13:05:00.000Z', jetzt), 'am 6. Nov 2026, 14:05 Uhr', 'älter als ein Tag: Datum (Berlin)');
  assert.strictEqual(H.relativZeit('2026-11-08T16:00:00.000Z', jetzt), 'am 8. Nov 2026, 17:00 Uhr', 'weit in der Zukunft: Datum');
  assert.strictEqual(H.relativZeit('quatsch', jetzt), '');
  assert.strictEqual(H.relativZeit('', jetzt), '');
  assert.strictEqual(H.relativZeit(vor(3 * 60000), jetzt.getTime()), 'vor 3 Min.', 'jetzt als Zahl');
});

test('Trends: Monate rechnen, Prozent, Richtung', () => {
  assert.strictEqual(H.monatPlus('2026-01', -1), '2025-12');
  assert.strictEqual(H.monatPlus('2026-11', -12), '2025-11');
  assert.strictEqual(H.monatPlus('2025-12', 1), '2026-01');
  assert.strictEqual(H.monatPlus('2026-13', 1), '');
  assert.strictEqual(H.veraenderung(120, 100), 20);
  assert.strictEqual(H.veraenderung(80, 100), -20);
  assert.strictEqual(H.veraenderung(100, 100), 0);
  assert.ok(Object.is(H.veraenderung(99.9, 100), 0), 'kein −0');
  assert.strictEqual(H.veraenderung(0, 100), -100);
  assert.strictEqual(H.veraenderung(1, 3), -67, 'gerundet');
  assert.strictEqual(H.veraenderung(100, 0), null, 'Vergleich 0: keine Prozent');
  assert.strictEqual(H.veraenderung(100, -12), null, 'Gutschrift-Monat');
  assert.strictEqual(H.veraenderung(null, 100), null);
  assert.strictEqual(H.prozentText(12), '+12 %');
  assert.strictEqual(H.prozentText(-5), '−5 %');
  assert.strictEqual(H.prozentText(0), '±0 %');
  assert.strictEqual(H.prozentText(1234), '+1.234 %');
  assert.strictEqual(H.prozentText(null), '');
  assert.deepStrictEqual([H.richtung(3), H.richtung(-1), H.richtung(0), H.richtung(null)], ['hoch', 'runter', 'gleich', '']);
});

test('Trends: Vormonat und Vorjahresmonat aus den 13 Monaten', () => {
  const monate = [];
  for (let i = 0; i < 13; i++) {
    const m = H.monatPlus('2025-11', i);
    monate.push({ monat: m, flaschen: 100 + i * 10, umsatz: (100 + i * 10) * 2 });
  }
  monate[5].flaschen = 0;
  // Laufender Monat (Nov 2026): nicht vergleichen, obwohl Nov 2025 in den Daten steht
  assert.deepStrictEqual(H.monatsTrend(monate, 12, 'flaschen'),
    { monat: '2026-11', wert: 220, laufend: true, vormonat: null, vorjahr: null });
  // Letzter voller Monat (Okt 2026): Vormonat ja, Vorjahresmonat (Okt 2025) liegt außerhalb der 13 Monate
  assert.deepStrictEqual(H.monatsTrend(monate, 11, 'flaschen'),
    { monat: '2026-10', wert: 210, laufend: false, vormonat: { monat: '2026-09', wert: 200, prozent: 5 }, vorjahr: null });
  assert.strictEqual(H.monatsTrend(monate, 11, 'umsatz').vormonat.wert, 400, 'Umsatz');
  assert.strictEqual(H.monatsTrend(monate, 6, 'flaschen').vormonat, null, 'Vormonat 0 Flaschen: kein Vergleich');
  assert.strictEqual(H.monatsTrend(monate, 0, 'flaschen').vormonat, null, 'erster Monat: Vormonat fehlt');
  // Kommen später mehr Monate (z. B. 25), wird der Vorjahresmonat automatisch verglichen
  const lang = [{ monat: '2025-10', flaschen: 300, umsatz: 600 }].concat(monate);
  assert.deepStrictEqual(H.monatsTrend(lang, 12, 'flaschen').vorjahr, { monat: '2025-10', wert: 300, prozent: -30 });
  assert.strictEqual(H.monatsTrend(monate, 13, 'flaschen'), null);
  assert.strictEqual(H.monatsTrend(null, 0, 'flaschen'), null);
});

test('Ansichten-Leiste: aktive Ansicht und Einrasten, Ziehen-Richtung, Gummiband', () => {
  const p = (links) => H.reiterPosition(links, 390, 4);
  assert.deepStrictEqual(p(0), { index: 0, eingerastet: true });
  assert.deepStrictEqual(p(390), { index: 1, eingerastet: true });
  assert.deepStrictEqual(p(1170), { index: 3, eingerastet: true });
  assert.deepStrictEqual(p(389.6667), { index: 1, eingerastet: true }, 'Bruchteile von Pixeln zählen als eingerastet');
  assert.deepStrictEqual(p(194), { index: 0, eingerastet: false }, 'knapp unter der Hälfte: noch die erste');
  assert.deepStrictEqual(p(196), { index: 1, eingerastet: false }, 'über der Hälfte: schon die zweite');
  assert.deepStrictEqual(p(-40), { index: 0, eingerastet: false }, 'Gummiband am linken Rand');
  assert.deepStrictEqual(p(1250), { index: 3, eingerastet: false }, 'Gummiband am rechten Rand');
  assert.strictEqual(H.reiterPosition(100, 0, 4), null, 'versteckt (Breite 0)');
  assert.strictEqual(H.reiterPosition(NaN, 390, 4), null);
  assert.strictEqual(H.reiterPosition(0, 390, 0), null);
  assert.strictEqual(H.ziehRichtung(2, 8), '', 'unter 10 px noch offen');
  assert.strictEqual(H.ziehRichtung(3, 20), 'ziehen');
  assert.strictEqual(H.ziehRichtung(14, 20), 'aus', 'zu schräg (20 < 1,5 × 14)');
  assert.strictEqual(H.ziehRichtung(30, 5), 'aus', 'waagerecht: Wischen macht der Browser');
  assert.strictEqual(H.ziehRichtung(0, -20), 'aus', 'nach oben: normales Scrollen');
  assert.strictEqual(H.gummiband(0), 0);
  assert.strictEqual(H.gummiband(-20), 0);
  assert.ok(H.gummiband(10) > 9 && H.gummiband(10) < 10, 'am Anfang fast 1:1');
  assert.ok(H.gummiband(108) >= 70 && H.gummiband(100) < 70, 'Schwelle 70 px nach gut 100 px Fingerweg');
  assert.ok(H.gummiband(5000) < 200, 'nie über das Maximum');
  assert.ok(H.gummiband(300) - H.gummiband(200) < H.gummiband(100) - H.gummiband(0), 'wird zäher');
});

test('Trend: Vorjahresmonat aus den Vergleichsmonaten davor', () => {
  const monate = [];
  for (let i = 0; i < 13; i++) monate.push({ monat: H.monatPlus('2025-11', i), flaschen: 100 + i, umsatz: 0 });
  const frueher = [{ monat: '2025-10', flaschen: 200, umsatz: 0 }];
  // Okt 2026 (Index 11) mit 111 Flaschen gegen Okt 2025 mit 200
  const t = H.monatsTrend(monate, 11, 'flaschen', frueher);
  assert.strictEqual(t.vorjahr.monat, '2025-10');
  assert.strictEqual(t.vorjahr.wert, 200);
  assert.strictEqual(H.monatsTrend(monate, 11, 'flaschen').vorjahr, null, 'ohne Vergleichsmonate kein Vorjahr');
  assert.strictEqual(H.monatsTrend(monate, 11, 'flaschen', null).vorjahr, null);
});

test('Feinschliff: Zeitraum kurz, laufender Monat, Kisten klein, Anteile, kurzes Datum', () => {
  assert.strictEqual(H.monateAnzahl('2026-05', '2026-10'), 6);
  assert.strictEqual(H.monateAnzahl('2025-11', '2026-02'), 4, 'über den Jahreswechsel');
  assert.strictEqual(H.monateAnzahl('2026-10', '2026-05'), null);
  assert.strictEqual(H.zeitraumKurz('2026-05', '2026-10'), 'letzte 6 Monate');
  assert.strictEqual(H.zeitraumKurz('2026-10', '2026-10'), 'letzter voller Monat');
  assert.strictEqual(H.zeitraumKurz(null, '2026-10'), '');

  const monate = [{ monat: '2026-10', flaschen: 900 }, { monat: '2026-11', flaschen: 120 }];
  assert.deepStrictEqual(H.monatBisher(monate, '2026-11-08'), { monat: '2026-11', flaschen: 120 });
  assert.strictEqual(H.monatBisher(monate, '2026-12-01'), null, 'laufender Monat fehlt');
  assert.strictEqual(H.monatBisher(null, '2026-11-08'), null);

  assert.strictEqual(H.kistenKurz(8041, 24, false), '335 Kisten + 1 Fl.');
  assert.strictEqual(H.kistenKurz(8040, 24, false), '335 Kisten');
  assert.strictEqual(H.kistenKurz(8041, 24, true), '≈ 335 Kisten');
  assert.strictEqual(H.kistenKurz(30, 24, false), '1 Kiste + 6 Fl.');
  assert.strictEqual(H.kistenKurz(10, 24, false), '', 'unter einer Kiste');
  assert.strictEqual(H.kistenKurz(5, 24, true), '');
  assert.strictEqual(H.kistenKurz(-5, 24, true), '');
  assert.strictEqual(H.kistenKurz(100, null, true), '');

  assert.strictEqual(H.anteileSinnvoll([{ bestand: 300 }, { bestand: null }, { bestand: null }]), false, 'nur einer gezählt: kein 100-%-Balken');
  assert.strictEqual(H.anteileSinnvoll([{ bestand: 300 }, { bestand: 0 }]), false);
  assert.strictEqual(H.anteileSinnvoll([{ bestand: 300 }, { bestand: 20 }]), true);

  assert.strictEqual(H.datumKurz('2026-11-03'), '3. Nov');
  assert.strictEqual(H.datumKurz('quatsch'), '–');
});

test('Feinschliff: Hinweis „Noch keine Inventur“ freundlich, andere unverändert (Texte wie in UebersichtLogik.js)', () => {
  const quelle = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'api', 'src', 'UebersichtLogik.js'), 'utf8');
  assert.ok(quelle.includes("'Noch keine Inventur bei ' + gesamt.fehlen.join(', ') + ': Gesamtbestand ist der rechnerische aus der Übersicht.'"),
    'Server-Text hat sich geändert: hinweiseOrdnen anpassen');
  assert.ok(quelle.includes("'Noch keine Inventur: Gesamtbestand ist der rechnerische aus der Übersicht (ohne Promo, Eigenverbrauch, Bruch).'"));

  const teil = H.hinweiseOrdnen(['Noch keine Inventur bei Lager Nord, Lager Ost: Gesamtbestand ist der rechnerische aus der Übersicht.',
    'Lager-Log Zeile 7: Art „X“ unbekannt, zählt nicht.']);
  assert.strictEqual(teil.bestand, 'Noch nicht alle Lager gezählt – der Bestand ist geschätzt (aus Abfüllungen minus Verkäufe). ' +
    'Nach der Inventur zeigt die App den echten Bestand.');
  assert.deepStrictEqual(teil.andere, ['Lager-Log Zeile 7: Art „X“ unbekannt, zählt nicht.']);
  const keine = H.hinweiseOrdnen(['Noch keine Inventur: Gesamtbestand ist der rechnerische aus der Übersicht (ohne Promo, Eigenverbrauch, Bruch).']);
  assert.match(keine.bestand, /^Noch kein Lager gezählt – der Bestand ist geschätzt/);
  assert.deepStrictEqual(keine.andere, []);
  assert.deepStrictEqual(H.hinweiseOrdnen(undefined), { bestand: '', andere: [] });
});

test('Feinschliff: Verlauf ohne Storno-Gegenzeilen, Stepper-Werte', () => {
  const v = [{ art: 'Storno', stornoVon: 'L1' }, { art: 'Promo', id: 'L1', storniert: true }, { art: 'Inventur', id: 'L0' }];
  assert.deepStrictEqual(H.verlaufOhneStorno(v).map((e) => e.art), ['Promo', 'Inventur']);
  assert.deepStrictEqual(H.verlaufOhneStorno(null), []);

  assert.strictEqual(H.schrittWert('', 1, 100), '1');
  assert.strictEqual(H.schrittWert('', -1, 100), '0', 'nie unter 0');
  assert.strictEqual(H.schrittWert('1.200', 1, 50000), '1201');
  assert.strictEqual(H.schrittWert('abc', 1, 100), '1', 'unlesbar zählt als 0');
  assert.strictEqual(H.schrittWert('100', 1, 100), '100', 'nicht über den Höchstwert');
  assert.strictEqual(H.schrittWert('5', 1), '6', 'ohne Höchstwert: 50.000');
});

test('datumAbkuerzungen und buchungVorschau', () => {
  assert.deepStrictEqual(H.datumAbkuerzungen('2026-11-09'), [{ text: 'Heute', datum: '2026-11-09' }, { text: 'Gestern', datum: '2026-11-08' },
    { text: '31. Okt', datum: '2026-10-31' }]);
  assert.strictEqual(H.datumAbkuerzungen('2026-11-11').length, 2, 'ab dem 11. kein Monatsende mehr');
  assert.deepStrictEqual(H.datumAbkuerzungen('2027-01-01').map((c) => c.datum), ['2027-01-01', '2026-12-31'], 'am 1. ist gestern schon das Monatsende');
  assert.deepStrictEqual(H.datumAbkuerzungen('2027-01-02').map((c) => c.text), ['Heute', 'Gestern', '31. Dez']);
  assert.deepStrictEqual(H.datumAbkuerzungen('kaputt'), []);
  assert.strictEqual(H.buchungVorschau('Inventur', 300, 288), 'Abweichung zur App: +12 Flaschen.');
  assert.strictEqual(H.buchungVorschau('Inventur', 287, 288), 'Abweichung zur App: −1 Flasche.');
  assert.strictEqual(H.buchungVorschau('Inventur', 288, 288), 'Passt genau zum Bestand laut App.');
  assert.strictEqual(H.buchungVorschau('Abfüllung', 1000, 288), 'Danach: 1.288 Flaschen.');
  assert.strictEqual(H.buchungVorschau('Bruch', 1, 2), 'Danach: 1 Flasche.');
  assert.strictEqual(H.buchungVorschau('Umlagerung', 48, 288, 10, 'Dave Berlin', 'Mark Berlin'), 'Danach Mark Berlin: 240 Flaschen, Dave Berlin: 58 Flaschen.');
  assert.strictEqual(H.buchungVorschau('Umlagerung', 48, 288, null, 'Dave Berlin', 'Mark Berlin'), 'Danach Mark Berlin: 240 Flaschen.');
  assert.strictEqual(H.buchungVorschau('Umlagerung', 48, null, 10, 'Dave Berlin', 'Mark Berlin'), 'Danach Dave Berlin: 58 Flaschen.');
  assert.strictEqual(H.buchungVorschau('Umlagerung', 48, null, null, 'Dave Berlin', 'Mark Berlin'), '');
  assert.strictEqual(H.buchungVorschau('Promo', 5, null), '');
  assert.strictEqual(H.buchungVorschau('Quatsch', 5, 10), '');
});

test('wochentagText, dauerText, achseMitMinus, achsenText mit max', () => {
  assert.strictEqual(H.wochentagText('2026-11-09'), 'Montag, 9. November');
  assert.strictEqual(H.wochentagText('2027-01-01'), 'Freitag, 1. Januar');
  assert.strictEqual(H.wochentagText('x'), '');
  assert.strictEqual(H.dauerText(1), '1 Tag');
  assert.strictEqual(H.dauerText(13), '13 Tage');
  assert.strictEqual(H.dauerText(35), '5 Wochen');
  assert.strictEqual(H.dauerText(97), '3,2 Monate');
  assert.strictEqual(H.dauerText(61), '2 Monate');
  assert.strictEqual(H.dauerText(-1), '');
  assert.deepStrictEqual(H.achseMitMinus([0, 1800, 2400]), { unten: 0, oben: 3000, schritt: 1000, striche: [0, 1000, 2000, 3000] }, 'wie achse()');
  const m = H.achseMitMinus([-24, 300]);
  assert.ok(m.unten < 0 && m.striche.includes(0) && m.oben >= 300);
  assert.deepStrictEqual(H.achseMitMinus([]), { unten: 0, oben: 1, schritt: 1, striche: [0, 1] });
  assert.strictEqual(H.achsenText(5000, 15000), '5 Tsd.');
  assert.strictEqual(H.achsenText(5000, 6000), '5.000');
  assert.strictEqual(H.achsenText(0, 15000), '0');
});

test('inventurAm und jahresStichtag (Jahresinventur zum 31.12.)', () => {
  const l = { letzteInventur: '2027-01-05', gezaehlt: 300, inventuren: [{ datum: '2027-01-05', flaschen: 300 }, { datum: '2026-12-31', flaschen: 310 }] };
  assert.deepStrictEqual(H.inventurAm(l, '2026-12-31'), { datum: '2026-12-31', flaschen: 310 }, 'auch wenn danach nochmal gezählt wurde');
  assert.strictEqual(H.inventurAm(l, '2026-12-30'), null);
  assert.strictEqual(H.inventurAm({ letzteInventur: '2027-01-05', gezaehlt: 300, inventuren: [{ datum: '2027-01-05', flaschen: 300 }] }, '2026-12-31'), null,
    'Januar-Zählung ist keine Jahresinventur');
  assert.deepStrictEqual(H.inventurAm({ letzteInventur: '2026-12-31', gezaehlt: 5 }, '2026-12-31'), { datum: '2026-12-31', flaschen: 5 }, 'ältere Antwort');
  assert.strictEqual(H.inventurAm({ letzteInventur: null, gezaehlt: null, inventuren: [] }, '2026-12-31'), null);
  assert.strictEqual(H.jahresStichtag('2026-12-01'), '2026-12-31');
  assert.strictEqual(H.jahresStichtag('2026-12-31'), '2026-12-31');
  assert.strictEqual(H.jahresStichtag('2027-01-01'), '2026-12-31');
  assert.strictEqual(H.jahresStichtag('2027-01-31'), '2026-12-31');
  assert.strictEqual(H.jahresStichtag('2027-02-01'), '');
  assert.strictEqual(H.jahresStichtag('2026-11-30'), '');
});
