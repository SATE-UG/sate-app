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

test('standText: Update zum Teilen, Kurzfristiges zuerst, ohne Kundennamen', () => {
  const v = H.verkaufZeilen({ zeilen: zeilen() }, '2026-11-09');
  const w = H.monatsWerte({}, v);
  const jv = H.jahresVergleich(w, '2026-11-09');
  const u = { kennzahlen: { gesamtbestand: 8353, gesamtQuelle: 'rechnerisch' }, bestellung: { spaetestensBestellen: '2027-02-14' } };
  const t = H.standText(u, jv, '2026-11-09', null, { zeilen: v, jvVorjahr: H.jahresVergleich(w, '2026-11-09', 2025) });
  assert.deepStrictEqual(t.split('\n'), [
    '📊 SATE Update vom 9. Nov', '',
    '📈 Oktober: 108 Flaschen, +116 % zum Vorjahr', '2 Bestellungen', '', // Gutschrift zählt nicht als Bestellung, kein neuer Kunde
    '🚀 November bisher: 264 Flaschen', '1 Bestellung, 1 neuer Kunde', 'Ganzer November 2025: 24 Flaschen', '',
    '📅 Dieses Jahr: 602 Flaschen, bis Oktober −71 % zum Vorjahr', '📦 Bestand: 8.353 Flaschen (geschätzt)', '🛒 Abfüllung bestellen bis 14. Feb 2027', '',
    'Trink SATE! 🤍']);
  assert.doesNotMatch(t, /Bar Eins|Späti|Fest/, 'keine Kunden');
  assert.doesNotMatch(t, /[·•]/, 'keine Trennpunkte');
  // Ohne Verkaufszeilen: gleiche Zahlen, nur ohne die Zeile mit Bestellungen und neuen Kunden
  const ohne = H.standText(u, jv, '2026-11-09');
  assert.match(ohne, /📈 Oktober: 108 Flaschen, \+116 % zum Vorjahr\n\n🚀 November bisher: 264 Flaschen\nGanzer November 2025: 24 Flaschen\n/);
  // Laufender Monat unter dem Vorjahresmonat: Sanduhr statt Rakete; schwächerer Monat: Pfeil nach unten
  const schwach = H.verkaufZeilen({ zeilen: [z('2025-10', '', 'K', 'A', 100, 1), z('2025-11', '', 'K', 'A', 100, 1),
    z('2026-10', '2026-10-05', 'K', 'A', 40, 1, 'RE1'), z('2026-11', '2026-11-03', 'K', 'A', 1, 1, 'RE2')] }, '2026-11-09');
  const ts = H.standText({}, H.jahresVergleich(H.monatsWerte({}, schwach), '2026-11-09'), '2026-11-09', null, { zeilen: schwach });
  assert.match(ts, /📉 Oktober: 40 Flaschen, −60 % zum Vorjahr\n1 Bestellung\n\n⏳ November bisher: 1 Flasche\n1 Bestellung\nGanzer November 2025: 100 Flaschen\n/);
  // Januar: der Dezember kommt aus dem Vorjahr, statt „Dieses Jahr“ das abgelaufene Jahr; Bestelltermin vorbei
  const vj = H.verkaufZeilen({ zeilen: zeilen() }, '2027-01-05');
  const wj = H.monatsWerte({}, vj);
  const jan = H.standText({ kennzahlen: {}, bestellung: { spaetestensBestellen: '2027-01-01' } }, H.jahresVergleich(wj, '2027-01-05'), '2027-01-05', null,
    { zeilen: vj, jvVorjahr: H.jahresVergleich(wj, '2027-01-05', 2026) });
  assert.match(jan, /📉 Dezember: 0 Flaschen, −100 % zum Vorjahr\n\n⏳ Januar bisher: 0 Flaschen\nGanzer Januar 2026: 30 Flaschen\n\n📅 2026 gesamt: 602 Flaschen, −51 % zum Vorjahr\n⚠️ Abfüllung bestellen: überfällig seit 1\. Jan 2027\n/);
  assert.match(H.standText({ bestellung: { spaetestensBestellen: '2027-01-05' } }, null, '2027-01-05'), /^📊 SATE Update vom 5\. Jan\n\n⚠️ Abfüllung heute bestellen\n\nTrink SATE! 🤍$/);
  // Codex v27: zwei Kunden am selben Tag ohne Rechnungsnummer sind zwei Bestellungen; ohne gültiges Heute kein Termin, kein Absturz
  const tag = H.verkaufZeilen({ zeilen: [z('2026-10', '2026-10-05', 'K', 'A', 24, 1), z('2026-10', '2026-10-05', 'K', 'B', 24, 1), z('2026-10', '2026-10-05', 'K', 'B', 6, 1)] }, '2026-11-09');
  assert.strictEqual(H.bestellungenZaehlen(tag), 2);
  assert.match(H.standText({}, H.jahresVergleich(H.monatsWerte({}, tag), '2026-11-09'), '2026-11-09', null, { zeilen: tag }), /Oktober: 54 Flaschen\n2 Bestellungen, 2 neue Kunden\n/);
  for (const kaputt of ['kaputt', null, undefined]) {
    assert.strictEqual(H.standText({ kennzahlen: { gesamtbestand: 10 }, bestellung: { spaetestensBestellen: '2027-01-05' } }, null, kaputt),
      '📊 SATE Update\n\n📦 Bestand: 10 Flaschen (geschätzt)\n\nTrink SATE! 🤍');
  }
});

test('frageTeilen: Frage vorn als Titel, Rest als Erklärung', () => {
  assert.deepStrictEqual(H.frageTeilen('Abmelden? Danach brauchst du deinen Zugangscode wieder.'), { titel: 'Abmelden?', text: 'Danach brauchst du deinen Zugangscode wieder.' });
  assert.deepStrictEqual(H.frageTeilen('Diesen Eintrag stornieren?\n\nPromo, 12 Flaschen\n\nEr bleibt stehen.'), { titel: 'Diesen Eintrag stornieren?', text: 'Promo, 12 Flaschen\n\nEr bleibt stehen.' });
  assert.deepStrictEqual(H.frageTeilen('Der Bestand würde auf -12 Flaschen fallen.'), { titel: '', text: 'Der Bestand würde auf -12 Flaschen fallen.' });
  assert.deepStrictEqual(H.frageTeilen('Nur eine Frage?'), { titel: 'Nur eine Frage?', text: '' });
  // Lange erste Zeile oder Frage erst in der zweiten Zeile: kein Titel
  assert.strictEqual(H.frageTeilen('x'.repeat(70) + '? Rest').titel, '');
  assert.strictEqual(H.frageTeilen('Hinweis.\nWirklich?').titel, '');
  assert.deepStrictEqual(H.frageTeilen(null), { titel: '', text: '' });
});

test('ziehTempo und blattSchliesst: Loslassen des Blatts (weit genug oder mit Schwung)', () => {
  // 100 px in 50 ms, sofort losgelassen: 2 px/ms
  assert.strictEqual(H.ziehTempo([{ t: 0, y: 0 }, { t: 25, y: 50 }, { t: 50, y: 100 }], 50), 2);
  // 30 px zwischen 20 und 50 ms, dann 80 ms still: der Stillstand zählt mit (Codex v28)
  const still = H.ziehTempo([{ t: 20, y: 0 }, { t: 50, y: 30 }], 130);
  assert.ok(still > 0.27 && still < 0.28, String(still));
  assert.strictEqual(H.blattSchliesst(30, still), false);
  // Punkte außerhalb des Fensters zählen nicht, ein einzelner Punkt hat kein Tempo
  assert.strictEqual(H.ziehTempo([{ t: 0, y: 0 }, { t: 10, y: 200 }], 500), 0);
  assert.strictEqual(H.ziehTempo([{ t: 400, y: 0 }], 400), 0);
  assert.strictEqual(H.ziehTempo([], 10), 0);
  assert.strictEqual(H.ziehTempo(null, 10), 0);
  // Schließen: über 110 px immer, sonst nur mit Schwung und mindestens 24 px
  assert.strictEqual(H.blattSchliesst(111, 0), true);
  assert.strictEqual(H.blattSchliesst(110, 0), false);
  assert.strictEqual(H.blattSchliesst(40, 0.6), true);
  assert.strictEqual(H.blattSchliesst(20, 3), false);
  assert.strictEqual(H.blattSchliesst(80, 0.5), false);
  assert.strictEqual(H.blattSchliesst(0, 9), false);
  assert.strictEqual(H.blattSchliesst(NaN, 9), false);
});

test('prognoseSaison: jeder Monat wie der gleiche Monat ein Jahr vorher, laufender Monat nur der Rest', () => {
  const w = (m) => ({ '2025-11': { flaschen: 300 }, '2025-12': { flaschen: 500 }, '2026-01': { flaschen: 200 } })[m] || { flaschen: 1000 };
  // 9. Nov: im November schon 100 verkauft (Vorjahr 300 → noch 200), Dezember 500, Januar 200, ab Februar 1000/Monat
  const p = H.prognoseSaison(1500, '2026-11-09', w, { proMonat: 999, bisher: 100 });
  assert.deepStrictEqual(p.punkte.slice(0, 4), [{ datum: '2026-11-09', bestand: 1500 }, { datum: '2026-11-30', bestand: 1300 },
    { datum: '2026-12-31', bestand: 800 }, { datum: '2027-01-31', bestand: 600 }]);
  assert.strictEqual(p.leer, '2027-02-17', '600 von 1000 im Februar → nach 60 % der 28 Tage');
  assert.deepStrictEqual(p.punkte[p.punkte.length - 1], { datum: '2027-02-17', bestand: 0 });
  // schon im laufenden Monat leer: anteilig ab heute
  assert.strictEqual(H.prognoseSaison(100, '2026-11-09', w).leer, '2026-11-19', '300 im Monat = 10 am Tag → 100 reichen 10 Tage');
  // fehlender Vorjahresmonat: Ø; reicht länger als 24 Monate: leer null; nichts mehr da: leer heute
  assert.strictEqual(H.prognoseSaison(10, '2026-11-09', () => null, { proMonat: 5 }).leer, '2027-01-10', 'November noch 21/30 von 5, Dezember 5, Rest 1,5 im Januar');
  assert.strictEqual(H.prognoseSaison(1e9, '2026-11-09', w, { proMonat: 1 }).leer, null);
  assert.strictEqual(H.prognoseSaison(0, '2026-11-09', w).leer, '2026-11-09');
  assert.strictEqual(H.prognoseSaison(100, 'kaputt', w), null);
  // Faktor: jeder Monat × 2
  assert.strictEqual(H.prognoseSaison(1500, '2026-11-09', w, { faktor: 2, bisher: 100 }).punkte[1].bestand, 1080, 'November 600 erwartet, in 21 Resttagen höchstens 420');
  // Gutschrift-Monat (negativ) zählt als 0
  assert.deepStrictEqual(H.prognoseSaison(50, '2026-11-30', (m) => (m === '2025-12' ? { flaschen: -24 } : { flaschen: 100 }), { bisher: 100 }).punkte[1],
    { datum: '2026-12-31', bestand: 50 }, 'Dezember mit Gutschrift: nichts weg (heute ist Monatsende, kein doppelter Punkt)');
});

test('aktivitaet: Rechnungen und Buchungen gemischt, neueste zuerst, Storno-Gegenzeilen weg', () => {
  const rechnungen = [{ rechnung: 'RE2', datum: '2026-11-06', kunde: 'Forum-WI', flaschen: 600 }, { rechnung: 'RE1', datum: '2026-10-08', kunde: 'A', flaschen: 24 }];
  const eintraege = [{ art: 'Storno', datum: '2026-11-08', stornoVon: 'L1' }, { art: 'Promo', id: 'L1', datum: '2026-11-08', storniert: true },
    { art: 'Inventur', id: 'L0', datum: '2026-11-06' }, { art: 'Bruch', id: 'L9', datum: 'kaputt' }];
  const a = H.aktivitaet(rechnungen, eintraege, 5);
  assert.deepStrictEqual(a.map((x) => x.typ + ':' + (x.art || x.rechnung)), ['buchung:Promo', 'buchung:Inventur', 'rechnung:RE2', 'rechnung:RE1']);
  assert.strictEqual(H.aktivitaet(rechnungen, eintraege, 2).length, 2);
  assert.deepStrictEqual(H.aktivitaet(null, null), []);
});

test('letzteBestellungen: je Kunde die letzte Lieferung, Gutschriften zählen nicht, Altzeilen am Monatsende', () => {
  const v = H.verkaufZeilen({ zeilen: zeilen() }, '2026-11-09');
  const l = H.letzteBestellungen(v, '2026-11-09');
  assert.deepStrictEqual(l['bar eins'], { monat: '2026-10', datum: '2026-10-08', tage: 32 });
  assert.deepStrictEqual(l['späti'], { monat: '2026-10', datum: '2026-10-20', tage: 20 }, 'Gutschrift vom 30.10. zählt nicht');
  assert.deepStrictEqual(l['start aktion'], { monat: '2025-03', datum: '', tage: H.tageZwischen('2025-03-31', '2026-11-09') });
  assert.deepStrictEqual(Object.keys(H.letzteBestellungen([], '2026-11-09')), []);
});

test('Codex v23: Prognose ab 12 Monaten voraus wiederholt das Saisonprofil, Aktivität ohne Zukunft', () => {
  // 1.11.2026, Bestand 1.350, Nov 2025 – Okt 2026 je 100: nach 12 Monaten weiter je 100 (nicht 0)
  const w = (m) => (m >= '2025-11' && m <= '2026-10' ? { flaschen: 100 } : { flaschen: 0 });
  const p = H.prognoseSaison(1350, '2026-11-01', w);
  assert.strictEqual(p.leer, '2027-12-17', 'November 29/30, dann je 100 (Dezember etwas mehr als zur Hälfte)');
  const zukunft = H.aktivitaet([{ rechnung: 'RE9', datum: '2026-11-10', kunde: 'Morgen', flaschen: 1 }, { rechnung: 'RE8', datum: '2026-11-09', kunde: 'Heute', flaschen: 1 }], [], 5, '2026-11-09');
  assert.deepStrictEqual(zukunft.map((x) => x.rechnung), ['RE8']);
});

// Bestellprognose (v24): eine Rechnung statt zwei Linien ---------------------------------------------------------------
const VORJAHR = { '2025-05': 100, '2025-06': 100, '2025-07': 100, '2025-08': 100, '2025-09': 100, '2025-10': 100, '2025-11': 40, '2025-12': 20,
  '2026-01': 20, '2026-02': 20, '2026-03': 60, '2026-04': 80, '2026-05': 150, '2026-06': 150, '2026-07': 150, '2026-08': 150, '2026-09': 150,
  '2026-10': 150, '2026-11': 30 };
const wv = (m) => ({ flaschen: VORJAHR[m] || 0, umsatz: 0 });
const ub = (bestand, k, b) => ({
  kennzahlen: Object.assign({ gesamtbestand: bestand, gesamtQuelle: 'rechnerisch', mindestbestand: 0, abverkaufProMonat: 150, abverkaufVon: '2026-05', abverkaufBis: '2026-10' }, k),
  bestellung: Object.assign({ leerAm: '2027-02-26', spaetestensBestellen: '2026-12-12', status: 'bald', vorlaufMonate: 2, pufferWochen: 2 }, b),
});

test('bestellPrognose: jeder Monat wie im Vorjahr mal Wachstum, bestellen = leer − Abfüllung − Puffer', () => {
  const p = H.bestellPrognose(ub(500), wv, '2026-11-09', '2025-01');
  assert.strictEqual(p.art, 'saison');
  assert.strictEqual(p.wachstum, 1.5, 'Mai–Okt 900 gegen 600 im Vorjahr');
  // November: 40 × 1,5 = 60 erwartet, 30 schon verkauft; Winter je 30, März 90, April 120, im Mai 225 → leer am 24.
  assert.deepStrictEqual(p.punkte.map((x) => x.datum.slice(5) + ':' + x.bestand),
    ['11-09:500', '11-30:470', '12-31:440', '01-31:410', '02-28:380', '03-31:290', '04-30:170', '05-24:0']);
  assert.strictEqual(p.leerAm, '2027-05-24');
  assert.strictEqual(p.spaetestensBestellen, '2027-03-10', '24.5. − 2 Monate − 14 Tage');
  assert.strictEqual(p.tage, 121);
  assert.strictEqual(p.status, 'ok');
  assert.strictEqual(p.ankunft, '2027-05-10', 'bestellt am 10.3. + 2 Monate Abfüllung');
  assert.strictEqual(p.luecke, 0);
  assert.strictEqual(p.reichtUeber, null);
  // ohne Ø-Zeitraum der Schnittstelle: die letzten 6 vollen Monate
  assert.strictEqual(H.bestellPrognose(ub(500, { abverkaufVon: undefined, abverkaufBis: undefined }), wv, '2026-11-09', '2025-01').spaetestensBestellen, '2027-03-10');
});

test('bestellPrognose: Status bald und jetzt, Lücke bis die Abfüllung da ist, Mindestbestand, reicht lange', () => {
  const bald = H.bestellPrognose(ub(100), wv, '2026-11-09', '2025-01');
  assert.deepStrictEqual([bald.leerAm, bald.spaetestensBestellen, bald.tage, bald.status], ['2027-02-10', '2026-11-26', 17, 'bald']);
  const jetzt = H.bestellPrognose(ub(40), wv, '2026-11-09', '2025-01');
  assert.deepStrictEqual([jetzt.leerAm, jetzt.spaetestensBestellen, jetzt.status], ['2026-12-11', '2026-09-27', 'jetzt bestellen']);
  assert.strictEqual(jetzt.ankunft, '2027-01-09', 'heute bestellt + 2 Monate');
  assert.strictEqual(jetzt.luecke, 29, '11.12. leer, 9.1. neue Flaschen');
  const mindest = H.bestellPrognose(ub(500, { mindestbestand: 170 }), wv, '2026-11-09', '2025-01');
  assert.deepStrictEqual(mindest.punkte[mindest.punkte.length - 1], { datum: '2027-04-30', bestand: 170 }, 'leer heißt: Mindestbestand erreicht');
  const lang = H.bestellPrognose(ub(1e7), wv, '2026-11-09', '2025-01');
  assert.deepStrictEqual([lang.leerAm, lang.reichtUeber, lang.spaetestensBestellen, lang.status], [null, '2029-02', null, 'ok'], '24 Monate + Vorlauf + Puffer');
  const leer = H.bestellPrognose(ub(0), wv, '2026-11-09', '2025-01');
  assert.deepStrictEqual([leer.leerAm, leer.status, leer.punkte.length], ['2026-11-09', 'jetzt bestellen', 1]);
  const weniger = H.bestellPrognose(ub(500), (m) => ({ flaschen: m >= '2026-05' && m <= '2026-10' ? 50 : VORJAHR[m] || 0 }), '2026-11-09', '2025-01');
  assert.strictEqual(weniger.wachstum, 0.5);
  assert.strictEqual(H.bestellPrognose(ub(null), wv, '2026-11-09', '2025-01'), null);
});

test('bestellPrognose: ohne volles Vorjahr die einfache Rechnung der Schnittstelle', () => {
  const pruefen = (p, warum, ankunft) => {
    assert.strictEqual(p.art, 'schnitt', warum);
    assert.deepStrictEqual([p.leerAm, p.spaetestensBestellen, p.status, p.tage], ['2027-02-26', '2026-12-12', 'bald', 33], warum);
    assert.deepStrictEqual(p.punkte, [{ datum: '2026-11-09', bestand: 500 }, { datum: '2027-02-26', bestand: 0 }], warum);
    assert.strictEqual(p.ankunft, ankunft === undefined ? '2027-02-12' : ankunft, warum);
  };
  pruefen(H.bestellPrognose(ub(500), wv, '2026-11-09', '2025-08'), 'Vorjahresmonate vor dem ersten Verkauf');
  pruefen(H.bestellPrognose(ub(500), wv, '2026-11-09', null), 'erster Monat unbekannt');
  pruefen(H.bestellPrognose(ub(500), (m) => (m === '2025-07' ? null : wv(m)), '2026-11-09', '2025-01'), 'Monat fehlt (ältere Schnittstelle)');
  pruefen(H.bestellPrognose(ub(500), (m) => ({ flaschen: m < '2026-01' ? 0 : VORJAHR[m] || 0 }), '2026-11-09', '2025-01'), 'im Vorjahr nichts verkauft');
  pruefen(H.bestellPrognose(ub(500, {}, { vorlaufMonate: undefined }), wv, '2026-11-09', '2025-01'), 'Vorlauf fehlt', null);
});

test('datumMonatePlus, ersterVerkaufsmonat und standText mit Prognose', () => {
  assert.strictEqual(H.datumMonatePlus('2027-03-31', -1), '2027-02-28');
  assert.strictEqual(H.datumMonatePlus('2026-11-09', 2), '2027-01-09');
  assert.strictEqual(H.datumMonatePlus('2028-03-31', -1), '2028-02-29');
  const z = H.verkaufZeilen({ zeilen: [['2025-02', '', 'K', 'Gutschrift', -24, -30], ['2025-03', '', 'K', 'A', 24, 30], ['2025-01', '', 'K', 'Null', 0, 0]] });
  assert.strictEqual(H.ersterVerkaufsmonat(null, z), '2025-03', 'Gutschriften und Nullzeilen zählen nicht');
  assert.strictEqual(H.ersterVerkaufsmonat({ vergleichsmonate: [{ monat: '2024-11', flaschen: 0 }, { monat: '2024-12', flaschen: 48 }], monate: [{ monat: '2025-01', flaschen: 10 }] }, null), '2024-12');
  assert.strictEqual(H.ersterVerkaufsmonat({}, null), null);
  const u = ub(500);
  const t = H.standText(u, null, '2026-11-09', H.bestellPrognose(u, wv, '2026-11-09', '2025-01'));
  assert.match(t, /📦 Bestand: 500 Flaschen \(geschätzt\)\n🛒 Abfüllung bestellen bis 10\. Mär 2027\n/);
  assert.match(H.standText(u, null, '2026-11-09'), /🛒 Abfüllung bestellen bis 12\. Dez 2026\n/, 'ohne Prognose die Schnittstelle');
});

test('Codex v24: Monatsende, Rechnungen mit Datum nach heute, Vorschau so weit wie Vorlauf und Puffer', () => {
  const je100 = () => ({ flaschen: 100, umsatz: 0 });
  // Am Monatsletzten geht im laufenden Monat nichts mehr weg (kein Sprung zum Folgetag), kein doppelter Punkt
  const ende = H.prognoseSaison(150, '2026-11-30', je100);
  assert.strictEqual(ende.leer, '2027-01-16');
  assert.deepStrictEqual(ende.punkte.map((x) => x.datum), ['2026-11-30', '2026-12-31', '2027-01-16']);
  assert.strictEqual(H.prognoseSaison(150, '2026-12-01', je100).leer, '2027-01-17', 'am Folgetag fast gleich');
  // Rechnung vom 20.11. steht schon im Sheet, der Bestand zieht sie erst dann ab: geht genau an dem Tag weg
  const vk = (kunde, datum, monat) => ({ zeilen: [[monat || '2026-11', datum, 'Karlsruhe', kunde, 100, 0, 'RE1']] });
  assert.deepStrictEqual(H.bekannteRechnungen(vk('Bar Eins', '2026-11-20'), '2026-11-09'), { geschrieben: { '2026-11': 100 }, abgaenge: { '2026-11-20': 100 } });
  assert.deepStrictEqual(H.bekannteRechnungen(vk('Bar Eins', '2026-11-08'), '2026-11-09').abgaenge, {}, 'schon abgezogen');
  assert.deepStrictEqual(H.bekannteRechnungen(vk('Dörflinger GmbH', '2026-11-20'), '2026-11-09').abgaenge, {}, 'Dörflinger zählt zum 31.10.');
  assert.deepStrictEqual(H.bekannteRechnungen(vk('Dörflinger GmbH', '2026-12-05', '2026-12'), '2026-11-09'),
    { geschrieben: { '2026-12': 100 }, abgaenge: { '2026-11-30': 100 } }, 'Dezember-Rechnung von Dörflinger geht am 30.11. weg');
  assert.deepStrictEqual(H.bekannteRechnungen(vk('Altliste', '', '2027-01'), '2026-11-09').abgaenge, { '2027-01-31': 100 }, 'Altzeile ohne Datum: Monatsende');
  assert.deepStrictEqual(H.bekannteRechnungen(vk('Altliste', '', '2026-11'), '2026-11-09').abgaenge, {}, 'laufender Monat: schon abgezogen');
  assert.strictEqual(H.bekannteRechnungen({}, '2026-11-09'), null);
  const u = ub(150, {}, { pufferWochen: 0 });
  const mitRechnung = H.bestellPrognose(u, je100, '2026-11-09', '2024-01', H.bekannteRechnungen(vk('Bar Eins', '2026-11-20'), '2026-11-09'));
  assert.deepStrictEqual([mitRechnung.leerAm, mitRechnung.spaetestensBestellen, mitRechnung.status], ['2026-12-16', '2026-10-16', 'jetzt bestellen']);
  const morgen = H.bestellPrognose(ub(50, {}, { vorlaufMonate: 0, pufferWochen: 0 }), je100, '2026-11-09', '2024-01', H.bekannteRechnungen(vk('Bar Eins', '2026-11-10'), '2026-11-09'));
  assert.strictEqual(morgen.leerAm, '2026-11-10', 'Rechnung über 100 am 10.11. bei 50 Flaschen: leer am 10.11.');
  const doerflinger = H.bestellPrognose(u, je100, '2026-11-09', '2024-01', H.bekannteRechnungen({ zeilen: [['2026-12', '2026-12-05', 'Karlsruhe', 'Dörflinger', 200, 0, 'RE2']] }, '2026-11-09'));
  assert.strictEqual(doerflinger.leerAm, '2026-11-30', '70 im November verteilt, 200 am 30.11.');
  const schonAbgezogen = H.bestellPrognose(u, je100, '2026-11-09', '2024-01', { geschrieben: { '2026-11': 100 }, abgaenge: {} });
  assert.strictEqual(schonAbgezogen.leerAm, '2027-01-16', 'Rechnung von gestern ist im Bestand schon abgezogen');
  // 30 Monate Vorlauf: Vorschau reicht weit genug, der fällige Termin wird nicht als „nicht in Sicht“ verdeckt
  const weit = H.bestellPrognose(ub(2600, {}, { vorlaufMonate: 30, pufferWochen: 0 }), je100, '2026-11-09', '2024-01');
  assert.strictEqual(weit.reichtUeber, null);
  assert.strictEqual(weit.status, 'jetzt bestellen');
  assert.ok(weit.spaetestensBestellen < '2026-11-09');
});

test('Mark 2026-11-09: Wachstum über die letzten 12 Monate, Monate vor dem Start zählen im Vorjahr als 0', () => {
  // Start im März 2025: Nov 2024 – Feb 2025 ohne Verkäufe, März–Okt 2025 je 100, danach je 150
  const w = (m) => ({ flaschen: m >= '2025-11' ? 150 : m >= '2025-03' ? 100 : 0, umsatz: 0 });
  const zwoelf = { abverkaufVon: '2025-11', abverkaufBis: '2026-10' };
  const p = H.bestellPrognose(ub(5000, zwoelf), w, '2026-11-09', '2025-03');
  assert.strictEqual(p.art, 'saison');
  assert.strictEqual(p.wachstum, 2.25, '12 × 150 gegen 8 × 100 (vier Monate vor dem Start zählen als 0)');
  // ältere Schnittstelle kennt die Monate vor dem Fenster nicht: vor dem Start trotzdem 0, kein Rückfall
  assert.strictEqual(H.bestellPrognose(ub(5000, zwoelf), (m) => (m < '2024-11' ? null : w(m)), '2026-11-09', '2025-03').wachstum, 2.25);
  // nur 5 von 12 Vorjahresmonaten nach dem Start: zu wenig, einfache Rechnung
  assert.strictEqual(H.bestellPrognose(ub(5000, zwoelf), w, '2026-11-09', '2025-06').art, 'schnitt');
  // 7 von 12 reichen
  assert.strictEqual(H.bestellPrognose(ub(5000, zwoelf), w, '2026-11-09', '2025-04').art, 'saison');
});

test('Codex 2026-11-10: Standort-Auswahl, eine gemischte Rechnung lässt sich mit jeder Wahl vereinheitlichen', () => {
  const orte = ['Lager Süd', 'Lager Nord', 'Lager Ost'];
  const werte = (a) => a.optionen.map((x) => x.wert);
  // ohne eigene Zuordnung: der Standard steht oben und nicht noch einmal darunter
  assert.deepStrictEqual(H.standortAuswahl({ standort: 'Lager Nord', standortGesetzt: false, gemischt: false }, orte), {
    wert: '', gesetzt: false, optionen: [{ wert: '', text: 'Lager Nord', gesperrt: false },
      { wert: 'Lager Süd', text: 'Lager Süd', gesperrt: false }, { wert: 'Lager Ost', text: 'Lager Ost', gesperrt: false }] });
  // mit Zuordnung: Zurücksetzen oben, darunter alle Standorte, auch ein inzwischen gestrichener
  const mit = H.standortAuswahl({ standort: 'Lager Ost', standortGesetzt: true, gemischt: false }, orte);
  assert.deepStrictEqual([mit.wert, mit.gesetzt], ['Lager Ost', true]);
  assert.deepStrictEqual(mit.optionen.map((x) => [x.wert, x.text, x.gesperrt]),
    [['', 'Standard (zurücksetzen)', false], ['Lager Süd', 'Lager Süd', false], ['Lager Nord', 'Lager Nord', false], ['Lager Ost', 'Lager Ost', false]]);
  assert.deepStrictEqual(werte(H.standortAuswahl({ standort: 'Altes Lager', standortGesetzt: true }, orte)),
    ['', 'Lager Süd', 'Lager Nord', 'Lager Ost', 'Altes Lager']);
  // gemischt: die gesperrte Zeile ist vorgewählt, jede andere (Standard und alle Standorte) ist damit eine Änderung
  [{ standort: 'Lager Nord', standortGesetzt: false, gemischt: true }, { standort: 'Lager Ost', standortGesetzt: true, gemischt: true }].forEach((r) => {
    const g = H.standortAuswahl(r, orte);
    assert.deepStrictEqual([g.wert, g.gesetzt], [H.STANDORT_VERSCHIEDEN, true]);
    assert.deepStrictEqual(g.optionen[0], { wert: H.STANDORT_VERSCHIEDEN, text: 'Verschieden', gesperrt: true });
    assert.deepStrictEqual(werte(g).slice(1), ['', 'Lager Süd', 'Lager Nord', 'Lager Ost']);
    assert.ok(g.optionen.slice(1).every((x) => !x.gesperrt && x.wert !== g.wert));
  });
  // unlesbare Eingaben werfen nicht
  assert.deepStrictEqual(H.standortAuswahl(null, null), { wert: '', gesetzt: false, optionen: [{ wert: '', text: '', gesperrt: false }] });

  // Rechnungsnummer wie in der Schnittstelle: nur „#Zahl“ am Ende ist ein Positions-Zusatz
  const z = H.verkaufZeilen({ zeilen: [['2026-02', '2026-02-03', 'Karlsruhe', 'A', 10, 12, 'R #x'], ['2026-02', '2026-02-03', 'Karlsruhe', 'A', 2, 0, 'R #y'],
    ['2026-02', '2026-02-04', 'Karlsruhe', 'A', 2, 0, 'RE8 #2 #3'], ['2026-02', '2026-02-04', 'Karlsruhe', 'A', 2, 0, 760175],
    ['2026-02', '2026-02-04', 'Karlsruhe', 'A', 2, 0, 'RE8']] });
  assert.deepStrictEqual(z.map((x) => x.rechnung), ['R #x', 'R #y', 'RE8', '760175', 'RE8']);
  assert.strictEqual(H.bestellungenZaehlen(z), 4);
});

test('Dashboard (v30): Monate mit Vormonat, Jahr, letzte Bestellungen, Kanäle', () => {
  const heute = '2026-11-10';
  const verkaeufe = { zeilen: [
    ['2025-10', '2025-10-05', 'Karlsruhe', 'Alt', 100, 120, 'RE1'],
    ['2025-11', '2025-11-20', 'Karlsruhe', 'Alt', 50, 60, 'RE2'],
    ['2026-07', '2026-07-03', 'Berlin', 'Späti', 200, 250, 'RE10'],
    ['2026-08', '2026-08-10', 'Karlsruhe', 'Bar', 400, 480, 'RE11'],
    ['2026-09', '', 'Ape', 'Fest', 100, 700, ''], // Altliste ohne Rechnungsdatum: zählt im Monat, ist aber keine „letzte Bestellung“
    ['2026-10', '2026-10-08', 'Karlsruhe', 'Bar', 300, 360, 'RE12'],
    ['2026-10', '2026-10-20', 'Karlsruhe', 'Bar', -20, -24, 'GS1'], // Gutschrift
    ['2026-11', '2026-11-06', 'Karlsruhe', 'Fachschaft', 103, 130.81, 'RE20'],
    ['2026-11', '2026-11-06', 'Karlsruhe', 'Fachschaft', 41, 38.28, 'RE20 #2'], // zweite Position derselben Rechnung
    ['2026-11', '2026-11-06', 'Heilbronn', 'Kiosk', 24, 30, ''],
    ['2026-11', '2026-11-06', 'Heilbronn', 'Kiosk', 12, 15, ''], // ohne Nummer: gleicher Kunde, gleicher Tag
    ['2026-11', '2026-11-09', 'Event', 'Messe', 10, 20, 'RE21'],
    ['2026-11', '2026-11-12', 'Berlin', 'Zukunft', 5, 5, 'RE22'], // Rechnungsdatum nach heute
  ] };
  const zeilen = H.verkaufZeilen(verkaeufe, heute);
  const werte = H.monatsWerte(verkaeufe, zeilen);
  const jv = H.jahresVergleich(werte, heute);
  const d = H.dashboardDaten(zeilen, werte, jv, heute);
  assert.strictEqual(d.heute, heute);
  assert.deepStrictEqual(d.monate, [
    { monat: '2026-11', laufend: true, flaschen: 195, umsatz: 239.09, pFlaschen: null, pUmsatz: null, anteil: 48.8 },
    { monat: '2026-10', laufend: false, flaschen: 280, umsatz: 336, pFlaschen: 180, pUmsatz: -52, anteil: 70 },
    { monat: '2026-09', laufend: false, flaschen: 100, umsatz: 700, pFlaschen: -75, pUmsatz: 46, anteil: 25 },
    { monat: '2026-08', laufend: false, flaschen: 400, umsatz: 480, pFlaschen: 100, pUmsatz: 92, anteil: 100 },
    { monat: '2026-07', laufend: false, flaschen: 200, umsatz: 250, pFlaschen: null, pUmsatz: null, anteil: 50 }, // Juni war 0: kein Vergleich
    { monat: '2026-06', laufend: false, flaschen: 0, umsatz: 0, pFlaschen: null, pUmsatz: null, anteil: 0 },
  ]);
  assert.strictEqual(d.laufend, d.monate[0]);
  assert.strictEqual(d.letzter, d.monate[1]);
  // Jahr: Januar bis heute; Vergleich über die vollen Monate beider Jahre (Jan–Okt: 980 Fl./1.766 € gegen 100 Fl./120 €)
  assert.deepStrictEqual(d.jahr, { jahr: 2026, flaschen: 1175, umsatz: 2005.09, pFlaschen: 880, pUmsatz: 1372 });
  // Bestellungen: neueste zuerst, am selben Tag die spätere Zeile zuerst; Positionen und „ohne Nummer“ zusammengezählt
  assert.deepStrictEqual(d.bestellungen, [
    { datum: '2026-11-09', kunde: 'Messe', kanal: 'Event', flaschen: 10, umsatz: 20 },
    { datum: '2026-11-06', kunde: 'Kiosk', kanal: 'Heilbronn', flaschen: 36, umsatz: 45 },
    { datum: '2026-11-06', kunde: 'Fachschaft', kanal: 'Karlsruhe', flaschen: 144, umsatz: 169.09 },
    { datum: '2026-10-08', kunde: 'Bar', kanal: 'Karlsruhe', flaschen: 300, umsatz: 360 },
    { datum: '2026-08-10', kunde: 'Bar', kanal: 'Karlsruhe', flaschen: 400, umsatz: 480 },
  ]);
  assert.deepStrictEqual(H.dashboardDaten(zeilen, werte, jv, heute, 3, 2).bestellungen.map((b) => b.kunde), ['Messe', 'Kiosk']);
  assert.deepStrictEqual(H.dashboardDaten(zeilen, werte, jv, heute, 3, 2).monate.map((m) => m.monat), ['2026-11', '2026-10', '2026-09']);
  // Kanäle dieses Jahr: fünf Kanäle → die drei größten und „Weitere“, Anteile an den gezeigten Flaschen
  assert.deepStrictEqual(d.kanaele, [
    { kanal: 'Karlsruhe', flaschen: 824, umsatz: 985.09, anteil: 70.1, anteilUmsatz: 49.1 },
    { kanal: 'Berlin', flaschen: 205, umsatz: 255, anteil: 17.4, anteilUmsatz: 12.7 },
    { kanal: 'Ape', flaschen: 100, umsatz: 700, anteil: 8.5, anteilUmsatz: 34.9 },
    { kanal: 'Weitere', flaschen: 46, umsatz: 65, anteil: 3.9, anteilUmsatz: 3.2 },
  ]);
  // bis vier Kanäle bleibt jeder für sich
  const vier = H.dashboardDaten(zeilen.filter((z) => z.kanal !== 'Event'), werte, jv, heute).kanaele;
  assert.deepStrictEqual(vier.map((k) => k.kanal), ['Karlsruhe', 'Berlin', 'Ape', 'Heilbronn']);

  // Codex v30: dieselbe Rechnungsnummer bei zwei Kunden (Tippfehler im Sheet) bleibt zwei Bestellungen
  const doppelt = H.verkaufZeilen({ zeilen: [['2026-11', '2026-11-08', 'Berlin', 'A', 24, 30, 'R1'], ['2026-11', '2026-11-09', 'Berlin', 'B', 48, 60, 'R1'],
    ['2026-11', '2026-11-09', 'Berlin', 'B', 12, 15, 'R1 #2']] }, heute);
  assert.deepStrictEqual(H.dashboardDaten(doppelt, werte, jv, heute).bestellungen.map((b) => [b.datum, b.kunde, b.flaschen, b.umsatz]),
    [['2026-11-09', 'B', 60, 75], ['2026-11-08', 'A', 24, 30]]);

  // Ältere Schnittstelle ohne Zeilen: Monate und Jahr aus den Monatswerten, keine Bestellungen und Kanäle
  const alt = H.dashboardDaten(null, werte, jv, heute);
  assert.deepStrictEqual(alt.monate, d.monate);
  assert.deepStrictEqual([alt.bestellungen, alt.kanaele], [[], []]);
  // Monat fehlt in den Daten (werte → null): Strich statt Zahl, kein Vergleich mit ihm
  const luecke = H.dashboardDaten(zeilen, (m) => (m === '2026-09' ? null : werte(m)), null, heute);
  assert.deepStrictEqual(luecke.monate.slice(1, 3).map((m) => [m.flaschen, m.pFlaschen]), [[280, null], [null, null]]);
  assert.strictEqual(luecke.jahr, null);
  // Januar: der letzte volle Monat ist der Dezember des Vorjahres, im neuen Jahr gibt es noch keine Kanäle
  const januar = H.dashboardDaten(zeilen, werte, H.jahresVergleich(werte, '2027-01-05'), '2027-01-05');
  assert.deepStrictEqual(januar.monate.slice(0, 3).map((m) => [m.monat, m.flaschen, m.pFlaschen]), [['2027-01', 0, null], ['2026-12', 0, -100], ['2026-11', 195, -30]]);
  assert.deepStrictEqual(januar.kanaele, []);
  assert.strictEqual(januar.bestellungen[0].kunde, 'Zukunft');
  // ungültige Eingaben
  assert.strictEqual(H.dashboardDaten(zeilen, werte, jv, 'gestern'), null);
  assert.strictEqual(H.dashboardDaten(zeilen, null, jv, heute), null);
});

test('Abfüllung eintragen: Herstellkosten pro Flasche aus dem Feld, Prüfung wie die Schnittstelle', () => {
  assert.deepStrictEqual(H.kostenAusEingabe(''), { leer: true, wert: null, fehler: '' });
  for (const leer of [null, undefined, '   ']) assert.strictEqual(H.kostenAusEingabe(leer).leer, true, String(leer));
  for (const [text, soll] of [[' 0,85 ', 0.85], ['0.8765', 0.8765], ['0,85 €', 0.85], ['1', 1], ['100', 100], ['12,5', 12.5]]) {
    assert.deepStrictEqual(H.kostenAusEingabe(text), { leer: false, wert: soll, fehler: '' }, text);
  }
  assert.strictEqual(H.kostenAusEingabe(' € ').leer, true, 'nur das Euro-Zeichen ist leer');
  for (const text of ['0', '0,0', '100,01', 'abc', '1,23456', '-1', '1.000,5', '0,9 2', '€ 5']) {
    const r = H.kostenAusEingabe(text);
    assert.deepStrictEqual([r.leer, r.wert, /^Herstellkosten:/.test(r.fehler)], [false, null, true], text);
  }
  const orte = ['Lager Süd', 'Lager Nord'];
  const b = (x) => H.buchungPruefen(Object.assign({ art: 'Abfüllung', standort: 'Lager Süd', nach: '', flaschen: 1000, datum: '2026-11-10', kommentar: '' }, x), orte, '2026-11-10');
  assert.strictEqual(b({}), '');
  assert.strictEqual(b({ kosten: null }), '');
  assert.strictEqual(b({ kosten: 0.8765 }), '');
  for (const k of [0, -1, 100.5, NaN, '0,85']) assert.match(b({ kosten: k }), /^Herstellkosten:/, String(k));
  assert.strictEqual(b({ art: 'Promo', kosten: -1 }), '', 'bei anderen Arten nicht beachtet');
});

test('Codex v32: „neu“ und „Kunde seit“ richten sich nach dem ersten Kauf, nicht nach einer früheren Gutschrift', () => {
  const zeilen = H.verkaufZeilen({ zeilen: [['2025-05', '2025-05-02', 'Berlin', 'A', -24, -30, 'G0'], ['2026-03', '2026-03-02', 'Berlin', 'A', 48, 60, 'R1'],
    ['2025-04', '2025-04-02', 'Berlin', 'B', 24, 30, 'R0'], ['2026-03', '2026-03-05', 'Berlin', 'B', 24, 30, 'R2'],
    ['2026-02', '2026-02-02', 'Berlin', 'C', -5, -6, 'G1']] }, '2026-11-10'); // C hat nie gekauft: erste Zeile
  const erster = Object.create(null);
  H.zeitraumAuswerten(zeilen, '2026-01', '2026-11').kunden.forEach((k) => { erster[k.kunde] = k.erster; });
  assert.deepStrictEqual(Object.assign({}, erster), { A: '2026-03', B: '2025-04', C: '2026-02' });
});

test('Dashboard (v31, v32): mehr Zahlen – Vorjahresvergleiche, Quartale, Jahre, Preise, Bestellgrößen, Kunden, Rekorde, Rohertrag und Marge', () => {
  const heute = '2026-11-10';
  // dieselben Verkäufe wie im Test davor
  const verkaeufe = { zeilen: [
    ['2025-10', '2025-10-05', 'Karlsruhe', 'Alt', 100, 120, 'RE1'],
    ['2025-11', '2025-11-20', 'Karlsruhe', 'Alt', 50, 60, 'RE2'],
    ['2026-07', '2026-07-03', 'Berlin', 'Späti', 200, 250, 'RE10'],
    ['2026-08', '2026-08-10', 'Karlsruhe', 'Bar', 400, 480, 'RE11'],
    ['2026-09', '', 'Ape', 'Fest', 100, 700, ''],
    ['2026-10', '2026-10-08', 'Karlsruhe', 'Bar', 300, 360, 'RE12'],
    ['2026-10', '2026-10-20', 'Karlsruhe', 'Bar', -20, -24, 'GS1'],
    ['2026-11', '2026-11-06', 'Karlsruhe', 'Fachschaft', 103, 130.81, 'RE20'],
    ['2026-11', '2026-11-06', 'Karlsruhe', 'Fachschaft', 41, 38.28, 'RE20 #2'],
    ['2026-11', '2026-11-06', 'Heilbronn', 'Kiosk', 24, 30, ''],
    ['2026-11', '2026-11-06', 'Heilbronn', 'Kiosk', 12, 15, ''],
    ['2026-11', '2026-11-09', 'Event', 'Messe', 10, 20, 'RE21'],
    ['2026-11', '2026-11-12', 'Berlin', 'Zukunft', 5, 5, 'RE22'],
  ] };
  const zeilen = H.verkaufZeilen(verkaeufe, heute);
  const werte = H.monatsWerte(verkaeufe, zeilen);
  const m = H.dashboardMehr(zeilen, werte, heute, 24);
  assert.deepStrictEqual([m.jahr, m.letzterMonat], [2026, '2026-10']);

  // Volle Monate gegen dieselben Monate im Vorjahr: 1, 3, 6, 12 Monate und das Jahr bis Oktober
  assert.deepStrictEqual(m.trend.map((x) => [x.art, x.monate, x.von, x.bis, x.flaschen, x.umsatz, x.vjFlaschen, x.vjUmsatz, x.pFlaschen, x.pUmsatz]), [
    ['monate', 1, '2026-10', '2026-10', 280, 336, 100, 120, 180, 180],
    ['monate', 3, '2026-08', '2026-10', 780, 1516, 100, 120, 680, 1163],
    ['monate', 6, '2026-05', '2026-10', 980, 1766, 100, 120, 880, 1372],
    ['monate', 12, '2025-11', '2026-10', 1030, 1826, 100, 120, 930, 1422],
    ['jahr', 10, '2026-01', '2026-10', 980, 1766, 100, 120, 880, 1372],
  ]);
  assert.strictEqual(m.vorjahrMonate.length, 12);
  assert.deepStrictEqual(m.vorjahrMonate.map((x) => [x.monat, x.flaschen, x.vjFlaschen, x.pFlaschen, x.anteil]).filter((x) => x[1] > 0), [
    ['2026-10', 280, 100, 180, 70], ['2026-09', 100, 0, null, 25], ['2026-08', 400, 0, null, 100], ['2026-07', 200, 0, null, 50], ['2025-11', 50, 0, null, 12.5]]);
  assert.deepStrictEqual([m.vorjahrMonate[0].monat, m.vorjahrMonate[11].monat], ['2026-10', '2025-11']);
  // Quartale: das laufende zählt bis heute und hat keinen Vergleich
  assert.deepStrictEqual(m.quartale.map((x) => [x.quartal, x.von, x.bis, x.laufend, x.flaschen, x.umsatz, x.pFlaschen]), [
    [1, '2026-01', '2026-03', false, 0, 0, null], [2, '2026-04', '2026-06', false, 0, 0, null], [3, '2026-07', '2026-09', false, 700, 1430, null],
    [4, '2026-10', '2026-12', true, 475, 575.09, null]]);
  // Tempo: 1.175 Flaschen und 2.005,09 € in 314 Tagen (1.1. bis 10.11.)
  assert.deepStrictEqual(m.tempo, { tage: 314, flaschenProTag: 3.74, umsatzProTag: 6.39 });

  // Kanäle mit beiden Anteilen (Summe 1.175 Flaschen, 2.005,09 €), Reihenfolge wie die Balken in dashboardDaten
  assert.deepStrictEqual(m.kanaele, [
    { kanal: 'Karlsruhe', flaschen: 824, umsatz: 985.09, anteilFlaschen: 70.1, anteilUmsatz: 49.1, proFlasche: 1.2 },
    { kanal: 'Berlin', flaschen: 205, umsatz: 255, anteilFlaschen: 17.4, anteilUmsatz: 12.7, proFlasche: 1.24 },
    { kanal: 'Ape', flaschen: 100, umsatz: 700, anteilFlaschen: 8.5, anteilUmsatz: 34.9, proFlasche: 7 },
    { kanal: 'Heilbronn', flaschen: 36, umsatz: 45, anteilFlaschen: 3.1, anteilUmsatz: 2.2, proFlasche: 1.25 },
    { kanal: 'Event', flaschen: 10, umsatz: 20, anteilFlaschen: 0.9, anteilUmsatz: 1, proFlasche: 2 },
  ]);
  const balken = H.dashboardDaten(zeilen, werte, H.jahresVergleich(werte, heute), heute).kanaele;
  assert.deepStrictEqual(m.kanaele.slice(0, 3).map((x) => x.kanal), balken.slice(0, 3).map((x) => x.kanal));

  // Jahre und alles zusammen: die Gutschrift GS1 zählt bei Flaschen und Umsatz, ist aber keine Bestellung
  assert.deepStrictEqual(m.jahre, [
    { jahr: 2026, flaschen: 1175, umsatz: 2005.09, proFlasche: 1.71, bestellungen: 8, kunden: 7 },
    { jahr: 2025, flaschen: 150, umsatz: 180, proFlasche: 1.2, bestellungen: 2, kunden: 1 },
  ]);
  assert.deepStrictEqual(m.gesamt, { flaschen: 1325, umsatz: 2185.09, proFlasche: 1.65, bestellungen: 10, kunden: 8, erster: '2025-10', monate: 14,
    proMonat: { flaschen: 86.92, umsatz: 149.69 }, liter: 437.25, mehrfach: 2 }); // Ø über die 13 vollen Monate: 1.130 Fl., 1.946 €
  // Umsatz pro Flasche: dieses Jahr gegen das ganze Vorjahr (1,71 € gegen 1,20 €)
  assert.deepStrictEqual(m.preise, [
    { name: '', proFlasche: 1.71, vorjahr: 1.2, p: 43 }, { name: 'Karlsruhe', proFlasche: 1.2, vorjahr: 1.2, p: 0 },
    { name: 'Berlin', proFlasche: 1.24, vorjahr: null, p: null }, { name: 'Ape', proFlasche: 7, vorjahr: null, p: null },
    { name: 'Heilbronn', proFlasche: 1.25, vorjahr: null, p: null }, { name: 'Event', proFlasche: 2, vorjahr: null, p: null }]);

  // Bestellungen 2026: 5, 10, 36, 100, 144, 200, 300, 400 Flaschen (Summe 1.195), Median (100 + 144) / 2
  assert.deepStrictEqual(m.bestellungen, { anzahl: 8, flaschen: 149.38, median: 122, umsatz: 253.64, proMonat: 0.73,
    groesste: { flaschen: 400, umsatz: 480, kunde: 'Bar', datum: '2026-08-10', monat: '2026-08' } });
  assert.deepStrictEqual(m.groessen, [
    { abKisten: 0, bisKisten: 1, anzahl: 2, flaschen: 15, anteil: 1.3 }, { abKisten: 1, bisKisten: 4, anzahl: 1, flaschen: 36, anteil: 3 },
    { abKisten: 4, bisKisten: 10, anzahl: 3, flaschen: 444, anteil: 37.2 }, { abKisten: 10, bisKisten: 20, anzahl: 2, flaschen: 700, anteil: 58.6 },
    { abKisten: 20, bisKisten: null, anzahl: 0, flaschen: 0, anteil: 0 }]);
  assert.strictEqual(H.dashboardMehr(zeilen, werte, heute, 6).groessen[4].anzahl, 4, 'Kiste mit 6 Flaschen: 144, 200, 300 und 400 liegen über 120 Flaschen');

  // Kunden 2026: sieben, alle neu; „Alt“ hat 2025 gekauft und 2026 noch nicht
  assert.deepStrictEqual(m.kunden, { aktiv: 7, neu: 7, wieder: 0, nichtMehr: 1, flaschen: 167.86, umsatz: 286.44, bestellungen: 1.14 });
  assert.deepStrictEqual(m.top.map((x) => [x.rang, x.kunde, x.flaschen, x.umsatz, x.anteil, x.kumuliert]), [
    [1, 'Bar', 680, 816, 57.9, 57.9], [2, 'Späti', 200, 250, 17, 74.9], [3, 'Fachschaft', 144, 169.09, 12.3, 87.1], [4, 'Fest', 100, 700, 8.5, 95.7],
    [5, 'Kiosk', 36, 45, 3.1, 98.7], [6, 'Messe', 10, 20, 0.9, 99.6], [7, 'Zukunft', 5, 5, 0.4, 100]]);
  assert.deepStrictEqual(m.rekorde, { monatFlaschen: { monat: '2026-08', flaschen: 400 }, monatUmsatz: { monat: '2026-09', umsatz: 700 },
    bestellung: { flaschen: 400, umsatz: 480, kunde: 'Bar', datum: '2026-08-10', monat: '2026-08' }, kunde: { kunde: 'Bar', flaschen: 680, umsatz: 816 },
    treu: { kunde: 'Bar', anzahl: 2 } });

  // Codex v31: Kunden zählen nach dem Saldo, „neu“ nach dem ersten Kauf, Balken und Tabelle teilen den Umsatz gleich
  const gut = H.verkaufZeilen({ zeilen: [['2025-05', '2025-05-02', 'Berlin', 'A', 24, 30, 'R1'], ['2025-06', '2025-06-02', 'Berlin', 'B', -24, -30, 'G0'],
    ['2026-03', '2026-03-02', 'Berlin', 'A', 24, 30, 'R2'], ['2026-03', '2026-03-09', 'Berlin', 'A', -24, -30, 'G1'], // A: gekauft und alles gutgeschrieben
    ['2026-04', '2026-04-02', 'Berlin', 'B', 48, 60, 'R3']] }, heute); // B: früher nur eine Gutschrift, jetzt der erste Kauf
  const gm = H.dashboardMehr(gut, H.monatsWerte({ zeilen: [] }, gut), heute, 24);
  assert.deepStrictEqual(gm.jahre.map((x) => [x.jahr, x.bestellungen, x.kunden]), [[2026, 2, 1], [2025, 1, 1]]);
  assert.deepStrictEqual(gm.kunden, { aktiv: 1, neu: 1, wieder: 0, nichtMehr: 1, flaschen: 48, umsatz: 60, bestellungen: 1 });
  assert.strictEqual(gm.gesamt.kunden, 2, 'A (24 unter dem Strich) und B (24)');
  const fuenf = H.verkaufZeilen({ zeilen: [['2026-02', '2026-02-01', 'A', 'a', 100, 100, 'K1'], ['2026-02', '2026-02-01', 'B', 'b', 90, 90, 'K2'],
    ['2026-02', '2026-02-01', 'C', 'c', 80, 80, 'K3'], ['2026-02', '2026-02-01', 'D', 'd', 70, 70, 'K4'], ['2026-02', '2026-02-01', 'E', 'e', 60, -60, 'K5']] }, heute);
  const fw = H.monatsWerte({ zeilen: [] }, fuenf);
  const fb = H.dashboardDaten(fuenf, fw, H.jahresVergleich(fw, heute), heute).kanaele;
  const ft = H.dashboardMehr(fuenf, fw, heute, 24).kanaele;
  assert.deepStrictEqual(fb.map((x) => [x.kanal, x.anteilUmsatz]), [['A', 29.4], ['B', 26.5], ['C', 23.5], ['Weitere', 20.6]]); // 100/90/80/70 von 340 €
  assert.deepStrictEqual(ft.map((x) => [x.kanal, x.anteilUmsatz]), [['A', 29.4], ['B', 26.5], ['C', 23.5], ['D', 20.6], ['E', 0]]);

  // Rohertrag und Marge (v32): Herstellkosten je Abfüllung, verteilt nach First in, First out
  assert.strictEqual(m.marge, null, 'ohne Abfüllungen keine Marge');
  assert.strictEqual(H.dashboardMehr(zeilen, werte, heute, 24, [{ abfuellung: '1. Abfüllung', monat: '2025-09', flaschen: 500 }]).marge, null,
    'Schnittstelle ohne Kosten-Spalte');
  assert.strictEqual(H.fifoSchichten(null), null);
  // 500 Flaschen zu 1 €, danach 2.000 Flaschen zu 0,50 €; die Reihenfolge im Sheet ist egal, es zählt der Monat
  const abf = [{ abfuellung: '2. Abfüllung', monat: '2026-07', flaschen: 2000, kostenProFlasche: 0.5 },
    { abfuellung: '1. Abfüllung', monat: '2025-09', flaschen: 500, kostenProFlasche: 1 }];
  const schichten = H.fifoSchichten(abf);
  assert.deepStrictEqual(schichten, [{ name: '1. Abfüllung', monat: '2025-09', flaschen: 500, kosten: 1 }, { name: '2. Abfüllung', monat: '2026-07', flaschen: 2000, kosten: 0.5 }]);
  // Zeile für Zeile: 100 + 50 + 200 aus der ersten Abfüllung; die 400 im August sind 150 × 1 € + 250 × 0,50 €; danach
  // alles zu 0,50 €; die Gutschrift (−20) legt die zuletzt verkauften Flaschen zurück
  assert.deepStrictEqual(H.fifoKosten(zeilen, schichten).kosten, [100, 50, 200, 275, 50, 150, -10, 51.5, 20.5, 12, 6, 5, 2.5]);
  const mg = H.dashboardMehr(zeilen, werte, heute, 24, abf).marge;
  assert.deepStrictEqual(mg.schichten, [{ name: '1. Abfüllung', monat: '2025-09', flaschen: 500, kosten: 1, verbraucht: 500, rest: 0 },
    { name: '2. Abfüllung', monat: '2026-07', flaschen: 2000, kosten: 0.5, verbraucht: 825, rest: 1175 }]);
  assert.deepStrictEqual([mg.verluste, mg.nach], [null, null], 'Schnittstelle ohne Abgänge und Schwund: keine Aussage');
  assert.deepStrictEqual(mg.flaschen, { abgefuellt: 2500, verkauft: 1325, abgaenge: 0, schwund: 0, luecke: 0, uebrig: 1175 });
  // Je Abfüllung (v34), nur ihre verkauften Flaschen. Erste: 100 + 50 + 200 und 150 der 400 vom August, deren Umsatz
  // anteilig nach Flaschen (480 € × 150/400 = 180 €): 610 € Umsatz − 500 € = 110 € (18,0 %). Zweite: die übrigen 250
  // vom August (300 €) und alles danach: 825 Flaschen, 1.575,09 € − 412,50 € = 1.162,59 € (73,8 %).
  // Zusammen 2.185,09 € Umsatz, 912,50 € Kosten und 1.272,59 € Rohertrag wie `gesamt`.
  const nichtsWeg = { weg: { flaschen: 0, kosten: 0 }, luecke: 0 };
  assert.deepStrictEqual(mg.abfuellungen, [
    Object.assign({ name: '1. Abfüllung', monat: '2025-09', abgefuellt: 500, rest: 0, flaschen: 500, umsatz: 610, kosten: 500, rohertrag: 110, marge: 18, aufschlag: 22,
      proFlasche: 0.22, kostenProFlasche: 1 }, nichtsWeg, { bleibt: 110 }),
    Object.assign({ name: '2. Abfüllung', monat: '2026-07', abgefuellt: 2000, rest: 1175, flaschen: 825, umsatz: 1575.09, kosten: 412.5, rohertrag: 1162.59, marge: 73.8,
      aufschlag: 281.8, proFlasche: 1.41, kostenProFlasche: 0.5 }, nichtsWeg, { bleibt: 1162.59 })]);
  // Woher die Flaschen jeder Zeile kamen: der August aus beiden Abfüllungen, die Gutschrift zurück in die zweite
  assert.deepStrictEqual(H.fifoKosten(zeilen, schichten).teile.slice(2, 7), [[[0, 200]], [[0, 150], [1, 250]], [[1, 100]], [[1, 300]], [[1, -20]]]);
  assert.deepStrictEqual([mg.aktuell, mg.ueber, mg.fehlt], [{ name: '2. Abfüllung', kosten: 0.5, rest: 1175, mehr: false }, 0, []]);
  // 2026: 2.005,09 € Umsatz − 762,50 € Herstellkosten = 1.242,59 €; Marge vom Umsatz 62,0 %, Aufschlag auf die Kosten 163,0 %
  assert.deepStrictEqual(mg.jahr, { flaschen: 1175, umsatz: 2005.09, kosten: 762.5, rohertrag: 1242.59, marge: 62, aufschlag: 163, proFlasche: 1.06, kostenProFlasche: 0.65 });
  assert.deepStrictEqual(mg.vorjahr, { flaschen: 150, umsatz: 180, kosten: 150, rohertrag: 30, marge: 16.7, aufschlag: 20, proFlasche: 0.2, kostenProFlasche: 1 });
  assert.deepStrictEqual(mg.gesamt, { flaschen: 1325, umsatz: 2185.09, kosten: 912.5, rohertrag: 1272.59, marge: 58.2, aufschlag: 139.5, proFlasche: 0.96, kostenProFlasche: 0.69 });
  // Auswerten (v35) rechnet mit denselben Herstellkosten je Zeile: Jahr, Vorjahr, alles zusammen und die Kanäle stimmen überein
  assert.deepStrictEqual(mg.kostenJeZeile, H.fifoKosten(zeilen, schichten).kosten);
  const aw = (wahl) => H.auswerten(zeilen, mg.kostenJeZeile, heute, wahl);
  const kern = (x) => [x.flaschen, x.umsatz, x.kosten, x.rohertrag, x.marge];
  assert.deepStrictEqual([kern(aw({ jahr: 2026 }).summe), kern(aw({ jahr: 2025 }).summe), kern(aw({}).summe)], [kern(mg.jahr), kern(mg.vorjahr), kern(mg.gesamt)]);
  assert.deepStrictEqual(aw({ kennzahl: 'rohertrag', jahr: 2026, nach: 'kanal' }).gruppen.map((g) => [g.name, g.rohertrag, g.marge]).sort(),
    mg.kanaele.map((x) => [x.kanal, x.rohertrag, x.marge]).sort());
  assert.deepStrictEqual([aw({ jahr: 2026 }).summe.bestellungen, aw({ jahr: 2026 }).summe.kunden, aw({}).summe.bestellungen, aw({}).summe.kunden],
    [m.jahre[0].bestellungen, m.jahre[0].kunden, m.gesamt.bestellungen, m.gesamt.kunden]);
  assert.deepStrictEqual(mg.kanaele.map((x) => [x.kanal, x.kosten, x.rohertrag, x.marge, x.anteil]), [
    ['Karlsruhe', 487, 498.09, 50.6, 40.1], ['Berlin', 202.5, 52.5, 20.6, 4.2], ['Ape', 50, 650, 92.9, 52.3], ['Heilbronn', 18, 27, 60, 2.2], ['Event', 5, 15, 75, 1.2]]);
  assert.strictEqual(Math.round(mg.kanaele.reduce((x, y) => x + y.rohertrag, 0) * 100) / 100, mg.jahr.rohertrag, 'Kanäle zusammen = Jahr');
  assert.deepStrictEqual(mg.monate.map((x) => [x.monat, x.kosten, x.rohertrag, x.marge, x.balken]).filter((x) => x[2] !== 0), [
    ['2026-10', 140, 196, 58.3, 30.2], ['2026-09', 50, 650, 92.9, 100], ['2026-08', 275, 205, 42.7, 31.5], ['2026-07', 200, 50, 20, 7.7], ['2025-11', 50, 10, 16.7, 1.5]]);
  assert.deepStrictEqual([mg.monate.length, mg.monate[4].marge, mg.monate[4].kosten], [12, null, 0], 'Monat ohne Verkäufe: keine Marge');
  // Kunden nach Rohertrag: „Fest“ (100 Flaschen zu 7 €) vor „Bar“ (680 Flaschen zu 1,20 €)
  assert.deepStrictEqual(mg.top.map((x) => [x.rang, x.kunde, x.flaschen, x.rohertrag, x.marge, x.anteil]), [
    [1, 'Fest', 100, 650, 92.9, 52.3], [2, 'Bar', 680, 401, 49.1, 32.3], [3, 'Fachschaft', 144, 97.09, 57.4, 7.8], [4, 'Späti', 200, 50, 20, 4],
    [5, 'Kiosk', 36, 27, 60, 2.2], [6, 'Messe', 10, 15, 75, 1.2], [7, 'Zukunft', 5, 2.5, 50, 0.2]]);
  assert.deepStrictEqual(mg.unterKosten, { anzahl: 0, flaschen: 0, anteil: 0 });
  // Zweite Abfüllung zu 1,30 €: vier Bestellungen daraus (300, 144, 36 und 5 von 1.195 Flaschen) decken ihre Kosten nicht
  const teuer = H.dashboardMehr(zeilen, werte, heute, 24, [abf[1], Object.assign({}, abf[0], { kostenProFlasche: 1.3 })]).marge;
  assert.deepStrictEqual(teuer.unterKosten, { anzahl: 4, flaschen: 485, anteil: 40.6 });
  // Kosten der zweiten Abfüllung fehlen: alles, was sie berührt, bleibt ohne Rohertrag; die erste rechnet weiter
  const offen = H.dashboardMehr(zeilen, werte, heute, 24, [abf[1], { abfuellung: '2. Abfüllung', monat: '2026-07', flaschen: 2000, kostenProFlasche: null }]).marge;
  assert.deepStrictEqual(offen.fehlt, ['2. Abfüllung']);
  assert.deepStrictEqual([offen.jahr.flaschen, offen.jahr.umsatz, offen.jahr.kosten, offen.jahr.rohertrag, offen.jahr.marge], [1175, 2005.09, null, null, null]);
  assert.deepStrictEqual([offen.vorjahr.rohertrag, offen.gesamt.rohertrag], [30, null]);
  assert.deepStrictEqual(offen.monate.slice(0, 4).map((x) => [x.monat, x.rohertrag]), [['2026-10', null], ['2026-09', null], ['2026-08', null], ['2026-07', 50]]);
  assert.deepStrictEqual(offen.top.map((x) => [x.kunde, x.rohertrag]).slice(0, 2), [['Späti', 50], ['Bar', null]]);
  assert.deepStrictEqual(offen.unterKosten.anzahl, 0);
  assert.deepStrictEqual(offen.abfuellungen.map((x) => [x.flaschen, x.umsatz, x.rohertrag, x.bleibt]), [[500, 610, 110, 110], [825, 1575.09, null, null]]);
  // Mehr verkauft als abgefüllt: Der Überhang rechnet mit den Kosten der letzten Abfüllung
  const knapp = H.dashboardMehr(zeilen, werte, heute, 24, [{ abfuellung: '1. Abfüllung', monat: '2025-09', flaschen: 1000, kostenProFlasche: 1 }]).marge;
  assert.deepStrictEqual([knapp.ueber, knapp.gesamt.kosten, knapp.schichten[0].rest, knapp.aktuell], [325, 1325, 0, null]);
  assert.deepStrictEqual(knapp.abfuellungen.map((x) => [x.abgefuellt, x.flaschen, x.umsatz, x.kosten]), [[1000, 1325, 2185.09, 1325]], 'der Überhang zählt zur letzten Abfüllung');
  // Storno einer Abfüllung („Storno N. Abfüllung“ mit negativen Flaschen) hebt ihre Schicht auf
  assert.deepStrictEqual(H.fifoSchichten(abf.concat([{ abfuellung: '3. Abfüllung', monat: '2026-09', flaschen: 800, kostenProFlasche: 9 },
    { abfuellung: 'Storno 3. Abfüllung', monat: '2026-09', flaschen: -800, kostenProFlasche: 9 }])), schichten);
  // Gutschrift vor dem ersten Verkauf: Kosten der ersten Abfüllung mit Minus, der nächste Verkauf holt sie wieder
  assert.deepStrictEqual(H.fifoKosten([{ monat: '2025-01', datum: '', flaschen: -10 }, { monat: '2025-02', datum: '2025-02-03', flaschen: 30 }, { monat: '2025-02', datum: '', flaschen: 0 }], schichten).kosten,
    [-10, 30, 0]);
  // Reihenfolge nach dem Rechnungsdatum, nicht nach der Stelle in der Liste (ohne Datum zählt das Monatsende)
  assert.deepStrictEqual(H.fifoKosten([{ monat: '2025-03', datum: '', flaschen: 100 }, { monat: '2025-03', datum: '2025-03-05', flaschen: 450 }], schichten).kosten, [75, 450]);
  assert.strictEqual(H.dashboardMehr(null, werte, heute, 24, abf).marge, null, 'ältere Schnittstelle ohne Zeilen');
  assert.strictEqual(mg.abweichung, 0);

  // Promo, Bruch und Eigenverbrauch (v33) brauchen die Abfüllungen genauso auf. Die Flaschen sind bezahlt und weg:
  // Ihre Herstellkosten stehen bei keinem Verkauf, sondern als Verlust für sich und gehen vom Rohertrag ab.
  // 60 Promo am 10.10.2025 und 100 Bruch am 1.7.2026 kommen aus der ersten Abfüllung (160 €). Der Verkauf vom 3.7.
  // (200 Flaschen) bekommt dadurch nur noch 190 zu 1 € und 10 zu 0,50 €, der vom August liegt ganz in der zweiten.
  const lager = { abgaenge: [['2025-10-10', 60, 'Promo'], ['2026-07-01', 100, 'Bruch'], ['2026-11-11', 5, 'Promo'], ['Quatsch', 5, 'Promo'], ['2026-01-01', -3, 'Bruch']] };
  const mitAbgang = H.fifoKosten(zeilen, schichten, [{ datum: '2025-10-10', flaschen: 60 }, { datum: '2026-07-01', flaschen: 100 }]);
  assert.deepStrictEqual(mitAbgang.kosten, [100, 50, 195, 200, 50, 150, -10, 51.5, 20.5, 12, 6, 5, 2.5]);
  assert.deepStrictEqual(mitAbgang.abgang, [60, 100]);
  assert.deepStrictEqual(mitAbgang.schichten.map((x) => [x.verbraucht, x.rest]), [[500, 0], [985, 1015]]);
  const ma = H.dashboardMehr(zeilen, werte, heute, 24, abf, lager).marge;
  const null3 = { jahr: { flaschen: 0, kosten: 0 }, vorjahr: { flaschen: 0, kosten: 0 }, gesamt: { flaschen: 0, kosten: 0 } };
  // Der Abgang nach heute und die ungültigen Zeilen zählen nicht: 2026 nur der Bruch, 2025 nur die Promo
  assert.deepStrictEqual(ma.verluste, { jahr: { flaschen: 100, kosten: 100 }, vorjahr: { flaschen: 60, kosten: 60 }, gesamt: { flaschen: 160, kosten: 160 }, anzahl: 2,
    arten: [{ art: 'Promo', jahr: { flaschen: 0, kosten: 0 }, vorjahr: { flaschen: 60, kosten: 60 }, gesamt: { flaschen: 60, kosten: 60 } },
      Object.assign({ art: 'Eigenverbrauch' }, null3),
      { art: 'Bruch', jahr: { flaschen: 100, kosten: 100 }, vorjahr: { flaschen: 0, kosten: 0 }, gesamt: { flaschen: 100, kosten: 100 } },
      Object.assign({ art: 'Schwund' }, null3)],
    luecke: null,
    monate: [{ monat: '2026-07', flaschen: 100, kosten: 100 }, { monat: '2025-10', flaschen: 60, kosten: 60 }] });
  assert.deepStrictEqual([ma.mehr, ma.schichten[1].rest, ma.aktuell.name], [0, 1015, '2. Abfüllung']);
  // Flaschen-Abgleich: 2.500 abgefüllt − 1.325 verkauft − 160 gebucht weg = 1.015 übrig (die Reste der Abfüllungen)
  assert.deepStrictEqual(ma.flaschen, { abgefuellt: 2500, verkauft: 1325, abgaenge: 160, schwund: 0, luecke: 0, uebrig: 1015 });
  // Je Abfüllung: Aus der ersten gingen 340 in den Verkauf (100 + 50 + 190 der 200 vom 3.7., Umsatz 250 € × 190/200 =
  // 237,50 €) und 160 ohne Verkauf weg: 417,50 € − 340 € = 77,50 € Rohertrag (18,6 %), nach 160 € Abgängen −82,50 €.
  // Die Marge der ersten Abfüllung bleibt die ihrer verkauften Flaschen. Zweite: 985 verkauft, 1.767,59 € − 492,50 €.
  // Zusammen 1.352,59 € Rohertrag, es bleiben 1.192,59 € wie in `nach.gesamt`.
  assert.deepStrictEqual(ma.abfuellungen.map((x) => [x.abgefuellt, x.flaschen, x.weg, x.luecke, x.rest, x.umsatz, x.kosten, x.rohertrag, x.marge, x.bleibt]), [
    [500, 340, { flaschen: 160, kosten: 160 }, 0, 0, 417.5, 340, 77.5, 18.6, -82.5],
    [2000, 985, { flaschen: 0, kosten: 0 }, 0, 1015, 1767.59, 492.5, 1275.09, 72.1, 1275.09]]);
  // 2026: Herstellkosten der Verkäufe 682,50 € (statt 762,50 €), Rohertrag aus den Verkäufen 1.322,59 €
  assert.deepStrictEqual(ma.jahr, { flaschen: 1175, umsatz: 2005.09, kosten: 682.5, rohertrag: 1322.59, marge: 66, aufschlag: 193.8, proFlasche: 1.13, kostenProFlasche: 0.58 });
  assert.deepStrictEqual(ma.vorjahr.kosten, 150);
  // Nach Abgängen, nur in Euro: 2026 1.322,59 € − 100 € Bruch = 1.222,59 € (100 € auf 1.175 verkaufte Flaschen = 9 Cent);
  // 2025 30 € − 60 € Promo = −30 € (60 € auf 150 Flaschen); gesamt 1.352,59 € − 160 € = 1.192,59 €.
  // Kein Prozentwert: Die Marge bleibt die der verkauften Flaschen (66,0 % für 2026, siehe oben), Abgänge senken sie nicht.
  assert.deepStrictEqual(ma.nach, { jahr: { rohertrag: 1322.59, abgaenge: 100, flaschen: 100, bleibt: 1222.59, proFlasche: 0.09 },
    vorjahr: { rohertrag: 30, abgaenge: 60, flaschen: 60, bleibt: -30, proFlasche: 0.4 },
    gesamt: { rohertrag: 1352.59, abgaenge: 160, flaschen: 160, bleibt: 1192.59, proFlasche: 0.12 } });
  // Die Schnittstelle kennt Abgänge, es gab aber keine: alles 0, nach Abgängen bleibt der Rohertrag
  const ohneAbgang = H.dashboardMehr(zeilen, werte, heute, 24, abf, { abgaenge: [], schwund: [] }).marge;
  assert.deepStrictEqual([ohneAbgang.verluste.anzahl, ohneAbgang.verluste.gesamt, ohneAbgang.verluste.monate, ohneAbgang.nach.jahr.bleibt, ohneAbgang.jahr.marge],
    [0, { flaschen: 0, kosten: 0 }, [], 1242.59, 62]);
  // Schwund aus den Zählungen liefert die Schnittstelle fertig. Eine Nachzählung am 31.10.2026 mit 115 fehlenden
  // Flaschen geht an ihrem Tag ab (115 × 0,50 € aus der zweiten Abfüllung = 57,50 € Verlust), die Reste sinken auf 900
  const mitSchwund = (schwund) => H.dashboardMehr(zeilen, werte, heute, 24, abf, Object.assign({ schwund: schwund }, lager)).marge;
  const schwundArt = (x) => x.verluste.arten.find((y) => y.art === 'Schwund');
  const gezaehlt = mitSchwund([['2026-10-31', 115, 'Lager Süd']]);
  assert.deepStrictEqual([schwundArt(gezaehlt).jahr, gezaehlt.verluste.jahr, gezaehlt.verluste.gesamt, gezaehlt.verluste.anzahl],
    [{ flaschen: 115, kosten: 57.5 }, { flaschen: 215, kosten: 157.5 }, { flaschen: 275, kosten: 217.5 }, 3]);
  assert.deepStrictEqual([gezaehlt.schichten.map((x) => x.rest), gezaehlt.mehr, gezaehlt.ueber], [[0, 900], 0, 0]);
  assert.deepStrictEqual(gezaehlt.flaschen, { abgefuellt: 2500, verkauft: 1325, abgaenge: 160, schwund: 115, luecke: 0, uebrig: 900 });
  assert.deepStrictEqual([gezaehlt.verluste.luecke, gezaehlt.abfuellungen[1].weg, gezaehlt.abfuellungen[1].bleibt], [null, { flaschen: 115, kosten: 57.5 }, 1217.59],
    'Schwund nach einer Zählung geht zulasten seiner Abfüllung: 1.275,09 € − 57,50 €');
  assert.deepStrictEqual(gezaehlt.jahr.kosten, 682.5, 'die Kosten der Verkäufe bleiben (alles schon in der zweiten Abfüllung)');
  assert.deepStrictEqual([gezaehlt.nach.jahr.abgaenge, gezaehlt.nach.jahr.bleibt], [157.5, 1165.09], '1.322,59 € − 100 € Bruch − 57,50 € Schwund');
  // Eine weitere Zählung ohne Abweichung (0) und Ereignisse nach heute oder ohne Datum ändern nichts
  assert.deepStrictEqual(mitSchwund([['2026-10-31', 115, 'Lager Süd'], ['2026-11-05', 0, 'Lager Süd'], ['2026-12-01', 30, 'X'], ['Quatsch', 5, '']]), gezaehlt);
  // Mehr gezählt als gerechnet (−85): die zuletzt ohne Verkauf abgegangenen Flaschen kommen zurück, das sind 85 der 100
  // Bruch-Flaschen vom 1.7. aus der ersten Abfüllung (85 € weniger Verlust). Der nächste Verkauf (103 Flaschen am 6.11.)
  // nimmt erst sie (85 × 1 €), dann 18 aus der zweiten (9 €). Kosten der Verkäufe 2026 damit 725 € statt 682,50 €.
  const mehrDa = mitSchwund([['2026-10-31', -85, 'Lager Süd']]);
  assert.deepStrictEqual([schwundArt(mehrDa).jahr, mehrDa.verluste.jahr, mehrDa.schichten.map((x) => x.rest), mehrDa.jahr.kosten],
    [{ flaschen: -85, kosten: -85 }, { flaschen: 15, kosten: 15 }, [0, 1100], 725]);
  assert.deepStrictEqual(mehrDa.flaschen, { abgefuellt: 2500, verkauft: 1325, abgaenge: 160, schwund: -85, luecke: 0, uebrig: 1100 });
  // Alte Lücke (leerer Standort: 40 Flaschen fehlten schon, als am 1.1.2026 zum ersten Mal alle Lager gezählt waren)
  // und später eine Nachzählung (10). Beide brauchen die Abfüllungen an ihrem Tag auf: Reste 2.500 − 1.325 − 160 − 40
  // − 10 = 965. Schwund ist aber nur die Nachzählung (10 Flaschen, 5 €). Die alte Lücke (40 Flaschen aus der ersten
  // Abfüllung, 40 €) steht für sich (v34): in keinem Jahr, keinem Monat und keiner Art, nur in „seit dem Start“.
  const beides = mitSchwund([['2026-01-01', 40, ''], ['2026-10-31', 10, 'Lager Nord']]);
  assert.deepStrictEqual([schwundArt(beides).jahr, schwundArt(beides).gesamt, beides.schichten.map((x) => x.rest), beides.jahr.kosten],
    [{ flaschen: 10, kosten: 5 }, { flaschen: 10, kosten: 5 }, [0, 965], 662.5]);
  assert.deepStrictEqual(beides.verluste.luecke, { datum: '2026-01-01', flaschen: 40, kosten: 40 });
  // 2026: 100 Bruch + 10 Schwund; 2025: 60 Promo; seit dem Start dazu die alte Lücke: 210 Flaschen, 205 €
  assert.deepStrictEqual([beides.verluste.jahr, beides.verluste.vorjahr, beides.verluste.gesamt, beides.verluste.anzahl],
    [{ flaschen: 110, kosten: 105 }, { flaschen: 60, kosten: 60 }, { flaschen: 210, kosten: 205 }, 4]);
  assert.deepStrictEqual(beides.flaschen, { abgefuellt: 2500, verkauft: 1325, abgaenge: 160, schwund: 10, luecke: 40, uebrig: 965 });
  // Monate mit Abgängen, neuester zuerst: Nachzählung, Bruch, Promo (ohne die alte Lücke)
  assert.deepStrictEqual(beides.verluste.monate, [{ monat: '2026-10', flaschen: 10, kosten: 5 }, { monat: '2026-07', flaschen: 100, kosten: 100 },
    { monat: '2025-10', flaschen: 60, kosten: 60 }]);
  // 2026: 1.342,59 € Rohertrag − 105 € (100 Bruch + 5 Schwund) = 1.237,59 €; die Marge der Verkäufe bleibt 67,0 % (1.342,59 von 2.005,09 €).
  // Seit dem Start: 1.372,59 € Rohertrag − 205 € (mit der alten Lücke) = 1.167,59 €
  assert.deepStrictEqual([beides.nach.jahr.rohertrag, beides.nach.jahr.abgaenge, beides.nach.jahr.bleibt, beides.jahr.marge], [1342.59, 105, 1237.59, 67]);
  assert.deepStrictEqual(beides.nach.gesamt, { rohertrag: 1372.59, abgaenge: 205, flaschen: 210, bleibt: 1167.59, proFlasche: 0.15 });
  // Je Abfüllung: Die 40 Flaschen der Lücke gehen aus der ersten raus (500 = 300 verkauft + 160 weg + 40 Lücke), ihr
  // Geld aber nicht zu ihren Lasten: 367,50 € Umsatz (120 + 60 + 250 × 150/200) − 300 € = 67,50 €, minus 160 € = −92,50 €.
  // Zweite: 1.025 verkauft, 1.817,59 € − 512,50 € = 1.305,09 €, minus 5 € Schwund. Zusammen 1.207,59 €, minus 40 € Lücke = 1.167,59 €.
  assert.deepStrictEqual(beides.abfuellungen.map((x) => [x.flaschen, x.weg, x.luecke, x.rest, x.umsatz, x.rohertrag, x.bleibt]), [
    [300, { flaschen: 160, kosten: 160 }, 40, 0, 367.5, 67.5, -92.5], [1025, { flaschen: 10, kosten: 5 }, 0, 965, 1817.59, 1305.09, 1300.09]]);
  // Die spätere Nachzählung ändert nichts an den Kosten davor: bis September dieselben Monatswerte wie ohne sie
  const nurAnfang = mitSchwund([['2026-01-01', 40, '']]);
  assert.deepStrictEqual(beides.monate.slice(1).map((x) => x.kosten), nurAnfang.monate.slice(1).map((x) => x.kosten));
  // Abgang aus einer Abfüllung ohne Kosten: sein Wert ist unbekannt (auch was nach Abgängen bleibt), die Schichten rechnen trotzdem weiter
  const ohneKosten = H.dashboardMehr(zeilen, werte, heute, 24, [{ abfuellung: '1. Abfüllung', monat: '2025-09', flaschen: 500, kostenProFlasche: null }, abf[0]], lager).marge;
  assert.deepStrictEqual([ohneKosten.verluste.gesamt, ohneKosten.nach.gesamt.bleibt, ohneKosten.schichten.map((x) => x.rest)], [{ flaschen: 160, kosten: null }, null, [0, 1015]]);
  // Eine Art, die die App nicht kennt, steht als „Sonstiges“ in der Statistik (nichts geht verloren)
  assert.deepStrictEqual(H.dashboardMehr(zeilen, werte, heute, 24, abf, { abgaenge: [['2026-03-01', 4, 'Geschenk']] }).marge.verluste.arten.map((x) => [x.art, x.jahr.flaschen]),
    [['Promo', 0], ['Eigenverbrauch', 0], ['Bruch', 0], ['Sonstiges', 4], ['Schwund', 0]]);
  // Am selben Tag erst die Verkäufe, dann die Abgänge
  assert.deepStrictEqual(H.fifoKosten([{ monat: '2025-03', datum: '2025-03-05', flaschen: 450 }], schichten, [{ datum: '2025-03-05', flaschen: 100 }]).abgang, [75]);
  // Codex v33 ---------------------------------------------------------------------------------------------------
  const ab2 = [{ name: 'A', monat: '2025-01', flaschen: 100, kosten: 1 }, { name: 'B', monat: '2025-02', flaschen: 100, kosten: 2 }];
  const vz = (monat, datum, flaschen) => ({ monat: monat, datum: datum, flaschen: flaschen });
  // Eine Gutschrift legt die zuletzt VERKAUFTEN Flaschen zurück (aus A), nicht die der Promo dazwischen (aus B);
  // der nächste Verkauf nimmt zuerst die zurückgelegten
  const gut2 = H.fifoKosten([vz('2025-03', '2025-03-01', 100), vz('2025-03', '2025-03-03', -10), vz('2025-03', '2025-03-04', 10)], ab2, [{ datum: '2025-03-02', flaschen: 10 }]);
  assert.deepStrictEqual([gut2.kosten, gut2.abgang, gut2.schichten.map((x) => x.rest)], [[100, -10, 10], [20], [0, 90]]);
  // Altverkauf ohne Datum zählt am letzten Tag seines Monats und damit vor einem Abgang am selben Tag (auch im April mit 30 Tagen)
  assert.deepStrictEqual(H.fifoKosten([vz('2025-03', '', 100)], ab2, [{ datum: '2025-03-31', flaschen: 10 }]).kosten, [100]);
  assert.deepStrictEqual(H.fifoKosten([vz('2025-04', '', 100)], ab2, [{ datum: '2025-04-30', flaschen: 10 }]).abgang, [20]);
  assert.deepStrictEqual(H.fifoKosten([vz('2025-04', '', 100)], ab2, [{ datum: '2025-04-29', flaschen: 10 }]).kosten, [110], 'ein Abgang davor läuft zuerst');
  // Mehr gefunden, als je wegging: liegt als Mehrbestand vor der ersten Abfüllung und geht als Nächstes weg (Kosten der ersten)
  const fund = H.fifoKosten([vz('2025-04', '2025-04-02', 60)], ab2, [{ datum: '2025-03-31', flaschen: -50 }]);
  assert.deepStrictEqual([fund.abgang, fund.kosten, fund.mehr, fund.schichten.map((x) => x.rest)], [[-50], [60], 0, [90, 100]]);
  assert.strictEqual(H.fifoKosten([], ab2, [{ datum: '2025-03-31', flaschen: -50 }]).mehr, 50);
  // Überhang und zurück: 250 weg (50 über die Abfüllungen hinaus zu 2 €), 60 Gutschrift holt erst den Überhang zurück
  const ueberhang = H.fifoKosten([vz('2025-03', '2025-03-01', 250), vz('2025-03', '2025-03-02', -60)], ab2);
  assert.deepStrictEqual([ueberhang.kosten, ueberhang.ueber, ueberhang.schichten.map((x) => x.rest)], [[400, -120], 0, [0, 10]]);
  // Codex v33 (zweite Runde): Es zählt der Tag, auch wenn der Monat der Rechnung ein anderer ist. Promo am 10.2. vor
  // dem Verkauf mit Monat Januar und Datum 20.2.: die Promo nimmt A (100 × 1 €), der Verkauf B (100 × 2 €)
  const tagZaehlt = H.fifoKosten([vz('2025-01', '2025-02-20', 100)], ab2, [{ datum: '2025-02-10', flaschen: 100 }]);
  assert.deepStrictEqual([tagZaehlt.abgang, tagZaehlt.kosten], [[100], [200]]);
  // Zurückgekommenes ohne passenden Verkauf liegt als Mehrbestand vorn: Daraus wird als Nächstes verkauft (Kosten der
  // ersten Abfüllung), nicht aus der nächsten Abfüllung. 100 Promo aus A, dann 5 Gutschrift ohne Verkauf davor:
  // übrig 200 − (−5) − 100 = 105
  const rz = H.verkaufZeilen({ zeilen: [['2026-03', '2026-03-05', 'Berlin', 'A', -5, -5, 'G9']] }, heute);
  const rm = H.dashboardMehr(rz, H.monatsWerte({ zeilen: [] }, rz), heute, 24, [{ abfuellung: 'A', monat: '2026-01', flaschen: 100, kostenProFlasche: 1 },
    { abfuellung: 'B', monat: '2026-02', flaschen: 100, kostenProFlasche: 2 }], { abgaenge: [['2026-03-01', 100, 'Promo']], schwund: [] }).marge;
  assert.deepStrictEqual([rm.aktuell, rm.mehr, rm.flaschen], [{ name: '', kosten: 1, rest: 5, mehr: true }, 5,
    { abgefuellt: 200, verkauft: -5, abgaenge: 100, schwund: 0, luecke: 0, uebrig: 105 }]);
  // Codex v33 (dritte Runde): Das Vorjahr bleibt stehen, wenn dort unter dem Strich 0 Flaschen, aber Kosten stehen.
  // A 10 Fl. zu 1 €, B 100 Fl. zu 2 €; Promo 10 am 1.2.2024 (aus A, 10 €). 2025: am 1.2. zehn mehr gezählt (die Promo-Flaschen
  // kommen zurück, −10 €), am 2.2. zehn verkauft (aus A, 10 €), am 3.2. zehn Schwund (aus B, 20 €), am 4.2. Gutschrift über die
  // zehn (zurück nach A, −10 €). 2025 damit: Verkäufe 0 Flaschen und 0 €, Abgänge 0 Flaschen, aber 10 € Kosten.
  const vjz = H.verkaufZeilen({ zeilen: [['2025-02', '2025-02-02', 'Berlin', 'A', 10, 30, 'R1'], ['2025-02', '2025-02-04', 'Berlin', 'A', -10, -30, 'G1']] }, heute);
  const vjm = H.dashboardMehr(vjz, H.monatsWerte({ zeilen: [] }, vjz), heute, 24, [{ abfuellung: 'A', monat: '2024-01', flaschen: 10, kostenProFlasche: 1 },
    { abfuellung: 'B', monat: '2024-01', flaschen: 100, kostenProFlasche: 2 }],
  { abgaenge: [['2024-02-01', 10, 'Promo']], schwund: [['2025-02-01', -10, 'X'], ['2025-02-03', 10, 'X']] }).marge;
  assert.deepStrictEqual([vjm.verluste.vorjahr, vjm.vorjahr.rohertrag, vjm.nach.vorjahr.bleibt, vjm.flaschen],
    [{ flaschen: 0, kosten: 10 }, 0, -10, { abgefuellt: 110, verkauft: 0, abgaenge: 10, schwund: 0, luecke: 0, uebrig: 100 }]);
  // v34: Bei der ersten Zählung aller Lager war mehr da als gerechnet (alte Lücke −20). A 100 Fl. zu 1 €, B 100 Fl. zu 2 €.
  // Promo 30 am 1.3. (aus A, 30 €), Verkauf 60 am 2.3. für 180 € (aus A, 60 €), am 5.3. eine Zeile ohne Flaschen über
  // 50 € (gehört zu A, das gerade dran ist), am 10.3. die Zählung: 20 der Promo-Flaschen kommen zurück nach A (−20 €).
  // A: 100 = 60 verkauft + 30 weg − 20 Lücke + 30 Rest; 230 € − 60 € = 170 € Rohertrag, minus 30 € Promo = 140 €.
  // 2026: 30 Flaschen und 30 € weg; seit dem Start mit der Lücke 10 Flaschen und 10 €.
  const lz = H.verkaufZeilen({ zeilen: [['2026-03', '2026-03-02', 'Berlin', 'A', 60, 180, 'R1'], ['2026-03', '2026-03-05', 'Berlin', 'A', 0, 50, 'R2']] }, heute);
  const lm = H.dashboardMehr(lz, H.monatsWerte({ zeilen: [] }, lz), heute, 24, [{ abfuellung: 'A', monat: '2026-01', flaschen: 100, kostenProFlasche: 1 },
    { abfuellung: 'B', monat: '2026-02', flaschen: 100, kostenProFlasche: 2 }], { abgaenge: [['2026-03-01', 30, 'Promo']], schwund: [['2026-03-10', -20, '']] }).marge;
  assert.deepStrictEqual([lm.verluste.jahr, lm.verluste.gesamt, lm.verluste.luecke, lm.verluste.monate],
    [{ flaschen: 30, kosten: 30 }, { flaschen: 10, kosten: 10 }, { datum: '2026-03-10', flaschen: -20, kosten: -20 }, [{ monat: '2026-03', flaschen: 30, kosten: 30 }]]);
  assert.deepStrictEqual(lm.flaschen, { abgefuellt: 200, verkauft: 60, abgaenge: 30, schwund: 0, luecke: -20, uebrig: 130 });
  assert.deepStrictEqual(lm.abfuellungen.map((x) => [x.name, x.flaschen, x.umsatz, x.kosten, x.rohertrag, x.marge, x.weg, x.luecke, x.rest, x.bleibt]), [
    ['A', 60, 230, 60, 170, 73.9, { flaschen: 30, kosten: 30 }, -20, 30, 140], ['B', 0, 0, 0, 0, null, { flaschen: 0, kosten: 0 }, 0, 100, 0]]);
  assert.deepStrictEqual([lm.gesamt.rohertrag, lm.nach.jahr.bleibt, lm.nach.gesamt.bleibt], [170, 140, 160], '170 € − 30 € Promo; seit dem Start 170 € − 10 €');
  // Codex v34 ---------------------------------------------------------------------------------------------------
  // Umsatz so auf den Cent gerundet, dass die Abfüllungen zusammen `gesamt` ergeben: A und B je 1 Flasche zu 1 €, ein
  // Verkauf über beide für 3,01 €. Je Abfüllung 1,51 € und 1,50 € (nicht zweimal 1,51 €), Rohertrag 0,51 € + 0,50 € = 1,01 €.
  const einzeln = [{ abfuellung: 'A', monat: '2026-01', flaschen: 1, kostenProFlasche: 1 }, { abfuellung: 'B', monat: '2026-02', flaschen: 1, kostenProFlasche: 1 }];
  const cz = H.verkaufZeilen({ zeilen: [['2026-03', '2026-03-02', 'Berlin', 'A', 2, 3.01, 'R1']] }, heute);
  const cm = H.dashboardMehr(cz, H.monatsWerte({ zeilen: [] }, cz), heute, 24, einzeln).marge;
  assert.deepStrictEqual([cm.abfuellungen.map((x) => [x.umsatz, x.rohertrag]), cm.gesamt.umsatz, cm.gesamt.rohertrag], [[[1.51, 0.51], [1.5, 0.5]], 3.01, 1.01]);
  // Zweite Codex-Runde: Kein Teil wechselt das Vorzeichen. A, B, C mit 1, 2 und 2 Flaschen; vom 1. bis 5.3. täglich eine
  // Flasche für 1 €, am 6.3. eine Gutschrift über alle fünf mit −0,03 €. Genau wären das −0,006 € / −0,012 € / −0,012 €,
  // also 0,994 € / 1,988 € / 1,988 €: auf den Cent 0,99 € / 1,99 € / 1,99 € = 4,97 € (A bekommt durch die Gutschrift nichts dazu).
  const drei = [{ abfuellung: 'A', monat: '2026-01', flaschen: 1, kostenProFlasche: 0.1 }, { abfuellung: 'B', monat: '2026-01', flaschen: 2, kostenProFlasche: 0.1 },
    { abfuellung: 'C', monat: '2026-02', flaschen: 2, kostenProFlasche: 0.1 }];
  const vz5 = H.verkaufZeilen({ zeilen: [1, 2, 3, 4, 5].map((t) => ['2026-03', '2026-03-0' + t, 'Berlin', 'A', 1, 1, 'R' + t]).concat([['2026-03', '2026-03-06', 'Berlin', 'A', -5, -0.03, 'G1']]) }, heute);
  const m5 = H.dashboardMehr(vz5, H.monatsWerte({ zeilen: [] }, vz5), heute, 24, drei).marge;
  assert.deepStrictEqual([m5.abfuellungen.map((x) => [x.flaschen, x.umsatz, x.kosten, x.rest]), m5.gesamt.umsatz], [[[0, 0.99, 0, 1], [0, 1.99, 0, 2], [0, 1.99, 0, 2]], 4.97]);
  // Vier Abfüllungen mit je einer Flasche, ein Verkauf über alle vier für 0,02 €: zwei bekommen einen Cent, keine einen negativen
  const vier = ['A', 'B', 'C', 'D'].map((n, i) => ({ abfuellung: n, monat: '2026-0' + (i + 1), flaschen: 1, kostenProFlasche: 0 }));
  const vz4 = H.verkaufZeilen({ zeilen: [['2026-06', '2026-06-02', 'Berlin', 'A', 4, 0.02, 'R1']] }, heute);
  assert.deepStrictEqual(H.dashboardMehr(vz4, H.monatsWerte({ zeilen: [] }, vz4), heute, 24, vier).marge.abfuellungen.map((x) => x.umsatz), [0.01, 0.01, 0, 0]);
  // Eine Zeile nach dem laufenden Monat (kommt aus der App nicht an, hier direkt übergeben) zählt nirgends mit: nicht
  // im Gesamtwert, nicht in der Warteschlange, nicht im Abgleich. A bleibt voll: 1 = 0 verkauft + 0 weg + 1 Rest.
  const spaeter = H.dashboardMehr([{ monat: '2026-12', datum: '2026-12-01', kanal: 'Berlin', kunde: 'A', schluessel: 'a', flaschen: 1, umsatz: 2, rechnung: 'R9' }],
    H.monatsWerte({ zeilen: [] }, []), heute, 24, einzeln).marge;
  assert.deepStrictEqual([spaeter.abfuellungen.map((x) => [x.abgefuellt, x.flaschen, x.rest]), spaeter.gesamt.flaschen, spaeter.flaschen],
    [[[1, 0, 1], [1, 0, 1]], 0, { abgefuellt: 2, verkauft: 0, abgaenge: 0, schwund: 0, luecke: 0, uebrig: 2 }]);
  // Kunden mit mehr als einer Bestellung zählen nur, wenn sie auch als Kunde zählen: X kauft zweimal und bekommt alles
  // gutgeschrieben, Y kauft einmal. Ein Kunde (Y), keiner mit zwei Bestellungen (nicht 100 %).
  const wz = H.verkaufZeilen({ zeilen: [['2026-03', '2026-03-02', 'Berlin', 'X', 1, 2, 'R1'], ['2026-03', '2026-03-05', 'Berlin', 'X', 1, 2, 'R2'],
    ['2026-03', '2026-03-09', 'Berlin', 'X', -2, -4, 'G1'], ['2026-04', '2026-04-02', 'Berlin', 'Y', 1, 2, 'R3']] }, heute);
  const wg = H.dashboardMehr(wz, H.monatsWerte({ zeilen: [] }, wz), heute, 24).gesamt;
  assert.deepStrictEqual([wg.kunden, wg.mehrfach], [1, 0]);
  // Übrig wird einmal gerundet, nicht aus gerundeten Resten zusammengezählt: zwei Abfüllungen mit je 0,004 Flaschen
  assert.strictEqual(H.fifoKosten([], [{ name: 'A', monat: '2025-01', flaschen: 0.004, kosten: 1 }, { name: 'B', monat: '2025-02', flaschen: 0.004, kosten: 1 }]).uebrig, 0.01);
  // Kein „-0“: ein kleiner negativer Betrag ist gerundet 0
  assert.deepStrictEqual([H.euroFormat(-0.1), H.zahlFormat(-0, 0), H.zahlFormat(-0.04, 1), H.zahlFormat(-0.06, 1), H.euroFormat(-1)], ['0 €', '0', '0,0', '-0,1', '-1 €']);
  // Storno und Neueintrag mit derselben Nummer: Die stornierte (davor) fällt weg, die neue bleibt
  assert.deepStrictEqual(H.fifoSchichten([{ abfuellung: '1. Abfüllung', monat: '2025-01', flaschen: 100, kostenProFlasche: 1 },
    { abfuellung: 'Storno 1. Abfüllung', monat: '2025-01', flaschen: -100, kostenProFlasche: 1 },
    { abfuellung: '1. Abfüllung', monat: '2025-01', flaschen: 100, kostenProFlasche: 2 }]), [{ name: '1. Abfüllung', monat: '2025-01', flaschen: 100, kosten: 2 }]);
  // Codex v32 (zweite Runde) --------------------------------------------------------------------------------------
  // Storno-Zeile vor ihrer Abfüllung: hebt sie trotzdem auf. Minus-Zeile ohne passende Abfüllung: Schichten bleiben, Abweichung wird gemeldet
  assert.deepStrictEqual(H.fifoSchichten([{ abfuellung: 'Storno 7. Abfüllung', monat: '2026-01', flaschen: -10, kostenProFlasche: 1 },
    { abfuellung: '7. Abfüllung', monat: '2026-01', flaschen: 10, kostenProFlasche: 1 }]), []);
  const schief = [{ abfuellung: '1. Abfüllung', monat: '2025-01', flaschen: 2000, kostenProFlasche: 1 }, { abfuellung: 'Storno 9. Abfüllung', monat: '2025-02', flaschen: -4, kostenProFlasche: 1 }];
  assert.deepStrictEqual(H.fifoSchichten(schief).map((x) => x.flaschen), [2000]);
  assert.strictEqual(H.dashboardMehr(zeilen, werte, heute, 24, schief).marge.abweichung, 4);
  // Abfüllung ohne lesbaren Monat bleibt an ihrer Stelle im Sheet (nicht ganz vorn)
  assert.deepStrictEqual(H.fifoSchichten([{ abfuellung: 'A', monat: '2025-01', flaschen: 10, kostenProFlasche: 1 }, { abfuellung: 'B', monat: null, flaschen: 10, kostenProFlasche: 9 },
    { abfuellung: 'C', monat: '2025-06', flaschen: 10, kostenProFlasche: 2 }]).map((x) => x.name), ['A', 'B', 'C']);
  // Gleitkomma: 0,05 + 7,98 + 1,97 sind genau 10, die Schicht ohne Kosten dahinter wird nicht berührt
  const zwei = [{ name: 'A', monat: '2025-01', flaschen: 10, kosten: 1 }, { name: 'B', monat: '2025-02', flaschen: 10, kosten: null }];
  const hauch = H.fifoKosten([0.05, 7.98, 1.97].map((q) => ({ monat: '2025-03', datum: '2025-03-01', flaschen: q })), zwei);
  assert.deepStrictEqual([hauch.kosten.map((k) => Math.round(k * 100) / 100), hauch.fehlt, hauch.schichten.map((x) => x.rest)], [[0.05, 7.98, 1.97], [], [0, 10]]);
  // Kunde und Kanal mit 0 Flaschen und 0 € Umsatz, aber Kosten: Kauf aus der ersten Abfüllung, Gutschrift nach dem Wechsel zur zweiten
  const xy = H.verkaufZeilen({ zeilen: [['2026-02', '2026-02-01', 'X', 'x', 10, 30, 'K1'], ['2026-02', '2026-02-02', 'Y', 'y', 10, 30, 'K2'],
    ['2026-02', '2026-02-03', 'X', 'x', -10, -30, 'K3']] }, heute);
  const xm = H.dashboardMehr(xy, H.monatsWerte({ zeilen: [] }, xy), heute, 24, [{ abfuellung: 'A', monat: '2025-01', flaschen: 10, kostenProFlasche: 1 },
    { abfuellung: 'B', monat: '2025-02', flaschen: 10, kostenProFlasche: 2 }]).marge;
  assert.deepStrictEqual([xm.jahr.kosten, xm.jahr.rohertrag], [10, 20]);
  assert.deepStrictEqual(xm.kanaele.map((x) => [x.kanal, x.flaschen, x.kosten, x.rohertrag]), [['Y', 10, 20, 10], ['X', 0, -10, 10]]);
  assert.deepStrictEqual(xm.top.map((x) => [x.kunde, x.rohertrag, x.anteil]), [['y', 10, 50], ['x', 10, 50]]);

  // Codex v32: Gutschriften gehören in die Rohertrag-Listen, sonst ergeben die Zeilen nicht den Jahreswert
  const eine = [{ abfuellung: '1. Abfüllung', monat: '2025-01', flaschen: 10000, kostenProFlasche: 1 }];
  const gs = H.verkaufZeilen({ zeilen: [['2025-03', '2025-03-01', 'X', 'Vor', -10, -30, 'V1'],
    ['2026-02', '2026-02-01', 'A', 'a', 100, 200, 'K1'], ['2026-02', '2026-02-05', 'B', 'b', -10, -30, 'K2'], // Kanal B: nur eine Gutschrift
    ['2026-03', '2026-03-01', 'A', 'c', 10, 100, 'K3'], ['2026-03', '2026-03-09', 'A', 'c', -10, -20, 'K4']] }, heute); // c: alles zurück, 80 € bleiben
  const gg = H.dashboardMehr(gs, H.monatsWerte({ zeilen: [] }, gs), heute, 24, eine).marge;
  assert.deepStrictEqual([gg.jahr.flaschen, gg.jahr.umsatz, gg.jahr.rohertrag], [90, 250, 160]);
  assert.deepStrictEqual(gg.kanaele.map((x) => [x.kanal, x.flaschen, x.rohertrag, x.anteil]), [['A', 100, 180, 100], ['B', -10, -20, 0]]);
  assert.strictEqual(gg.kanaele.reduce((x, y) => x + y.rohertrag, 0), gg.jahr.rohertrag, 'Kanäle zusammen = Jahr');
  assert.deepStrictEqual(gg.top.map((x) => [x.kunde, x.flaschen, x.rohertrag, x.anteil]), [['a', 100, 100, 55.6], ['c', 0, 80, 44.4], ['b', -10, -20, 0]]);
  assert.strictEqual(gg.top.reduce((x, y) => x + y.rohertrag, 0), gg.jahr.rohertrag, 'Kunden zusammen = Jahr');
  // das Vorjahr bleibt sichtbar, auch wenn dort unter dem Strich nur eine Gutschrift steht
  assert.deepStrictEqual([gg.vorjahr.flaschen, gg.vorjahr.kosten, gg.vorjahr.rohertrag, gg.vorjahr.marge], [-10, -10, -20, null]);
  // Gleichstand ist nicht „unter Herstellkosten“ (3 × 0,10 € ist als Gleitkommazahl knapp über 0,30 €)
  const gleich = H.verkaufZeilen({ zeilen: [['2026-02', '2026-02-01', 'A', 'a', 3, 0.3, 'K1']] }, heute);
  assert.deepStrictEqual(H.dashboardMehr(gleich, H.monatsWerte({ zeilen: [] }, gleich), heute, 24,
    [{ abfuellung: '1. Abfüllung', monat: '2025-01', flaschen: 100, kostenProFlasche: 0.1 }]).marge.unterKosten, { anzahl: 0, flaschen: 0, anteil: 0 });

  // Bestellungen: Rechnung je Kunde, ohne Nummer Kunde und Tag, Altzeilen einzeln; Gutschriften bleiben in der Liste
  assert.deepStrictEqual(H.bestellListe(zeilen).map((b) => [b.kunde, b.datum, b.flaschen]), [['Alt', '2025-10-05', 100], ['Alt', '2025-11-20', 50],
    ['Späti', '2026-07-03', 200], ['Bar', '2026-08-10', 400], ['Fest', '', 100], ['Bar', '2026-10-08', 300], ['Bar', '2026-10-20', -20],
    ['Fachschaft', '2026-11-06', 144], ['Kiosk', '2026-11-06', 36], ['Messe', '2026-11-09', 10], ['Zukunft', '2026-11-12', 5]]);
  assert.deepStrictEqual(H.bestellListe(null), []);

  // Ältere Schnittstelle ohne Zeilen: nur was sich aus den Monatswerten rechnen lässt
  const alt = H.dashboardMehr(null, werte, heute);
  assert.deepStrictEqual([alt.trend, alt.quartale, alt.tempo], [m.trend, m.quartale, m.tempo]);
  assert.deepStrictEqual([alt.kanaele, alt.jahre, alt.gesamt, alt.preise, alt.bestellungen, alt.groessen, alt.kunden, alt.top, alt.rekorde, alt.marge],
    [[], [], null, [], null, [], null, [], null, null]);
  // Januar: kein „Jahr bis …“ (noch kein voller Monat), nur das erste Quartal, das Vorjahr hat das ganze Jahr zum Vergleich
  const januar = H.dashboardMehr(zeilen, werte, '2027-01-05', 24);
  assert.deepStrictEqual(januar.trend.map((x) => x.art + x.monate), ['monate1', 'monate3', 'monate6', 'monate12']);
  assert.deepStrictEqual(januar.trend[3].flaschen, 1175, 'Jan–Dez 2026');
  assert.deepStrictEqual(januar.quartale.map((x) => [x.quartal, x.laufend, x.flaschen]), [[1, true, 0]]);
  assert.deepStrictEqual([januar.kunden.aktiv, januar.kunden.nichtMehr, januar.bestellungen.anzahl, januar.bestellungen.median, januar.top], [0, 7, 0, null, []]);
  assert.deepStrictEqual(januar.tempo, { tage: 5, flaschenProTag: 0, umsatzProTag: 0 });
  // Monat fehlt in den Daten: Zeitraum ohne Zahl statt falscher Summe
  const luecke = H.dashboardMehr(zeilen, (x) => (x === '2026-09' ? null : werte(x)), heute, 24);
  assert.deepStrictEqual(luecke.trend.map((x) => x.flaschen), [280, null, null, null, null]);
  assert.strictEqual(luecke.tempo, null);
  // keine Verkäufe, ungültige Eingaben
  const leer = H.dashboardMehr([], () => ({ flaschen: 0, umsatz: 0 }), heute, 24);
  assert.deepStrictEqual([leer.jahre, leer.gesamt.flaschen, leer.gesamt.erster, leer.gesamt.monate, leer.gesamt.proMonat, leer.rekorde.monatFlaschen, leer.rekorde.treu],
    [[], 0, null, 0, null, null, null]);
  assert.strictEqual(H.dashboardMehr(zeilen, werte, 'gestern', 24), null);
  assert.strictEqual(H.dashboardMehr(zeilen, null, heute, 24), null);
});

test('auswerten (v35): Verkäufe nach Kennzahl, Jahr und Kanal gefiltert, aufgeteilt nach Jahr, Monat, Kanal oder Kunde', () => {
  const heute = '2026-11-12';
  const zl = H.verkaufZeilen({ zeilen: zeilen() }, heute);
  const kosten = zl.map((x) => x.flaschen * 0.5); // erfunden: 0,50 € pro Flasche
  const aw = (wahl, k) => H.auswerten(zl, k === undefined ? kosten : k, heute, wahl);

  // Was es zu wählen gibt: Jahre neuestes zuerst, Kanäle nach Flaschen über alles (Aktion 1.000, Karlsruhe 440, Ape 264, Berlin 120)
  const a = aw({ kennzahl: 'flaschen', jahr: 2026, kanal: '', nach: 'monat' });
  assert.deepStrictEqual([a.jahre, a.kanaele, a.erster, a.mitKosten], [[2026, 2025], ['Aktion', 'Karlsruhe', 'Ape', 'Berlin'], '2025-03', true]);
  assert.deepStrictEqual([a.kennzahl, a.jahr, a.kanal, a.nach], ['flaschen', 2026, '', 'monat']);
  // 2026: 602 Flaschen, 1.277 € Umsatz, 301 € Kosten, 976 € Rohertrag (76,4 %); fünf Bestellungen im Plus (die Gutschrift
  // ist keine, die zwei Zeilen vom 6.11. sind eine), drei Kunden
  assert.deepStrictEqual(a.summe, { flaschen: 602, umsatz: 1277, kosten: 301, rohertrag: 976, marge: 76.4, proFlasche: 2.12, rohProFlasche: 1.62, bestellungen: 5, kunden: 3 });
  // Vergleich: volle Monate Januar bis Oktober, 338 Flaschen gegen 1.150 im Jahr davor, 437 € gegen 1.195 €, Rohertrag 268 € gegen 620 €
  assert.deepStrictEqual(a.vergleich, { jahr: 2025, bis: '2026-10', flaschen: -71, umsatz: -63, rohertrag: -57 });
  // Monate von heute zurück bis Januar, auch ohne Verkäufe; der laufende ohne Vergleich, vor dem ersten Verkauf (März 2025) auch keiner
  assert.deepStrictEqual(a.gruppen.map((g) => [g.schluessel, g.flaschen, g.umsatz, g.laufend, g.p, g.balken, g.anteil]), [
    ['2026-11', 264, 840, true, null, 100, null], ['2026-10', 108, 138, false, 116, 40.9, null], ['2026-09', 0, 0, false, null, 0, null],
    ['2026-08', 0, 0, false, null, 0, null], ['2026-07', 0, 0, false, null, 0, null], ['2026-06', 0, 0, false, null, 0, null],
    ['2026-05', 200, 260, false, 100, 75.8, null], ['2026-04', 0, 0, false, null, 0, null], ['2026-03', 0, 0, false, -100, 0, null],
    ['2026-02', 0, 0, false, null, 0, null], ['2026-01', 30, 39, false, null, 11.4, null]]);
  assert.deepStrictEqual(a.gruppen[0].wert, 264);

  // Ein Kanal: Berlin 2026 sind 72 − 24 Flaschen, eine Bestellung, ein Kunde; im Jahr davor bis Oktober nichts → kein Prozentwert
  const b = aw({ kennzahl: 'umsatz', jahr: 2026, kanal: 'Berlin', nach: 'kunde' });
  assert.deepStrictEqual(b.summe, { flaschen: 48, umsatz: 60, kosten: 24, rohertrag: 36, marge: 60, proFlasche: 1.25, rohProFlasche: 0.75, bestellungen: 1, kunden: 1 });
  assert.deepStrictEqual(b.vergleich, { jahr: 2025, bis: '2026-10', flaschen: null, umsatz: null, rohertrag: null });
  assert.deepStrictEqual(b.gruppen.map((g) => [g.schluessel, g.name, g.wert, g.anteil, g.balken, g.p]), [['späti', 'Späti', 60, 100, 100, null]]);
  // Ein früheres Jahr vergleicht ganz mit dem Jahr davor; vor dem ersten Verkauf gibt es nichts zu vergleichen
  assert.strictEqual(aw({ jahr: 2025 }).vergleich, null);
  assert.deepStrictEqual(H.auswerten(zl, kosten, '2027-01-05', { jahr: 2026 }).vergleich, { jahr: 2025, bis: null, flaschen: -51, umsatz: -1, rohertrag: 45 });

  // Alle Jahre nach Kanal, sortiert nach der gewählten Kennzahl: Umsatz 1.000 / 840 / 572 / 150 von 2.562 €
  const k = aw({ kennzahl: 'umsatz', jahr: null, nach: 'kanal' });
  assert.deepStrictEqual([k.jahr, k.vergleich, k.summe.flaschen, k.summe.umsatz], [null, null, 1824, 2562]);
  assert.deepStrictEqual(k.gruppen.map((g) => [g.name, g.wert, g.anteil, g.balken]), [['Aktion', 1000, 39, 100], ['Ape', 840, 32.8, 84], ['Karlsruhe', 572, 22.3, 57.2], ['Berlin', 150, 5.9, 15]]);
  // … nach Flaschen steht Karlsruhe vor Ape, nach Rohertrag Ape (708 €) vor Aktion (500 €)
  assert.deepStrictEqual(aw({ kennzahl: 'flaschen', nach: 'kanal' }).gruppen.map((g) => g.name), ['Aktion', 'Karlsruhe', 'Ape', 'Berlin']);
  assert.deepStrictEqual(aw({ kennzahl: 'rohertrag', nach: 'kanal' }).gruppen.map((g) => [g.name, g.wert, g.marge]), [['Ape', 708, 84.3], ['Aktion', 500, 50], ['Karlsruhe', 352, 61.5], ['Berlin', 90, 60]]);
  // Kunden: „bar eins “ und „Bar Eins“ sind derselbe Kunde, gezeigt wird die häufigste Schreibweise
  assert.deepStrictEqual(aw({ kennzahl: 'flaschen', nach: 'kunde' }).gruppen.map((g) => [g.name, g.flaschen, g.anteil]), [['Start Aktion', 1000, 54.8], ['Bar Eins', 440, 24.1], ['Fest', 264, 14.5], ['Späti', 120, 6.6]]);
  // Jahre: nur ohne gewähltes Jahr; das laufende vergleicht seine vollen Monate, vor 2025 gab es nichts
  const j = aw({ kennzahl: 'flaschen', jahr: null, nach: 'jahr' });
  assert.deepStrictEqual(j.gruppen.map((g) => [g.schluessel, g.flaschen, g.laufend, g.p, g.balken]), [['2026', 602, true, -71, 49.3], ['2025', 1222, false, null, 100]]);
  assert.strictEqual(aw({ jahr: 2026, nach: 'jahr' }).nach, 'monat', 'mit gewähltem Jahr gibt es keine Aufteilung nach Jahren');
  // Alle Jahre nach Monat: vom ersten Verkauf bis heute, neuester zuerst
  const mo = aw({ jahr: null, nach: 'monat' }).gruppen;
  assert.deepStrictEqual([mo.length, mo[0].schluessel, mo[mo.length - 1].schluessel, mo[mo.length - 1].flaschen], [21, '2026-11', '2025-03', 1000]);
  // Ein Jahr, das mittendrin beginnt: 2025 ab März, nicht ab Januar
  assert.deepStrictEqual(aw({ jahr: 2025, nach: 'monat' }).gruppen.map((g) => g.schluessel).slice(-2), ['2025-04', '2025-03']);

  // Wahl, die es nicht gibt: Jahr → alle, Kanal → alle, Kennzahl und Aufteilung → Flaschen nach Monat
  const u = aw({ kennzahl: 'gewinn', jahr: 2031, kanal: 'Mond', nach: 'wetter' });
  assert.deepStrictEqual([u.kennzahl, u.jahr, u.kanal, u.nach, u.summe.flaschen], ['flaschen', null, '', 'monat', 1824]);
  assert.deepStrictEqual(aw(undefined).summe.flaschen, 1824);
  // Ohne Herstellkosten: kein Rohertrag wählbar, Kosten und Marge bleiben leer, der Rest rechnet
  const o = aw({ kennzahl: 'rohertrag', jahr: 2026, nach: 'kanal' }, null);
  assert.deepStrictEqual([o.kennzahl, o.mitKosten, o.summe.flaschen, o.summe.umsatz, o.summe.kosten, o.summe.rohertrag, o.summe.marge, o.summe.proFlasche, o.summe.rohProFlasche],
    ['flaschen', false, 602, 1277, null, null, null, 2.12, null]);
  assert.deepStrictEqual(o.vergleich, { jahr: 2025, bis: '2026-10', flaschen: -71, umsatz: -63, rohertrag: null });
  assert.deepStrictEqual(o.gruppen.map((g) => [g.name, g.wert, g.rohertrag]), [['Ape', 264, null], ['Karlsruhe', 290, null], ['Berlin', 48, null]].sort((x, y) => y[1] - x[1]));
  // Fehlen die Kosten nur bei einer Zeile (Abfüllung ohne Kosten), bleibt der Rohertrag nur dort leer, wo sie mitzählt; leere landen hinten
  const teil = kosten.map((x, i) => (zl[i].kanal === 'Ape' && zl[i].flaschen === 240 ? null : x));
  const t = aw({ kennzahl: 'rohertrag', jahr: 2026, nach: 'kanal' }, teil);
  assert.deepStrictEqual(t.gruppen.map((g) => [g.name, g.wert, g.anteil, g.balken]), [['Karlsruhe', 232, 86.6, 100], ['Berlin', 36, 13.4, 15.5], ['Ape', null, 0, 0]]);
  assert.deepStrictEqual([t.summe.rohertrag, t.summe.marge, t.summe.flaschen], [null, null, 602]);
  // Minus: eine Gruppe mit Gutschrift unter dem Strich hat keinen Balken und keinen Anteil
  const minus = H.verkaufZeilen({ zeilen: [z('2026-03', '2026-03-02', 'Berlin', 'A', 24, 30), z('2026-04', '2026-04-02', 'Berlin', 'B', -48, -60)] }, heute);
  assert.deepStrictEqual(H.auswerten(minus, null, heute, { nach: 'kunde' }).gruppen.map((g) => [g.name, g.wert, g.anteil, g.balken]), [['A', 24, 100, 100], ['B', -48, 0, 0]]);
  assert.deepStrictEqual(H.auswerten(minus, null, heute, { nach: 'kunde' }).summe.kunden, 1);
  // Nichts da, ungültige Eingaben
  const leer = H.auswerten([], null, heute, { jahr: 2026, nach: 'kanal' });
  assert.deepStrictEqual([leer.jahre, leer.kanaele, leer.jahr, leer.gruppen, leer.summe.flaschen, leer.summe.bestellungen, leer.vergleich], [[], [], null, [], 0, 0, null]);
  assert.deepStrictEqual(H.auswerten([], null, heute, { nach: 'monat' }).gruppen.map((g) => g.schluessel), ['2026-11']);
  assert.strictEqual(H.auswerten(null, null, heute, {}), null, 'ältere Schnittstelle ohne Zeilen');
  assert.strictEqual(H.auswerten(zl, kosten, 'gestern', {}), null);
  assert.deepStrictEqual([H.AUSWERTEN_KENNZAHLEN, H.AUSWERTEN_NACH], [['flaschen', 'umsatz', 'rohertrag'], ['jahr', 'monat', 'kanal', 'kunde']]);
});

test('spaltenTeilen (v35): Blöcke des Dashboards in zwei etwa gleich lange Spalten, Reihenfolge bleibt', () => {
  assert.strictEqual(H.spaltenTeilen([5.5, 8.5, 6.5, 11.5]), 2, '14 gegen 18 ist näher beieinander als 20,5 gegen 11,5');
  assert.strictEqual(H.spaltenTeilen([1, 1, 1]), 2, 'Gleichstand: die erste Spalte ist die längere');
  assert.strictEqual(H.spaltenTeilen([1, 1]), 1);
  assert.strictEqual(H.spaltenTeilen([10, 1, 1]), 1);
  assert.strictEqual(H.spaltenTeilen([1, 1, 10]), 2);
  assert.strictEqual(H.spaltenTeilen([3]), 1, 'ein Block: alles in die erste');
  assert.strictEqual(H.spaltenTeilen([]), 0);
  assert.strictEqual(H.spaltenTeilen(null), 0);
  assert.strictEqual(H.spaltenTeilen([2, 'x', -1, 2]), 3, 'Unsinn zählt als 0');
});
