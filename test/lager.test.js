'use strict';

// Lager-Logik mit synthetischen Daten (keine echten Verkaufsdaten, das Repo ist öffentlich).

const test = require('node:test');
const assert = require('node:assert');
const { lade, roh } = require('./lade');
const { berlin, serie, lagerKopf, einstellungen } = require('./daten');

const k = lade();

test('Datum: Seriennummer, Texte, Datumsobjekt in Berlin', () => {
  assert.strictEqual(k.datumAusSeriennummer(serie(2025, 3, 1)), '2025-03-01');
  assert.strictEqual(k.datumAusSeriennummer(serie(2025, 3, 1) + 0.75), '2025-03-01', 'Uhrzeit zählt nicht');
  assert.strictEqual(k.datumAusSeriennummer(42), null);
  assert.strictEqual(k.datumAusText('08.10.2026'), '2026-10-08');
  assert.strictEqual(k.datumAusText('8.1.2026'), '2026-01-08');
  assert.strictEqual(k.datumAusText('31.02.2026'), null);
  assert.strictEqual(k.datumAusText('2026-10-08'), '2026-10-08');
  assert.strictEqual(k.monatAusText('03.2025'), '2025-03');
  assert.strictEqual(k.monatAusText('13.2025'), null);
  // Zeitzone: 31.03. 23:30 UTC ist in Berlin (Sommerzeit) schon der 1. April, 31.10. 23:30 UTC (Winterzeit) der 1. November
  assert.strictEqual(k.zelleDatum(new Date('2026-03-31T22:30:00Z'), berlin), '2026-04-01');
  assert.strictEqual(k.zelleDatum(new Date('2026-10-31T23:30:00Z'), berlin), '2026-11-01');
  assert.strictEqual(k.zelleDatum(new Date('2026-10-31T22:30:00Z'), berlin), '2026-10-31');
  assert.strictEqual(k.zelleDatum(new Date('quatsch'), berlin), null);
  assert.strictEqual(k.zelleMonat(serie(2025, 9, 1), berlin), '2025-09');
  assert.strictEqual(k.zelleMonat('09.2025', berlin), '2025-09');
  assert.strictEqual(k.zelleMonat('', berlin), null);
});

test('Datum rechnen: Monatsgrenzen, Schaltjahr, Jahreswechsel', () => {
  assert.strictEqual(k.monatPlus('2026-01', -1), '2025-12');
  assert.strictEqual(k.monatPlus('2026-11', 14), '2028-01');
  assert.strictEqual(k.monatsletzter('2028-02'), '2028-02-29');
  assert.strictEqual(k.monatsletzter('2026-02'), '2026-02-28');
  assert.strictEqual(k.monatePlus('2026-03-31', -1), '2026-02-28');
  assert.strictEqual(k.tagePlus('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(k.tagePlus('2026-03-29', 1.9), '2026-03-30', 'Sommerzeit-Tag zählt als ein Tag');
  assert.strictEqual(k.tageZwischen('2026-11-08', '2026-12-08'), 30);
  assert.strictEqual(k.betragLesen('−24'), -24);
  assert.strictEqual(k.betragLesen('1.234,50 €'), 1234.5);
});

test('Einstellungen nach Text in A, Reihenfolge egal, Standardwerte mit Hinweis', () => {
  const e = k.einstellungenLesen(einstellungen().reverse());
  assert.deepStrictEqual(roh(e.standorte), ['Lager Süd', 'Lager Nord', 'Lager Ost']);
  assert.strictEqual(e.hauptlager, 'Lager Süd');
  assert.strictEqual(e.standortBerlin, 'Lager Nord');
  assert.strictEqual(e.abverkaufMonate, 3);
  assert.strictEqual(e.flaschenProKiste, 24);
  assert.deepStrictEqual(roh(e.hinweise), []);
  const leer = k.einstellungenLesen([['Einstellung', 'Wert'], ['Puffer (Wochen)', 'viel'], ['Zeitraum für Ø-Abverkauf (Monate)', '0']]);
  assert.strictEqual(leer.pufferWochen, 2);
  assert.strictEqual(leer.abverkaufMonate, 6);
  assert.strictEqual(leer.standorte.length, 3);
  assert.ok(leer.hinweise.some((h) => /Puffer/.test(h)));
  assert.ok(leer.hinweise.length >= 8);
});

test('Verkauf: Standort (Regel 1) und Lagerdatum (Regel 2, Dörflinger ein Monat früher)', () => {
  const e = k.einstellungenLesen(einstellungen());
  assert.strictEqual(k.verkaufStandort({ kanal: 'Berlin', standort: '' }, e), 'Lager Nord');
  assert.strictEqual(k.verkaufStandort({ kanal: 'Karlsruhe', standort: '' }, e), 'Lager Süd');
  assert.strictEqual(k.verkaufStandort({ kanal: 'Berlin', standort: 'Lager Ost' }, e), 'Lager Ost');
  assert.strictEqual(k.verkaufLagerdatum({ datum: '2026-10-08', kunde: 'Bar X', monat: '2026-10' }), '2026-10-08');
  assert.strictEqual(k.verkaufLagerdatum({ datum: '2026-10-08', kunde: 'Getränke DÖRFLINGER', monat: '2026-10' }), '2026-09-30');
  assert.strictEqual(k.verkaufLagerdatum({ datum: '2026-01-05', kunde: 'dörflinger', monat: '2026-01' }), '2025-12-31');
  assert.strictEqual(k.verkaufLagerdatum({ datum: null, kunde: 'Dörflinger', monat: '2026-02' }), '2026-02-28', 'Altliste: Monatsende');
  assert.strictEqual(k.verkaufLagerdatum({ datum: null, monat: null }), null);
});

/** Lager-Log-Zeile: [Datum, Standort, Art, Flaschen, Nach, Wer, Kommentar, Erfasst am, ID, Storno von]. */
const z = (datum, standort, art, flaschen, extra) => {
  const x = Object.assign({ nach: '', erfasst: '', id: '', von: '' }, extra || {});
  return [datum, standort, art, flaschen, x.nach, 'Test', '', x.erfasst, x.id, x.von];
};

function rechne(logZeilen, verkaeufe) {
  const e = k.einstellungenLesen(einstellungen());
  const log = k.lagerLogLesen([lagerKopf()].concat(logZeilen), berlin, e);
  const l = k.lagerBerechnen(log.buchungen, verkaeufe || [], e);
  const s = {};
  l.standorte.forEach((x) => { s[x.standort] = roh(x); });
  return { s, hinweise: log.hinweise.concat(l.hinweise), standorte: l.standorte };
}

test('Ohne Inventur: Bestand null, Gesamt aus „rechnerisch“ mit Quelle', () => {
  const { s, standorte } = rechne([z('2026-10-01', 'Lager Süd', 'Abfüllung', 1000)]);
  assert.deepStrictEqual(s['Lager Süd'], { standort: 'Lager Süd', bestand: null, letzteInventur: null, gezaehlt: null, schwund: null });
  assert.deepStrictEqual(roh(k.gesamtBestand(standorte, 5000)),
    { wert: 5000, quelle: 'rechnerisch', summeBekannt: null, fehlen: ['Lager Süd', 'Lager Nord', 'Lager Ost'] });
});

test('Inventur + Bewegungen danach; am Inventurtag zählt nichts mehr (Ende des Tages)', () => {
  const verkaeufe = [
    { monat: '2026-10', datum: '2026-10-10', kanal: 'Karlsruhe', kunde: 'Bar', flaschen: 24, standort: '' }, // Inventurtag → zählt nicht
    { monat: '2026-10', datum: '2026-10-11', kanal: 'Karlsruhe', kunde: 'Bar', flaschen: 48, standort: '' },
    { monat: '2026-10', datum: '2026-10-12', kanal: 'Karlsruhe', kunde: 'Bar', flaschen: -12, standort: '' }, // Gutschrift
    { monat: '2026-10', datum: '2026-10-12', kanal: 'Berlin', kunde: 'Späti', flaschen: 24, standort: '' }, // geht von Lager Nord
    { monat: '2026-09', datum: null, kanal: 'Karlsruhe', kunde: 'Alt', flaschen: 500, standort: '' }, // Altliste 30.09. → vorher
  ];
  const { s } = rechne([
    z('2026-10-10', 'Lager Süd', 'Inventur', 1000),
    z('2026-10-10', 'Lager Nord', 'Inventur', 100),
    z('2026-10-10', 'Lager Ost', 'Inventur', 0),
    z('2026-10-10', 'Lager Süd', 'Promo', 5), // Inventurtag → zählt nicht
    z('2026-10-15', 'Lager Süd', 'Umlagerung', 200, { nach: 'Lager Ost' }),
    z('2026-10-16', 'Lager Süd', 'Promo', 6),
    z('2026-10-16', 'Lager Süd', 'Eigenverbrauch', 2),
    z('2026-10-17', 'Lager Süd', 'Bruch', 1),
    z('2026-10-18', '', 'Abfüllung', 3000), // ohne Standort → Hauptlager
  ], verkaeufe);
  // 1000 − 48 + 12 − 200 − 6 − 2 − 1 + 3000
  assert.strictEqual(s['Lager Süd'].bestand, 3755);
  assert.strictEqual(s['Lager Nord'].bestand, 76);
  assert.strictEqual(s['Lager Ost'].bestand, 200);
  assert.strictEqual(s['Lager Süd'].letzteInventur, '2026-10-10');
  assert.strictEqual(s['Lager Süd'].schwund, null, 'erste Inventur: kein Schwund');
});

test('Dörflinger-Rechnung nach der Inventur zählt nur, wenn ihr Vormonatsende nach der Inventur liegt', () => {
  const v = (datum) => ({ monat: datum.slice(0, 7), datum: datum, kanal: 'Karlsruhe', kunde: 'Dörflinger', flaschen: 100, standort: '' });
  const { s } = rechne([z('2026-10-20', 'Lager Süd', 'Inventur', 1000)], [v('2026-11-05'), v('2026-12-03')]);
  // 05.11. → 31.10. (nach 20.10., zählt); 03.12. → 30.11. (zählt); beide −100
  assert.strictEqual(s['Lager Süd'].bestand, 800);
  const vorher = rechne([z('2026-11-02', 'Lager Süd', 'Inventur', 1000)], [v('2026-11-05')]).s;
  assert.strictEqual(vorher['Lager Süd'].bestand, 1000, '05.11. → 31.10. liegt vor der Inventur am 02.11.');
});

test('Mehrere Inventuren: letzte gilt, Schwund aus der vorigen, gleicher Tag → zuletzt erfasste', () => {
  const verkaeufe = [{ monat: '2026-10', datum: '2026-10-05', kanal: 'Karlsruhe', kunde: 'Bar', flaschen: 100, standort: '' }];
  const { s } = rechne([
    z('2026-11-01', 'Lager Süd', 'Inventur', 870, { erfasst: new Date('2026-11-01T18:00:00Z') }),
    z('2026-10-01', 'Lager Süd', 'Inventur', 1000),
    z('2026-10-20', 'Lager Süd', 'Promo', 10),
    // gleicher Tag, früher erfasst (steht aber weiter unten) → gilt nicht
    z('2026-11-01', 'Lager Süd', 'Inventur', 999, { erfasst: new Date('2026-11-01T08:00:00Z') }),
    z('2026-11-03', 'Lager Süd', 'Bruch', 4),
  ], verkaeufe);
  // Soll am 01.11.: 1000 − 100 − 10 = 890, gezählt 870 → Schwund 20
  assert.strictEqual(s['Lager Süd'].schwund, 20);
  assert.strictEqual(s['Lager Süd'].gezaehlt, 870);
  assert.strictEqual(s['Lager Süd'].bestand, 866);
  // ohne „Erfasst am“: Zeilenreihenfolge, die untere gilt
  const r = rechne([z('2026-11-01', 'Lager Nord', 'Inventur', 50), z('2026-11-01', 'Lager Nord', 'Inventur', 40)]).s;
  assert.strictEqual(r['Lager Nord'].bestand, 40);
});

test('Storno nimmt die Zeile heraus, unbekannte ID nur als Hinweis', () => {
  const { s, hinweise } = rechne([
    z('2026-10-01', 'Lager Süd', 'Inventur', 1000, { id: 'a1' }),
    z('2026-10-05', 'Lager Süd', 'Bruch', 50, { id: 'a2' }),
    z('2026-10-06', 'Lager Süd', 'Storno', '', { id: 'a3', von: 'a2' }),
    z('2026-10-07', 'Lager Süd', 'Storno', '', { id: 'a4', von: 'gibtsnicht' }),
    z('2026-10-08', 'Lager Süd', 'Promo', 5, { id: 'a5' }),
  ]);
  assert.strictEqual(s['Lager Süd'].bestand, 995);
  assert.ok(hinweise.some((h) => /Zeile 5: Storno auf unbekannte ID „gibtsnicht“/.test(h)), hinweise.join('|'));
  // Storno einer Inventur → wieder ohne Inventur
  const ohne = rechne([z('2026-10-01', 'Lager Nord', 'Inventur', 10, { id: 'x' }), z('2026-10-02', 'Lager Nord', 'storno', '', { von: 'x' })]).s;
  assert.strictEqual(ohne['Lager Nord'].bestand, null);
});

test('Ungültige Lager-Log-Zeilen zählen nicht und landen als Hinweis', () => {
  const { s, hinweise } = rechne([
    z('2026-10-01', 'Lager Süd', 'Inventur', 100),
    ['', '', '', '', '', '', '', '', '', ''],
    z('kein Datum', 'Lager Süd', 'Bruch', 1),
    z('2026-10-02', 'Lager West', 'Bruch', 1),
    z('2026-10-02', 'Lager Süd', 'Bruch', -3),
    z('2026-10-02', 'Lager Süd', 'Bruch', 0),
    z('2026-10-02', 'Lager Süd', 'Umlagerung', 5, { nach: 'Lager Süd' }),
    z('2026-10-02', 'Lager Süd', 'Verschenkt', 5),
    z('02.10.2026', 'Lager Süd', 'Bruch', '2'),
  ]);
  assert.strictEqual(s['Lager Süd'].bestand, 98, 'nur die letzte Zeile (Text-Datum, Text-Zahl) zählt');
  assert.strictEqual(hinweise.length, 6, hinweise.join('|'));
});

test('Lager-Log mit falschem Kopf → Fehler (Schutz gegen verschobene Spalten)', () => {
  const e = k.einstellungenLesen(einstellungen());
  assert.throws(() => k.lagerLogLesen([['Datum', 'Art']], berlin, e), /Spaltenkopf/);
});

test('Verkauf mit unbekanntem Standort in L: Hinweis, zählt bei keinem Lager', () => {
  const { s, hinweise } = rechne([z('2026-10-01', 'Lager Süd', 'Inventur', 100)],
    [{ monat: '2026-10', datum: '2026-10-05', kanal: 'Karlsruhe', kunde: 'Bar', flaschen: 10, standort: 'Keller' }]);
  assert.strictEqual(s['Lager Süd'].bestand, 100);
  assert.ok(hinweise.some((h) => /Standort „Keller“ unbekannt \(1 Zeilen\)/.test(h)));
});

test('Gesamtbestand: alle gezählt → Summe, teilweise → rechnerisch plus Summe der bekannten', () => {
  const alle = rechne([z('2026-10-01', 'Lager Süd', 'Inventur', 100), z('2026-10-01', 'Lager Nord', 'Inventur', 20),
    z('2026-10-01', 'Lager Ost', 'Inventur', 3)]).standorte;
  assert.deepStrictEqual(roh(k.gesamtBestand(alle, 9999)), { wert: 123, quelle: 'inventur', summeBekannt: 123, fehlen: [] });
  const teil = rechne([z('2026-10-01', 'Lager Süd', 'Inventur', 100)]).standorte;
  assert.deepStrictEqual(roh(k.gesamtBestand(teil, 9999)),
    { wert: 9999, quelle: 'rechnerisch', summeBekannt: 100, fehlen: ['Lager Nord', 'Lager Ost'] });
});

test('Ø Abverkauf: nur volle Monate, laufender Monat zählt nicht, Gutschrift mindert', () => {
  const v = (monat, flaschen) => ({ monat: monat, flaschen: flaschen });
  const liste = [v('2026-07', 999), v('2026-08', 300), v('2026-09', 300), v('2026-10', 330), v('2026-10', -30), v('2026-11', 5000)];
  assert.deepStrictEqual(roh(k.abverkaufProMonat(liste, '2026-11-08', 3)), { wert: 300, genau: 300, von: '2026-08', bis: '2026-10', monate: 3 });
  assert.deepStrictEqual(roh(k.abverkaufProMonat(liste, '2027-01-01', 1)), { wert: 0, genau: 0, von: '2026-12', bis: '2026-12', monate: 1 });
});

test('Reichweite und Bestelltermin: ok, bald, jetzt bestellen, ohne Abverkauf', () => {
  const e = { mindestbestand: 0, vorlaufMonate: 2, pufferWochen: 2 };
  const ok = roh(k.bestellStatus(1200, 200, e, '2026-11-08'));
  // 6 Monate = 182,6 Tage → 2027-05-09; − 2 Monate → 2027-03-09; − 14 Tage → 2027-02-23
  assert.deepStrictEqual(ok, { reichweite: 6, leerAm: '2027-05-09', spaetestensBestellen: '2027-02-23', status: 'ok' });
  const bald = roh(k.bestellStatus(700, 200, e, '2026-11-08'));
  assert.strictEqual(bald.reichweite, 3.5);
  assert.strictEqual(bald.status, 'bald', JSON.stringify(bald));
  const jetzt = roh(k.bestellStatus(300, 200, Object.assign({}, e, { mindestbestand: 100 }), '2026-11-08'));
  assert.strictEqual(jetzt.reichweite, 1);
  assert.strictEqual(jetzt.status, 'jetzt bestellen');
  const leer = roh(k.bestellStatus(-50, 200, e, '2026-11-08'));
  assert.strictEqual(leer.leerAm, '2026-10-31', 'Reichweite −0,25 Monate → schon vorbei');
  assert.strictEqual(leer.status, 'jetzt bestellen');
  assert.deepStrictEqual(roh(k.bestellStatus(1000, 0, e, '2026-11-08')),
    { reichweite: null, leerAm: null, spaetestensBestellen: null, status: null });
  assert.strictEqual(k.bestellStatus(null, 100, e, '2026-11-08').status, null);
});

test('Werte für Lager!B2:F5: Zuordnung nach Namen in Spalte A, Summe, fehlende Standorte', () => {
  const jetzt = new Date('2026-11-08T06:30:00Z');
  const standorte = [
    { standort: 'Lager Süd', bestand: 480, letzteInventur: '2026-11-01', schwund: 20 },
    { standort: 'Lager Nord', bestand: null, letzteInventur: null, schwund: null },
    { standort: 'Lager Ost', bestand: 12, letzteInventur: '2026-11-02', schwund: null },
  ];
  const aus = k.lagerTabWerte(['Lager Nord', 'Lager Süd', 'Irgendwas', 'Summe'], standorte, 24, jetzt);
  assert.deepStrictEqual(roh(aus.werte), roh([
    ['', '', 'noch keine', '', jetzt],
    [480, 20, '2026-11-01', 20, jetzt],
    ['', '', '', '', jetzt],
    [492, 20.5, '2 von 3 gezählt', 20, jetzt],
  ]));
  assert.deepStrictEqual(roh(aus.fehlen), ['Lager Ost']);
});

test('Codex-Befunde: Vorlauf nur ganze Monate, Ø ungerundet, negative Reichweite, gemischte Zeitstempel, Prototyp-Namen', () => {
  const e = k.einstellungenLesen([['Einstellung', 'Wert'], ['Vorlaufzeit Abfüller (Monate)', '2,5']]);
  assert.strictEqual(e.vorlaufMonate, 2, 'Bruchteile → Standardwert mit Hinweis');
  assert.ok(e.hinweise.some((h) => /Vorlaufzeit/.test(h)));
  // 1 Flasche in 6 Monaten: Ø 1/6 → Reichweite 6 Monate (nicht 1/0,2 = 5)
  const ab = k.abverkaufProMonat([{ monat: '2026-10', flaschen: 1 }], '2026-11-08', 6);
  assert.strictEqual(ab.wert, 0.2);
  assert.strictEqual(k.bestellStatus(1, ab.genau, { mindestbestand: 0, vorlaufMonate: 0, pufferWochen: 0 }, '2026-11-08').reichweite, 6);
  // Bestand unter Mindestbestand: leer am liegt in der Vergangenheit → jetzt bestellen
  const neg = roh(k.bestellStatus(0, 100, { mindestbestand: 100, vorlaufMonate: 0, pufferWochen: 0 }, '2026-11-08'));
  assert.strictEqual(neg.reichweite, -1);
  assert.ok(neg.leerAm < '2026-11-08', neg.leerAm);
  assert.strictEqual(neg.status, 'jetzt bestellen');
  // Text-Zeitstempel (Ortszeit) und Datumsobjekt nicht gegeneinander vergleichen → Zeilenreihenfolge
  const r = rechne([
    z('2026-11-01', 'Lager Süd', 'Inventur', 10, { erfasst: new Date('2026-11-01T08:30:00Z') }), // 09:30 Berlin
    z('2026-11-01', 'Lager Süd', 'Inventur', 20, { erfasst: '01.11.2026 09:00' }),
  ]).s;
  assert.strictEqual(r['Lager Süd'].bestand, 20);
  // Kunden, IDs und Standorte wie „constructor“/„__proto__“ brechen nichts
  const v = [{ monat: '2026-10', kanal: 'Karlsruhe', kunde: 'constructor', flaschen: 5, umsatz: 1 },
    { monat: '2026-10', kanal: 'Karlsruhe', kunde: '__proto__', flaschen: 3, umsatz: 1 }];
  assert.deepStrictEqual(roh(k.verkaeufeAuswerten(v, '2026-11-08').letzte12.kunden.map((x) => x.kunde)), ['constructor', '__proto__']);
  const s = rechne([z('2026-10-01', 'Lager Süd', 'Inventur', 9, { id: 'constructor' }), z('2026-10-02', 'Lager Süd', 'Storno', '', { von: 'toString' })],
    [{ monat: '2026-10', datum: '2026-10-05', kanal: 'Karlsruhe', kunde: 'X', flaschen: 1, standort: 'constructor' }]);
  assert.strictEqual(s.s['Lager Süd'].bestand, 9);
  assert.ok(s.hinweise.some((h) => /unbekannte ID „toString“/.test(h)));
  assert.ok(s.hinweise.some((h) => /Standort „constructor“ unbekannt/.test(h)));
});

test('Codex 2026-11-08: Log-Zeilen und Verkäufe nach „heute“ zählen noch nicht (Hinweis), ohne heute wie bisher', () => {
  const e = k.einstellungenLesen(einstellungen());
  const log = k.lagerLogLesen([lagerKopf(),
    z('2026-11-01', 'Lager Süd', 'Inventur', 1000),
    z('2026-11-05', 'Lager Süd', 'Bruch', 10),
    z('2026-11-09', 'Lager Süd', 'Bruch', 500), // morgen
    z('2026-11-12', 'Lager Süd', 'Inventur', 3), // Inventur in der Zukunft
  ], berlin, e);
  const verkaeufe = [
    { monat: '2026-11', datum: '2026-11-06', kanal: 'Karlsruhe', kunde: 'Bar', flaschen: 20, standort: '' },
    { monat: '2026-11', datum: '2026-11-20', kanal: 'Karlsruhe', kunde: 'Bar', flaschen: 40, standort: '' }, // Zukunft
    { monat: '2026-12', datum: '2026-12-03', kanal: 'Karlsruhe', kunde: 'Dörflinger', flaschen: 30, standort: '' }, // Lagerdatum 30.11.
    { monat: '2026-11', datum: null, kanal: 'Karlsruhe', kunde: 'Alt', flaschen: 7, standort: '' }, // Altliste laufender Monat zählt
  ];
  const l = k.lagerBerechnen(log.buchungen, verkaeufe, e, '2026-11-08');
  const sued = roh(l.standorte[0]);
  assert.strictEqual(sued.bestand, 1000 - 10 - 20 - 7);
  assert.strictEqual(sued.letzteInventur, '2026-11-01');
  assert.deepStrictEqual(roh(l.hinweise), [
    'Lager-Log Zeile 4: Datum 2026-11-09 liegt in der Zukunft, zählt noch nicht.',
    'Lager-Log Zeile 5: Datum 2026-11-12 liegt in der Zukunft, zählt noch nicht.',
    'Verkäufe: 2 Zeilen mit Datum in der Zukunft, zählt noch nicht.',
  ]);
  // ohne heute (alte Aufrufe): alles zählt
  assert.strictEqual(k.lagerBerechnen(log.buchungen, verkaeufe, e).standorte[0].letzteInventur, '2026-11-12');
});

test('Codex 2026-11-08: Storno mit Datum nach heute hebt das Original noch nicht auf', () => {
  const e = k.einstellungenLesen(einstellungen());
  const zeilen = [lagerKopf(), z('2026-11-01', 'Lager Süd', 'Inventur', 100), z('2026-11-02', 'Lager Süd', 'Bruch', 10, { id: 'b1' }),
    z('2026-11-09', 'Lager Süd', 'Storno', '', { id: 's1', von: 'b1' })];
  const log = k.lagerLogLesen(zeilen, berlin, e, '2026-11-08');
  assert.strictEqual(k.lagerBerechnen(log.buchungen, [], e, '2026-11-08').standorte[0].bestand, 90);
  assert.deepStrictEqual(roh(log.hinweise), ['Lager-Log Zeile 4: Datum 2026-11-09 liegt in der Zukunft, zählt noch nicht.']);
  const ab = k.lagerLogLesen(zeilen, berlin, e, '2026-11-09');
  assert.strictEqual(k.lagerBerechnen(ab.buchungen, [], e, '2026-11-09').standorte[0].bestand, 100, 'ab dem Storno-Tag aufgehoben');
});
