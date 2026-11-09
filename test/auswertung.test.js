'use strict';

// Auswertungen der App aus den Verkaufszeilen (docs/hilfen.js): Jahresvergleich, Kanäle/Kunden, Kunden-Details,
// „Lange nichts bestellt“. Erfundene Zahlen. Besonders: Jahreswechsel (Januar, Dezember) und ältere Schnittstelle.

const test = require('node:test');
const assert = require('node:assert');
const H = require('../docs/hilfen.js');

const z = (monat, datum, kanal, kunde, flaschen, umsatz) => [monat, datum, kanal, kunde, flaschen, umsatz];

/** Zwei Jahre erfunden: 2025 ab März, 2026 bis November. */
function zeilen() {
  return [
    z('2025-03', '', 'Aktion', 'Start Aktion', 1000, 1000),
    z('2025-05', '', 'Karlsruhe', 'Bar Eins', 100, 130),
    z('2025-10', '', 'Karlsruhe', 'Bar Eins', 50, 65),
    z('2025-11', '', 'Berlin', 'Späti', 24, 30),
    z('2025-12', '', 'Berlin', 'Späti', 48, 60),
    z('2026-01', '', 'Karlsruhe', 'bar eins ', 30, 39),
    z('2026-05', '', 'Karlsruhe', 'Bar Eins', 200, 260),
    z('2026-10', '2026-10-08', 'Karlsruhe', 'Bar Eins', 60, 78),
    z('2026-10', '2026-10-20', 'Berlin', 'Späti', 72, 90),
    z('2026-10', '2026-10-30', 'Berlin', 'Späti', -24, -30), // Gutschrift
    z('2026-11', '2026-11-06', 'Ape', 'Fest', 240, 840),
    z('2026-11', '2026-11-06', 'Ape', 'Fest', 24, 0), // zweite Zeile derselben Rechnung
    ['kaputt'], z('2026-13', '', 'X', 'Y', 1, 1), z('2026-11', '', 'X', 'Y', 'viel', 1), // unlesbar
  ];
}

test('verkaufZeilen: liest kompakte Zeilen, unlesbare fallen weg, alte Schnittstelle → null', () => {
  const v = H.verkaufZeilen({ zeilen: zeilen() });
  assert.strictEqual(v.length, 12);
  assert.deepStrictEqual(v[5], { monat: '2026-01', datum: '', kanal: 'Karlsruhe', kunde: 'bar eins', schluessel: 'bar eins', flaschen: 30, umsatz: 39, rechnung: '' });
  assert.strictEqual(v[1].schluessel, v[5].schluessel);
  assert.strictEqual(H.verkaufZeilen({ monate: [] }), null);
  assert.strictEqual(H.verkaufZeilen(null), null);
});

test('jahresVergleich im November: Monate, bisher, Vergleich volle Monate Jan–Okt', () => {
  const v = H.verkaufZeilen({ zeilen: zeilen() });
  const j = H.jahresVergleich(H.monatsWerte({}, v), '2026-11-09');
  assert.strictEqual(j.monate.length, 12);
  assert.strictEqual(j.monate[0].monat, '2026-01');
  assert.strictEqual(j.monate[0].vorjahrMonat, '2025-01');
  assert.deepStrictEqual(j.monate[9].dieses, { flaschen: 108, umsatz: 138 }); // Oktober inkl. Gutschrift
  assert.deepStrictEqual(j.monate[9].vorjahr, { flaschen: 50, umsatz: 65 });
  assert.strictEqual(j.monate[10].laufend, true);
  assert.strictEqual(j.monate[11].zukunft, true);
  assert.strictEqual(j.monate[11].dieses, null, 'Dezember kommt noch');
  assert.deepStrictEqual(j.monate[11].vorjahr, { flaschen: 48, umsatz: 60 });
  assert.deepStrictEqual(j.bisher, { flaschen: 30 + 200 + 108 + 264, umsatz: 39 + 260 + 138 + 840 });
  assert.strictEqual(j.vergleich.bis, '2026-10');
  assert.deepStrictEqual(j.vergleich.dieses, { flaschen: 338, umsatz: 437 });
  assert.deepStrictEqual(j.vergleich.vorjahr, { flaschen: 1150, umsatz: 1195 });
  assert.deepStrictEqual(j.vorjahrGesamt, { flaschen: 1222, umsatz: 1285 });
  assert.deepStrictEqual(H.kumuliert(j.monate, 'dieses', 'flaschen').slice(0, 3), [30, 30, 30]);
  assert.strictEqual(H.kumuliert(j.monate, 'dieses', 'flaschen')[10], 602);
  assert.strictEqual(H.kumuliert(j.monate, 'dieses', 'flaschen')[11], null);
  assert.strictEqual(H.kumuliert(j.monate, 'vorjahr', 'flaschen')[11], 1222);
});

test('jahresVergleich über den Jahreswechsel: im Januar kein Vergleich voller Monate, Vorjahr = das alte Jahr', () => {
  const v = H.verkaufZeilen({ zeilen: zeilen().concat([z('2027-01', '2027-01-04', 'Karlsruhe', 'Bar Eins', 12, 15)]) });
  const w = H.monatsWerte({}, v);
  const jan = H.jahresVergleich(w, '2027-01-05');
  assert.strictEqual(jan.monate[0].monat, '2027-01');
  assert.strictEqual(jan.monate[0].vorjahrMonat, '2026-01');
  assert.strictEqual(jan.vergleich, null);
  assert.deepStrictEqual(jan.bisher, { flaschen: 12, umsatz: 15 });
  assert.deepStrictEqual(jan.vorjahrGesamt, { flaschen: 602, umsatz: 1277 });
  const silvester = H.jahresVergleich(w, '2026-12-31');
  assert.strictEqual(silvester.monate[11].laufend, true);
  assert.strictEqual(silvester.vergleich.bis, '2026-11');
  const feb = H.jahresVergleich(w, '2027-02-01');
  assert.strictEqual(feb.vergleich.bis, '2027-01');
  assert.deepStrictEqual(feb.vergleich.vorjahr, { flaschen: 30, umsatz: 39 });
  assert.strictEqual(H.jahresVergleich(w, 'kaputt'), null);
});

test('jahresVergleich mit älterer Schnittstelle (25 Monate ohne Zeilen)', () => {
  const monate = [];
  const vergleichsmonate = [];
  for (let i = 0; i < 13; i++) monate.push({ monat: H.monatPlus('2025-11', i), flaschen: 10 + i, umsatz: 20 + i });
  for (let i = 0; i < 12; i++) vergleichsmonate.push({ monat: H.monatPlus('2024-11', i), flaschen: i, umsatz: i });
  const w = H.monatsWerte({ monate, vergleichsmonate }, null);
  assert.strictEqual(w('2023-01'), null);
  const j = H.jahresVergleich(w, '2026-11-09');
  assert.deepStrictEqual(j.monate[0].dieses, { flaschen: 12, umsatz: 22 });
  assert.deepStrictEqual(j.monate[0].vorjahr, { flaschen: 2, umsatz: 2 });
  assert.ok(j.vergleich);
  assert.ok(j.vorjahrGesamt);
  // Lücke (Vorjahresmonat fehlt): kein Vergleich statt falscher Zahl
  const kurz = H.monatsWerte({ monate, vergleichsmonate: [] }, null);
  assert.strictEqual(H.jahresVergleich(kurz, '2026-11-09').vergleich, null);
  assert.strictEqual(H.jahresVergleich(kurz, '2026-11-09').vorjahrGesamt, null);
});

test('zeitraumAuswerten: Kanäle und alle Kunden nach Flaschen, Kunden zusammengefasst, erster Monat', () => {
  const v = H.verkaufZeilen({ zeilen: zeilen() });
  const a = H.zeitraumAuswerten(v, '2026-01', '2026-11');
  assert.strictEqual(a.flaschen, 602);
  assert.deepStrictEqual(a.kanaele.map((k) => k.kanal), ['Karlsruhe', 'Ape', 'Berlin']);
  assert.deepStrictEqual(a.kanaele[2], { kanal: 'Berlin', flaschen: 48, umsatz: 60 });
  assert.deepStrictEqual(a.kunden.map((k) => k.kunde), ['Bar Eins', 'Fest', 'Späti']);
  assert.strictEqual(a.kunden[0].flaschen, 290);
  assert.strictEqual(a.kunden[0].erster, '2025-05');
  assert.strictEqual(a.kunden[1].erster, '2026-11');
  assert.strictEqual(a.kunden[1].kanal, 'Ape');
  assert.deepStrictEqual(H.zeitraumAuswerten([], '2026-01', '2026-12').kunden, []);
});

test('kundeDetails: Summen, Bestellungen (gleiche Rechnung zählt einmal), erste/letzte, 13 Monate, Liste', () => {
  const v = H.verkaufZeilen({ zeilen: zeilen() });
  const d = H.kundeDetails(v, 'bar eins', '2026-11-09');
  assert.strictEqual(d.kunde, 'Bar Eins');
  assert.deepStrictEqual(d.kanaele, ['Karlsruhe']);
  assert.deepStrictEqual(d.jahr, { flaschen: 290, umsatz: 377 });
  assert.deepStrictEqual(d.vorjahr, { flaschen: 150, umsatz: 195 });
  assert.deepStrictEqual(d.gesamt, { flaschen: 440, umsatz: 572 });
  assert.strictEqual(d.bestellungen, 5);
  assert.strictEqual(d.proBestellung, 88);
  assert.deepStrictEqual(d.erste, { monat: '2025-05', datum: '' });
  assert.deepStrictEqual(d.letzte, { monat: '2026-10', datum: '2026-10-08' });
  assert.strictEqual(d.monate.length, 13);
  assert.strictEqual(d.monate[0].monat, '2025-11');
  assert.strictEqual(d.monate[12].monat, '2026-11');
  assert.strictEqual(d.liste[0].datum, '2026-10-08');
  const fest = H.kundeDetails(v, 'fest', '2026-11-09');
  assert.strictEqual(fest.bestellungen, 1, 'zwei Zeilen, ein Rechnungsdatum');
  const spaeti = H.kundeDetails(v, 'späti', '2026-11-09');
  assert.strictEqual(spaeti.bestellungen, 3, 'Gutschrift zählt nicht als Bestellung');
  assert.deepStrictEqual(spaeti.letzte, { monat: '2026-10', datum: '2026-10-20' });
  assert.strictEqual(H.kundeDetails(v, 'gibt es nicht', '2026-11-09'), null);
});

test('nachfassen: Stammkunden, die länger als 90 Tage nichts bestellt haben', () => {
  const v = H.verkaufZeilen({ zeilen: zeilen() });
  // Am 09.11.2026: Bar Eins zuletzt 08.10. (32 Tage) → nein; Späti 20.10. → nein; Start Aktion nur 1 Bestellung → nein
  assert.deepStrictEqual(H.nachfassen(v, '2026-11-09'), []);
  const spaeter = H.nachfassen(v, '2027-02-15');
  assert.deepStrictEqual(spaeter.map((k) => k.kunde), ['Bar Eins', 'Späti']);
  assert.strictEqual(spaeter[0].tage, 130);
  assert.strictEqual(spaeter[0].bestellungen, 5);
  // Altzeilen: Monatsende zählt (Bar Eins nur bis Mai 2026 → 31.05.)
  const alt = H.verkaufZeilen({ zeilen: [z('2026-01', '', 'Karlsruhe', 'A', 24, 30), z('2026-05', '', 'Karlsruhe', 'A', 24, 30)] });
  assert.strictEqual(H.nachfassen(alt, '2026-08-29').length, 0, '90 Tage nach dem 31.05.');
  assert.strictEqual(H.nachfassen(alt, '2026-08-30')[0].tage, 91);
  assert.strictEqual(H.nachfassen(alt, '2027-12-31').length, 0, 'mehr als 18 Monate her: fällt raus');
});

test('wannText und abstandText', () => {
  assert.strictEqual(H.wannText({ monat: '2026-10', datum: '2026-10-08' }), '8. Okt 2026');
  assert.strictEqual(H.wannText({ monat: '2026-05', datum: '' }), 'Mai 2026');
  assert.strictEqual(H.wannText(null), '–');
  assert.strictEqual(H.abstandText(0), 'heute');
  assert.strictEqual(H.abstandText(1), 'gestern');
  assert.strictEqual(H.abstandText(5), 'vor 5 Tagen');
  assert.strictEqual(H.abstandText(35), 'vor 5 Wochen');
  assert.strictEqual(H.abstandText(130), 'vor 4 Monaten');
  assert.strictEqual(H.abstandText(-1), '');
});

test('Codex-Befunde: Rechnungen statt Tage, spätere Monate, Lücken, gezeigtes Jahr', () => {
  // Zwei Rechnungen am selben Tag = zwei Bestellungen; „RE7 #2“ gehört zu RE7
  const zwei = H.verkaufZeilen({ zeilen: [
    ['2026-01', '2026-01-10', 'Karlsruhe', 'A', 24, 30, 'RE1'], ['2026-01', '2026-01-10', 'Karlsruhe', 'A', 48, 60, 'RE2'],
    ['2026-02', '2026-02-03', 'Karlsruhe', 'A', 10, 12, 'RE7'], ['2026-02', '2026-02-03', 'Karlsruhe', 'A', 2, 0, 'RE7 #2']] });
  assert.strictEqual(zwei[3].rechnung, 'RE7');
  assert.strictEqual(H.bestellungenZaehlen(zwei), 3);
  assert.strictEqual(H.kundeDetails(zwei, 'a', '2026-11-09').proBestellung, 28);
  // Ohne Rechnungsnummer (ältere Antwort mit 6 Feldern): gleicher Tag zählt einmal
  assert.strictEqual(H.bestellungenZaehlen(H.verkaufZeilen({ zeilen: [['2026-01', '2026-01-10', 'K', 'A', 24, 30], ['2026-01', '2026-01-10', 'K', 'A', 48, 60]] })), 1);
  // Zeilen aus späteren Monaten fallen mit `heute` weg
  const spaeter = H.verkaufZeilen({ zeilen: [['2026-01', '', 'K', 'A', 24, 30], ['2026-12', '2026-12-01', 'K', 'A', 1000, 1000, 'RE9']] }, '2026-11-09');
  assert.strictEqual(spaeter.length, 1);
  assert.deepStrictEqual(H.kundeDetails(spaeter, 'a', '2026-11-09').jahr, { flaschen: 24, umsatz: 30 });
  // Kumuliert: nach einer Lücke nichts mehr
  const monate = [{ vorjahr: { flaschen: 5 } }, { vorjahr: null }, { vorjahr: { flaschen: 7 } }];
  assert.deepStrictEqual(H.kumuliert(monate, 'vorjahr', 'flaschen'), [5, null, null]);
  // Vorjahr als gezeigtes Jahr: alle Monate voll, nichts läuft noch
  const w = H.monatsWerte({}, H.verkaufZeilen({ zeilen: zeilen() }));
  const vj = H.jahresVergleich(w, '2027-01-05', 2026);
  assert.strictEqual(vj.jahr, 2026);
  assert.strictEqual(vj.monate[11].monat, '2026-12');
  assert.ok(vj.monate.every((m) => !m.laufend && !m.zukunft));
  assert.strictEqual(vj.vergleich.bis, '2026-12');
  assert.deepStrictEqual(vj.bisher, { flaschen: 602, umsatz: 1277 });
  assert.deepStrictEqual(vj.vergleich.vorjahr, { flaschen: 1222, umsatz: 1285 });
  assert.strictEqual(H.jahresVergleich(w, '2026-11-09').jahr, 2026);
});
