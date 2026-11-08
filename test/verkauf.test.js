'use strict';

// Verkäufe lesen und auswerten, Gesamtübersicht (synthetische Daten).

const test = require('node:test');
const assert = require('node:assert');
const { lade, roh } = require('./lade');
const D = require('./daten');

const k = lade();

/** Erfundene Verkäufe über eine Jahresgrenze, Altliste und Rechnungen gemischt, nicht sortiert. */
function verkaufZeilen() {
  return [D.verkaufKopf(),
    D.rechnungszeile(2026, 11, 3, 'Karlsruhe', 'Bar Eins', 48, 60),
    D.altzeile(2025, 10, 'Karlsruhe', 'Bar Eins', 100, 120), // vor den letzten 13 Monaten
    D.altzeile(2025, 11, 'karlsruhe', 'bar eins ', 24, 30), // gleicher Kunde, andere Schreibweise
    D.altzeile(2026, 1, 'Berlin', 'Späti Zwei', 72, 80.5),
    D.rechnungszeile(2026, 10, 30, 'Berlin', 'Späti Zwei', -24, -26.5), // Gutschrift
    D.rechnungszeile(2026, 10, 1, 'Ape', 'Fest Drei', 240, 600.25),
    D.altzeile(2026, 9, '', 'Unbekannt', 10, 12), // leerer Kanal → Sonstiges
    D.altzeile(2026, 9, 'Mond', 'Rakete', 5, 6), // unbekannter Kanal → Sonstiges
    ['', '', '', '', '', '', '', '', '', '', '', ''], // leere Zeile
    ['', '', 'Altliste', 'Karlsruhe', 'Ohne Monat', 12, '', '', 14, '', '', ''],
    ['10.2026', '', 'Altliste', 'Karlsruhe', 'Textzeile', '1.200', '', '', '1.400,00 €', '', '', ''], // formatierte Texte
    D.altzeile(2026, 8, 'Karlsruhe', 'Bar Eins', 'viele', 0),
  ];
}

test('Verkäufe lesen: Monat aus Seriennummer, Datum oder Text; Kanal; Hinweise', () => {
  const r = k.verkaeufeLesen(verkaufZeilen(), D.berlin);
  assert.strictEqual(r.verkaeufe.length, 9);
  const erste = roh(r.verkaeufe[0]);
  assert.deepStrictEqual(erste, { zeile: 2, monat: '2026-11', datum: '2026-11-03', kanal: 'Karlsruhe', kunde: 'Bar Eins',
    flaschen: 48, umsatz: 60, standort: '' });
  assert.strictEqual(r.verkaeufe[1].monat, '2025-10');
  assert.strictEqual(r.verkaeufe[1].datum, null);
  assert.strictEqual(r.verkaeufe[2].kanal, 'Karlsruhe');
  assert.strictEqual(r.verkaeufe[6].kanal, 'Sonstiges');
  assert.strictEqual(r.verkaeufe[7].kanal, 'Sonstiges');
  assert.strictEqual(r.verkaeufe[8].flaschen, 1200);
  assert.strictEqual(r.verkaeufe[8].umsatz, 1400);
  assert.deepStrictEqual(roh(r.hinweise), ['Verkäufe Zeile 11: kein Monat lesbar, zählt nicht.', 'Verkäufe Zeile 13: Flaschen unlesbar, zählt nicht.']);
  assert.throws(() => k.verkaeufeLesen([['Monat', 'Datum', 'Quelle', 'Kunde']], D.berlin), /Spaltenkopf/);
});

test('Auswertung: 13 Monate inkl. laufendem, letzte 12 volle Monate, laufendes Jahr, Kunden zusammengefasst', () => {
  const v = k.verkaeufeLesen(verkaufZeilen(), D.berlin).verkaeufe;
  const a = roh(k.verkaeufeAuswerten(v, '2026-11-08'));
  assert.strictEqual(a.monate.length, 13);
  assert.strictEqual(a.monate[0].monat, '2025-11');
  assert.strictEqual(a.monate[12].monat, '2026-11');
  assert.deepStrictEqual(a.monate[0], { monat: '2025-11', flaschen: 24, umsatz: 30 });
  assert.deepStrictEqual(a.monate[1], { monat: '2025-12', flaschen: 0, umsatz: 0 }, 'leere Monate stehen mit 0 drin');
  assert.deepStrictEqual(a.monate[11], { monat: '2026-10', flaschen: 1416, umsatz: 1973.75 });

  assert.strictEqual(a.letzte12.von, '2025-11');
  assert.strictEqual(a.letzte12.bis, '2026-10');
  assert.strictEqual(a.letzte12.flaschen, 24 + 72 - 24 + 240 + 10 + 5 + 1200);
  assert.deepStrictEqual(a.letzte12.kanaele.map((x) => x.kanal), ['Karlsruhe', 'Berlin', 'Ape', 'Sonstiges']);
  assert.deepStrictEqual(a.letzte12.kanaele[1], { kanal: 'Berlin', flaschen: 48, umsatz: 54 });
  assert.deepStrictEqual(a.letzte12.kunden[0], { kunde: 'Textzeile', flaschen: 1200, umsatz: 1400 });
  assert.deepStrictEqual(a.letzte12.kunden.find((x) => /bar eins/i.test(x.kunde)), { kunde: 'bar eins', flaschen: 24, umsatz: 30 });

  assert.strictEqual(a.jahr.von, '2026-01');
  assert.strictEqual(a.jahr.bis, '2026-11');
  const bar = a.jahr.kunden.find((x) => /bar eins/i.test(x.kunde));
  assert.deepStrictEqual(bar, { kunde: 'Bar Eins', flaschen: 48, umsatz: 60 }, 'laufender Monat zählt im Jahr mit');
});

test('Top-Kunden: höchstens 10, zusammengefasst über Schreibweisen, häufigste Schreibweise gewinnt', () => {
  const v = [];
  for (let i = 1; i <= 12; i++) v.push({ monat: '2026-10', kanal: 'Karlsruhe', kunde: 'Kunde ' + i, flaschen: i, umsatz: i });
  v.push({ monat: '2026-10', kanal: 'Karlsruhe', kunde: 'kunde 1', flaschen: 100, umsatz: 1 });
  v.push({ monat: '2026-10', kanal: 'Karlsruhe', kunde: 'KUNDE  1', flaschen: 1, umsatz: 1 });
  v.push({ monat: '2026-10', kanal: 'Karlsruhe', kunde: 'kunde 1', flaschen: 1, umsatz: 1 });
  const a = roh(k.verkaeufeAuswerten(v, '2026-11-08'));
  assert.strictEqual(a.letzte12.kunden.length, 10);
  assert.deepStrictEqual(a.letzte12.kunden[0], { kunde: 'kunde 1', flaschen: 103, umsatz: 4 });
  assert.strictEqual(a.letzte12.kunden[1].kunde, 'Kunde 12');
});

/** Ganze Rohdaten für uebersichtBauen (erfunden). */
function rohdaten(logZeilen) {
  return {
    verkaeufe: verkaufZeilen(),
    lagerLog: [D.lagerKopf()].concat(logZeilen || []),
    einstellungen: D.einstellungen(),
    abfuellungen: [['Abfüllung', 'Monat', 'Flaschen'], ['1. Abfüllung', D.serie(2025, 2, 1), 3000], ['', '', '']],
    uebersicht: [[3000], [1675], [1325], [54.4], [100], [13]],
  };
}

test('uebersichtBauen: ohne Inventur rechnerisch, Kennzahlen, Bestellung, Hinweise', () => {
  const u = roh(k.uebersichtBauen(rohdaten(), D.berlin, new Date('2026-11-08T15:00:00Z')));
  assert.strictEqual(u.heute, '2026-11-08');
  assert.strictEqual(u.stand, '2026-11-08T15:00:00.000Z');
  assert.strictEqual(u.kennzahlen.verkauft, 1675);
  assert.strictEqual(u.kennzahlen.gesamtbestand, 1325);
  assert.strictEqual(u.kennzahlen.gesamtQuelle, 'rechnerisch');
  assert.strictEqual(u.kennzahlen.bestandGezaehlt, null);
  // Ø 3 volle Monate 08–10/2026: (15 + 1416) / 3 = 477
  assert.strictEqual(u.kennzahlen.abverkaufProMonat, 477);
  assert.strictEqual(u.bestellung.reichweite, 2.8);
  assert.strictEqual(u.bestellung.status, 'bald');
  assert.strictEqual(u.lager.length, 3);
  assert.deepStrictEqual(u.abfuellungen, [{ abfuellung: '1. Abfüllung', monat: '2025-02', flaschen: 3000 }]);
  assert.match(u.hinweise[0], /Noch keine Inventur/);
  assert.ok(!u.hinweise.some((h) => /Verkauft laut Übersicht/.test(h)), 'Summe passt zu B9');
});

test('uebersichtBauen: mit allen Inventuren zählt die Summe, Zeitzone für „heute“ ist Berlin', () => {
  const log = [['2026-11-01', 'Lager Süd', 'Inventur', 1000], ['2026-11-01', 'Lager Nord', 'Inventur', 50],
    ['2026-11-01', 'Lager Ost', 'Inventur', 0]];
  // 31.10. 23:30 UTC = 01.11. 00:30 Berlin → laufender Monat ist schon November
  const u = roh(k.uebersichtBauen(rohdaten(log), D.berlin, new Date('2026-10-31T23:30:00Z')));
  assert.strictEqual(u.heute, '2026-11-01');
  assert.strictEqual(u.kennzahlen.abverkaufBis, '2026-10');
  // Bar Eins 03.11. (48 Fl., Lager Süd) zählt nach der Inventur
  assert.strictEqual(u.lager[0].bestand, 952);
  assert.strictEqual(u.kennzahlen.gesamtbestand, 1002);
  assert.strictEqual(u.kennzahlen.gesamtQuelle, 'inventur');
  assert.ok(!u.hinweise.some((h) => /Noch keine Inventur/.test(h)));
});

test('uebersichtBauen: Hinweise werden gekappt, Abweichung zu B9 wird gemeldet', () => {
  const log = [];
  for (let i = 0; i < 30; i++) log.push(['kaputt', 'Lager Süd', 'Bruch', 1]);
  const r = rohdaten(log);
  r.uebersicht[1] = [1];
  const u = roh(k.uebersichtBauen(r, D.berlin, new Date('2026-11-08T15:00:00Z')));
  assert.strictEqual(u.hinweise.length, 20);
  assert.match(u.hinweise[19], /weitere Hinweise/);
});
