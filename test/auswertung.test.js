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
    { kanal: 'Karlsruhe', flaschen: 824, umsatz: 985.09, anteil: 70.1 },
    { kanal: 'Berlin', flaschen: 205, umsatz: 255, anteil: 17.4 },
    { kanal: 'Ape', flaschen: 100, umsatz: 700, anteil: 8.5 },
    { kanal: 'Weitere', flaschen: 46, umsatz: 65, anteil: 3.9 },
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
