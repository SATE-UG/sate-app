'use strict';

// Schreib-Logik (Task 5): Prüfregeln, Formel-Injektion, Abfüllungsnummer, Negativ-Warnung, Storno, Verlauf,
// anfrageId und verkaufStandort. Rein und über doPost mit Google-Attrappen. Alle Daten frei erfunden.

const test = require('node:test');
const assert = require('node:assert');
const { lade, ladeAlles, roh } = require('./lade');
const { neueWelt } = require('./google');
const D = require('./daten');

const k = lade();
const e = k.einstellungenLesen(D.einstellungen());
const HEUTE = '2026-11-08';

// Rein --------------------------------------------------------------------------------------------------------

test('buchungPruefen: Art, Standort, Nach-Standort, Flaschen, Datum, Kommentar', () => {
  const gut = { art: 'Promo', standort: 'Lager Süd', flaschen: 12, datum: HEUTE };
  const p = (x) => roh(k.buchungPruefen(Object.assign({}, gut, x), e, HEUTE));
  assert.deepStrictEqual(p({}), { buchung: { art: 'Promo', standort: 'Lager Süd', nach: '', flaschen: 12, datum: HEUTE, kommentar: '' } });
  // Art: nur aus der Liste, kein Storno
  for (const art of ['Storno', 'promo', '', undefined, 3, 'Verkauf']) assert.strictEqual(p({ art }).fehler, 'Bitte eine gültige Art wählen', String(art));
  for (const art of ['Inventur', 'Abfüllung', 'Umlagerung', 'Promo', 'Eigenverbrauch', 'Bruch']) {
    assert.ok(!p({ art, nachStandort: 'Lager Nord' }).fehler, art);
  }
  // Standort
  assert.strictEqual(p({ standort: 'Keller' }).fehler, 'Standort unbekannt');
  assert.strictEqual(p({ standort: '' }).fehler, 'Standort unbekannt');
  assert.strictEqual(p({ art: 'Abfüllung', standort: undefined }).buchung.standort, 'Lager Süd', 'Abfüllung: Hauptlager');
  assert.strictEqual(p({ art: 'Abfüllung', standort: 'Lager Ost' }).buchung.standort, 'Lager Ost');
  // Umlagerung
  assert.strictEqual(p({ art: 'Umlagerung' }).fehler, 'Nach-Standort fehlt, ist unbekannt oder gleich dem Standort');
  assert.strictEqual(p({ art: 'Umlagerung', nachStandort: 'Lager Süd' }).fehler, 'Nach-Standort fehlt, ist unbekannt oder gleich dem Standort');
  assert.strictEqual(p({ art: 'Umlagerung', nachStandort: 'Mond' }).fehler, 'Nach-Standort fehlt, ist unbekannt oder gleich dem Standort');
  assert.strictEqual(p({ art: 'Umlagerung', nachStandort: ' Lager Nord ' }).buchung.nach, 'Lager Nord');
  assert.strictEqual(p({ nachStandort: 'Lager Nord' }).buchung.nach, '', 'Nach-Standort nur bei Umlagerung');
  // Flaschen
  for (const f of [0, -1, 1.5, 50001, '12,5', '1e3', null, undefined, NaN, Infinity, true, '']) {
    assert.strictEqual(p({ flaschen: f }).fehler, 'Flaschen: bitte eine ganze Zahl von 1 bis 50.000', String(f));
  }
  assert.strictEqual(p({ flaschen: 1 }).buchung.flaschen, 1);
  assert.strictEqual(p({ flaschen: 50000 }).buchung.flaschen, 50000);
  assert.strictEqual(p({ flaschen: ' 24 ' }).buchung.flaschen, 24);
  assert.strictEqual(p({ art: 'Inventur', flaschen: 0 }).buchung.flaschen, 0, 'Inventur darf 0');
  assert.strictEqual(p({ art: 'Inventur', flaschen: -1 }).fehler, 'Flaschen: bitte eine ganze Zahl von 0 bis 50.000');
  assert.strictEqual(p({ art: 'Inventur', flaschen: 50001 }).fehler, 'Flaschen: bitte eine ganze Zahl von 0 bis 50.000');
  // Datum (Berlin): höchstens 1 Tag in der Zukunft, höchstens 400 Tage zurück
  for (const d of ['2026-02-30', '08.11.2026', '2026-11-8', '', undefined, 20261108]) assert.strictEqual(p({ datum: d }).fehler, 'Datum ungültig', String(d));
  assert.strictEqual(p({ datum: '2026-11-09' }).buchung.datum, '2026-11-09');
  assert.strictEqual(p({ datum: '2026-11-10' }).fehler, 'Datum liegt zu weit in der Zukunft (höchstens morgen)');
  assert.strictEqual(p({ datum: k.tagePlus(HEUTE, -400) }).buchung.datum, '2025-10-04');
  assert.strictEqual(p({ datum: k.tagePlus(HEUTE, -401) }).fehler, 'Datum liegt mehr als 400 Tage zurück');
  // Kommentar: Steuerzeichen raus, höchstens 200 Zeichen, nur Text
  assert.strictEqual(p({ kommentar: ' Fest\n\tim\u0000Park  ' }).buchung.kommentar, 'Fest im Park');
  assert.strictEqual(p({ kommentar: 'x'.repeat(200) }).buchung.kommentar.length, 200);
  assert.strictEqual(p({ kommentar: 'x'.repeat(201) }).fehler, 'Kommentar zu lang (höchstens 200 Zeichen)');
  assert.strictEqual(p({ kommentar: '🍹'.repeat(200) }).buchung.kommentar.length, 400, 'Emoji zählt als ein Zeichen');
  assert.strictEqual(p({ kommentar: { a: 1 } }).fehler, 'Kommentar zu lang (höchstens 200 Zeichen)');
});

test('Formel-Injektion: gefährliche Anfänge bekommen ein Hochkomma, Zahlen und Datum bleiben', () => {
  for (const t of ['=HYPERLINK("x")', '+49', '-1', '@SUM(A1)', '\tx', '\rx', '12 Flaschen']) assert.strictEqual(k.textSicher(t), "'" + t);
  for (const t of ['Fest im Park', 'Lager Süd', '', 'a=b']) assert.strictEqual(k.textSicher(t), t);
  const d = new Date();
  assert.deepStrictEqual(roh(k.zellenSicher(['=1+1', 5, '', 'ok'])), ["'=1+1", 5, '', 'ok']);
  assert.strictEqual(k.zellenSicher([d])[0], d);
});

test('naechsteZeile: nach der letzten Zeile mit Inhalt, leere/Leerzeichen-Zeilen zählen nicht, Lücken bleiben', () => {
  assert.strictEqual(k.naechsteZeile([['Kopf']]), 2);
  assert.strictEqual(k.naechsteZeile([]), 2);
  assert.strictEqual(k.naechsteZeile([['Kopf'], ['a'], ['', ''], [' ', null], []]), 3);
  assert.strictEqual(k.naechsteZeile([['Kopf'], [''], ['', '', 'Kommentar']]), 4, 'Inhalt in einer anderen Spalte zählt');
});

test('Abfüllungsnummer: höchste aktive Nummer + 1, Storno-Zeilen heben auf', () => {
  const kopf = ['Abfüllung', 'Monat', 'Flaschen', 'Quelle'];
  assert.strictEqual(k.abfuellungNummer([kopf]), 1);
  assert.strictEqual(k.abfuellungNummer([kopf, ['3. Abfüllung'], ['5. Abfüllung'], ['4. Abfüllung'], ['Notiz']]), 6);
  assert.strictEqual(k.abfuellungNummer([kopf, ['5. Abfüllung'], ['6. Abfüllung'], ['Storno 6. Abfüllung']]), 6);
  assert.strictEqual(k.abfuellungNummer([kopf, ['5. Abfüllung'], ['6. Abfüllung'], ['Storno 6. Abfüllung'], ['6. Abfüllung']]), 7);
  assert.strictEqual(k.abfuellungQuelle('Jonas', HEUTE, 'LX-1'), 'SATE-App, Jonas, 2026-11-08, ID LX-1');
});

test('Negativ-Warnung: nur betroffene Standorte mit Inventur, nur wenn es schlechter wird', () => {
  const v = [{ standort: 'A', bestand: 10 }, { standort: 'B', bestand: null }, { standort: 'C', bestand: -5 }];
  const n = [{ standort: 'A', bestand: -2 }, { standort: 'B', bestand: null }, { standort: 'C', bestand: -5 }];
  assert.match(k.negativWarnung(v, n, ['A']), /negativ: A -2 Flaschen\. Trotzdem eintragen\?/);
  assert.strictEqual(k.negativWarnung(v, n, ['B']), null, 'ohne Inventur keine Warnung');
  assert.strictEqual(k.negativWarnung(v, n, ['C']), null, 'schon negativ, wird nicht schlechter');
  assert.match(k.negativWarnung(v, [n[0], n[1], { standort: 'C', bestand: -6 }], ['C']), /C -6/);
});

/** Lager-Log-Zeile [Datum, Standort, Art, Flaschen, Nach, Wer, Kommentar, Erfasst, ID, Storno von]. */
const ll = (art, id, extra) => Object.assign([D.zelle(2026, 11, 2), 'Lager Süd', art, 10, '', 'Test', '', '', id, ''], extra || {});

test('stornoPruefen: unbekannt, Storno-Zeile, schon storniert, doppelte ID', () => {
  const log = [D.lagerKopf(), ll('Promo', 'a'), ll('Bruch', 'b'), ll('Storno', 's1', { 9: 'b' }), ll('Promo', 'd'), ll('Promo', 'd')];
  assert.strictEqual(k.stornoPruefen(log, 'a').nr, 2);
  assert.strictEqual(k.stornoPruefen(log, ' a ').id, 'a');
  assert.strictEqual(k.stornoPruefen(log, 'x').fehler, 'Eintrag nicht gefunden');
  assert.strictEqual(k.stornoPruefen(log, '').fehler, 'Eintrag nicht gefunden');
  assert.strictEqual(k.stornoPruefen(log, 42).fehler, 'Eintrag nicht gefunden');
  assert.strictEqual(k.stornoPruefen(log, 's1').fehler, 'Ein Storno kann man nicht stornieren');
  assert.strictEqual(k.stornoPruefen(log, 'b').fehler, 'Eintrag ist schon storniert');
  assert.strictEqual(k.stornoPruefen(log, 'd').fehler, 'Diese ID steht mehrfach im Lager-Log, bitte Mark Bescheid geben');
  assert.strictEqual(k.stornoKommentar(ll('Umlagerung', 'u', { 3: 50, 4: 'Lager Nord' }), D.berlin),
    'Storno: Umlagerung 50 Fl. Lager Süd → Lager Nord vom 02.11.2026');
});

test('Abfüllung stornieren: Gegenzeile mit negativen Flaschen, sonst Hinweis für Mark', () => {
  const ab = [['Abfüllung', 'Monat', 'Flaschen', 'Quelle'], ['5. Abfüllung', 46204, 3000, 'Altliste'],
    ['6. Abfüllung', 46327, 1200, 'SATE-App, Jonas, 2026-11-03, ID LX-1']];
  assert.deepStrictEqual(roh(k.abfuellungStorno(ab, 'LX-1', 'Mark', HEUTE)).werte,
    ['Storno 6. Abfüllung', 46327, -1200, 'SATE-App, Storno von ID LX-1, Mark, 2026-11-08']);
  assert.match(k.abfuellungStorno(ab, 'LX-2', 'Mark', HEUTE).hinweis, /von Hand/);
  const schon = ab.concat([['Storno 6. Abfüllung', 46327, -1200, 'SATE-App, Storno von ID LX-1, Mark, 2026-11-08']]);
  assert.match(k.abfuellungStorno(schon, 'LX-1', 'Mark', HEUTE).hinweis, /von Hand/);
});

test('verlaufBauen: neueste zuerst, höchstens n, storniert/stornierbar', () => {
  const log = [D.lagerKopf(), ll('Promo', 'a'), ll('Bruch', 'b', { 7: new Date('2026-11-02T10:00:00Z') }), ll('Storno', 's1', { 9: 'b' }),
    ll('Quatsch', 'q'), ll('Promo', ''), ['', '', '', '']];
  const v = roh(k.verlaufBauen(log, D.berlin, 30));
  assert.deepStrictEqual(v.map((x) => x.zeile), [6, 5, 4, 3, 2]);
  assert.deepStrictEqual(v.map((x) => [x.storniert, x.stornierbar]), [[false, false], [false, false], [false, false], [true, false], [false, true]]);
  assert.strictEqual(v[3].erfasst, '2026-11-02T10:00:00.000Z');
  assert.strictEqual(v[3].datum, '2026-11-02');
  assert.strictEqual(v[1].art, 'Quatsch');
  assert.strictEqual(v[2].stornoVon, 'b');
  assert.strictEqual(k.verlaufBauen(log, D.berlin, 2).length, 2);
  assert.throws(() => k.verlaufBauen([['falsch']], D.berlin, 30), /Spaltenkopf/);
});

test('verkaufStandortPruefen und verkaufListeBauen', () => {
  const zeilen = [D.verkaufKopf(), D.rechnungszeile(2026, 11, 3, 'Berlin', 'Späti', 24, 30), D.rechnungszeile(2026, 11, 3, 'Berlin', 'Späti', 12, 15)];
  zeilen[1][9] = 'R-7';
  zeilen[2][9] = 'R-7';
  assert.deepStrictEqual(roh(k.verkaufStandortPruefen({ rechnung: ' R-7 ', standort: 'Lager Ost' }, e, zeilen)),
    { rechnung: 'R-7', standort: 'Lager Ost', zeilen: [2, 3] });
  assert.strictEqual(k.verkaufStandortPruefen({ rechnung: 'R-7', standort: '' }, e, zeilen).standort, '');
  assert.strictEqual(k.verkaufStandortPruefen({ rechnung: 'R-7' }, e, zeilen).standort, '');
  assert.strictEqual(k.verkaufStandortPruefen({ rechnung: 'R-8', standort: 'Lager Ost' }, e, zeilen).fehler, 'Rechnung nicht gefunden');
  assert.strictEqual(k.verkaufStandortPruefen({ rechnung: '', standort: 'Lager Ost' }, e, zeilen).fehler, 'Rechnung nicht gefunden');
  assert.strictEqual(k.verkaufStandortPruefen({ rechnung: 'R-7', standort: 'Mond' }, e, zeilen).fehler, 'Standort unbekannt');
  assert.strictEqual(k.verkaufStandortPruefen({ rechnung: 'R-7', standort: 5 }, e, zeilen).fehler, 'Standort unbekannt');

  zeilen.push(D.rechnungszeile(2026, 8, 1, 'Karlsruhe', 'Alt', 5, 5));
  zeilen[3][9] = 'R-1';
  zeilen.push(D.rechnungszeile(2026, 11, 5, 'Karlsruhe', 'Bar', 6, 7, 'Lager Ost'));
  zeilen[4][9] = 'R-9';
  zeilen.push(D.altzeile(2026, 10, 'Berlin', 'Ohne Rechnung', 5, 5));
  const liste = roh(k.verkaufListeBauen(k.verkaeufeLesen(zeilen, D.berlin).verkaeufe, e, HEUTE));
  assert.deepStrictEqual(liste, [
    { rechnung: 'R-9', datum: '2026-11-05', kunde: 'Bar', kanal: 'Karlsruhe', flaschen: 6, standort: 'Lager Ost', standortGesetzt: true, gemischt: false },
    { rechnung: 'R-7', datum: '2026-11-03', kunde: 'Späti', kanal: 'Berlin', flaschen: 36, standort: 'Lager Nord', standortGesetzt: false, gemischt: false },
  ]);
});

test('idErzeugen: Zeitstempel + 4 Zufallszeichen, neueId_ weicht vorhandenen aus', () => {
  assert.strictEqual(k.idErzeugen(1794150000000, 'ab-12-cd'), 'L' + (1794150000000).toString(36).toUpperCase() + '-AB12');
  let n = 0;
  const zufall = () => ['aaaa', 'aaaa', 'bbbb'][n++];
  const vorhanden = [D.lagerKopf(), ll('Promo', k.idErzeugen(1, 'aaaa'))];
  assert.strictEqual(k.neueId_(vorhanden, 1, zufall), k.idErzeugen(1, 'bbbb'));
});

// Über doPost mit Google-Attrappen -------------------------------------------------------------------------------

/** Tag relativ zu heute (Berlin) als Text und als Datumszelle. */
const heuteText = () => D.berlin(new Date());
const tag = (n) => k.tagePlus(heuteText(), n);
const zelleAus = (t) => D.zelle(Number(t.slice(0, 4)), Number(t.slice(5, 7)), Number(t.slice(8, 10)));

function post(kk, body) {
  const aus = kk.doPost({ postData: { contents: JSON.stringify(body), type: 'text/plain' } });
  return JSON.parse(aus.text);
}

/** Verkäufe-Zeile mit Rechnungsnummer `re` und Rechnungsdatum `t` (Text). */
function vz(t, kanal, kunde, flaschen, re, standort) {
  const z = D.rechnungszeile(Number(t.slice(0, 4)), Number(t.slice(5, 7)), Number(t.slice(8, 10)), kanal, kunde, flaschen, flaschen, standort);
  z[9] = re;
  return z;
}

function welt() {
  const { welt: w, globals } = neueWelt();
  const kk = ladeAlles(globals);
  w.tabs['Verkäufe'] = [D.verkaufKopf(),
    D.altzeile(2026, 8, 'Karlsruhe', 'Bar Eins', 300, 360),
    vz(tag(-5), 'Berlin', 'Späti Zwei', 24, 'R-100'),
    vz(tag(-5), 'Berlin', 'Späti Zwei', 24, 'R-100'),
    vz(tag(-70), 'Karlsruhe', 'Kiosk Alt', 10, 'R-101'),
    vz(tag(-2), 'Karlsruhe', 'Bar Drei', 12, 'R-102')];
  w.tabs['Lager-Log'] = [D.lagerKopf(),
    [D.zelle(2026, 10, 31), 'Lager Süd', 'Inventur', 2000, '', 'Mark', '', new Date('2026-10-31T17:00:00Z'), 'i1', ''],
    [D.zelle(2026, 10, 31), 'Lager Nord', 'Inventur', 100, '', 'Dave', '', '', 'i2', ''],
    [D.zelle(2026, 11, 2), 'Lager Süd', 'Umlagerung', 50, 'Lager Nord', 'Mark', '', '', 'u1', ''],
    // Zeilen mit nur Auswahllisten liefert getValues() als leere Zeilen
    ['', '', '', '', '', '', '', '', '', ''], ['', '', '', '', '', '', '', '', '', '']];
  w.tabs['App-Einstellungen'] = D.einstellungen();
  w.tabs['Abfüllungen'] = [['Abfüllung', 'Monat', 'Flaschen', 'Quelle'], ['1. Abfüllung', D.serie(2026, 7, 1), 3000, 'Altliste']];
  w.tabs['Lager'] = [['Standort', 'Bestand (Flaschen)', 'Kisten', 'Letzte Inventur', 'Schwund', 'Stand'],
    ['Lager Süd'], ['Lager Nord'], ['Lager Ost'], ['Summe']];
  kk.codeAnlegen('Jonas');
  const code = /: ([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})/.exec(w.logs[w.logs.length - 1])[1];
  w.sheetLesen.length = 0;
  w.sperren.length = 0; // codeAnlegen sperrt auch
  w.freigaben = 0;
  const p = (aktion, daten) => post(kk, Object.assign({ code: code, aktion: aktion }, daten || {}));
  return { w, kk, p, code };
}

const istDatum = (x) => Object.prototype.toString.call(x) === '[object Date]';

test('buchen: eine Zeile A–J nach der letzten Zeile mit Inhalt, Datum echt, Wer aus dem Code, frische Übersicht', () => {
  const { w, p } = welt();
  const a = p('buchen', { art: 'Promo', standort: 'Lager Süd', flaschen: 24, datum: heuteText(), kommentar: 'Fest' });
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.strictEqual(a.name, 'Jonas');
  assert.match(a.id, /^L[0-9A-Z]+-[0-9A-Z]{4}$/);
  assert.deepStrictEqual(a.hinweise, []);
  assert.deepStrictEqual(w.sheetSchreiben, ['Lager-Log!A5:J5', 'Lager!B2:F5']);
  const z = w.tabs['Lager-Log'][4];
  assert.ok(istDatum(z[0]) && D.berlin(z[0]) === heuteText(), 'Datum = Mitternacht Berlin');
  assert.deepStrictEqual(z.slice(1, 7), ['Lager Süd', 'Promo', 24, '', 'Jonas', 'Fest']);
  assert.ok(istDatum(z[7]) && Math.abs(z[7] - Date.now()) < 60000, 'Erfasst am = jetzt');
  assert.deepStrictEqual(z.slice(8), [a.id, '']);
  assert.strictEqual(w.formate['Lager-Log!A5'], 'dd.MM.yyyy');
  assert.strictEqual(w.formate['Lager-Log!H5'], 'dd.MM.yyyy HH:mm:ss');
  // Übersicht schon mit der Buchung: Süd 2000 − 50 (Umlagerung) − 12 (R-102) − 24
  assert.strictEqual(a.uebersicht.lager[0].bestand, 1914);
  assert.strictEqual(w.tabs['Lager'][1][1], 1914, 'Tab Lager aktualisiert');
  assert.ok(a.uebersicht.verkaufListe.length >= 2);
  assert.strictEqual(w.freigaben, 1, 'Sperre wieder frei');
  assert.deepStrictEqual(w.sperren, [10000]);
  assert.deepStrictEqual(w.formeln, []);
  // zweite Buchung landet in der nächsten Zeile
  p('buchen', { art: 'Bruch', standort: 'Lager Nord', flaschen: 1, datum: heuteText() });
  assert.strictEqual(w.sheetSchreiben[2], 'Lager-Log!A6:J6');
});

test('buchen: Formel-Injektion im Kommentar wird als Text gespeichert, Fehler verraten nichts', () => {
  const { w, p } = welt();
  const a = p('buchen', { art: 'Eigenverbrauch', standort: 'Lager Süd', flaschen: 2, datum: heuteText(), kommentar: '=IMPORTXML("http://x")' });
  assert.strictEqual(a.ok, true);
  assert.strictEqual(w.schreibLog[0].werte[0][6], "'=IMPORTXML(\"http://x\")");
  assert.strictEqual(w.tabs['Lager-Log'][4][6], '=IMPORTXML("http://x")');
  assert.deepStrictEqual(w.formeln, [], 'keine Formel im Sheet');
  const f = p('buchen', { art: 'Promo', standort: 'Lager Süd', flaschen: 'viele', datum: heuteText() });
  assert.deepStrictEqual(f, { ok: false, fehler: 'Flaschen: bitte eine ganze Zahl von 1 bis 50.000' });
  assert.deepStrictEqual(p('buchen', { art: 'Storno', standort: 'Lager Süd', flaschen: 1, datum: heuteText() }),
    { ok: false, fehler: 'Bitte eine gültige Art wählen' });
  assert.strictEqual(w.schreibLog.length, 2, 'nur die eine Buchung und Tab Lager');
});

test('buchen mit falschem Code: nichts gelesen, nichts geschrieben', () => {
  const { w, kk } = welt();
  const a = post(kk, { code: 'ABCD-EFGH-JKMN', aktion: 'buchen', art: 'Promo', standort: 'Lager Süd', flaschen: 1, datum: heuteText() });
  assert.deepStrictEqual(a, { ok: false, fehler: 'Code ungültig' });
  assert.deepStrictEqual(w.sheetLesen, []);
  assert.deepStrictEqual(w.sheetSchreiben, []);
  assert.deepStrictEqual(w.sperren, []);
});

test('Abfüllung: Hauptlager, Zeile in Abfüllungen mit fortlaufender Nummer, Monat als Datum MM.yyyy', () => {
  const { w, p } = welt();
  const a = p('buchen', { art: 'Abfüllung', flaschen: 1200, datum: heuteText() });
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.deepStrictEqual(a.hinweise, ['Im Tab Abfüllungen als „2. Abfüllung“ eingetragen.']);
  assert.deepStrictEqual(w.sheetSchreiben, ['Lager-Log!A5:J5', 'Abfüllungen!A3:D3', 'Lager!B2:F5']);
  assert.strictEqual(w.tabs['Lager-Log'][4][1], 'Lager Süd');
  const z = w.tabs['Abfüllungen'][2];
  assert.strictEqual(z[0], '2. Abfüllung');
  assert.ok(istDatum(z[1]) && D.berlin(z[1]) === heuteText().slice(0, 8) + '01');
  assert.strictEqual(z[2], 1200);
  assert.strictEqual(z[3], 'SATE-App, Jonas, ' + heuteText() + ', ID ' + a.id);
  assert.strictEqual(w.formate['Abfüllungen!B3'], 'MM.yyyy');
  assert.strictEqual(a.uebersicht.abfuellungen[1].flaschen, 1200);
  assert.strictEqual(a.uebersicht.abfuellungen[1].monat, heuteText().slice(0, 7));
});

test('Negativ-Warnung: erst Bestätigung, dann schreiben; ohne Inventur keine Warnung', () => {
  const { w, p } = welt();
  const daten = { art: 'Promo', standort: 'Lager Nord', flaschen: 500, datum: heuteText() };
  const a = p('buchen', daten);
  assert.strictEqual(a.ok, false);
  assert.strictEqual(a.brauchtBestaetigung, true);
  assert.match(a.warnung, /Lager Nord -[0-9]+ Flaschen\. Trotzdem eintragen\?/);
  assert.deepStrictEqual(w.sheetSchreiben, [], 'nichts geschrieben');
  assert.strictEqual(p('buchen', Object.assign({ bestaetigt: 'ja' }, daten)).brauchtBestaetigung, true, 'nur true zählt');
  const b = p('buchen', Object.assign({ bestaetigt: true }, daten));
  assert.strictEqual(b.ok, true);
  assert.ok(b.uebersicht.lager[1].bestand < 0);
  // Umlagerung prüft den Ausgangsstandort
  assert.strictEqual(p('buchen', { art: 'Umlagerung', standort: 'Lager Süd', nachStandort: 'Lager Ost', flaschen: 5000, datum: heuteText() })
    .brauchtBestaetigung, true);
  // Lager Ost hat keine Inventur → keine Warnung
  assert.strictEqual(p('buchen', { art: 'Bruch', standort: 'Lager Ost', flaschen: 5000, datum: heuteText() }).ok, true);
});

test('anfrageId: gleiche ID → nicht doppelt geschrieben, vorherige Antwort zurück; Warnung wird nicht gemerkt', () => {
  const { w, p } = welt();
  const daten = { art: 'Bruch', standort: 'Lager Süd', flaschen: 3, datum: heuteText(), anfrageId: 'abc-12345678' };
  const a = p('buchen', daten);
  const b = p('buchen', daten);
  assert.strictEqual(b.ok, true);
  assert.strictEqual(b.id, a.id);
  assert.strictEqual(b.wiederholt, true);
  assert.ok(b.uebersicht, 'frische Übersicht auch bei Wiederholung');
  assert.strictEqual(w.schreibLog.filter((x) => x.tab === 'Lager-Log').length, 1);
  assert.deepStrictEqual(w.cacheZeiten, [600]);
  // andere ID → neue Zeile
  assert.notStrictEqual(p('buchen', Object.assign({}, daten, { anfrageId: 'abc-87654321' })).id, a.id);
  // ungültige anfrageId
  assert.deepStrictEqual(p('buchen', Object.assign({}, daten, { anfrageId: 'x' })), { ok: false, fehler: 'Ungültige Anfrage' });
  // Warnung, dann bestätigt mit derselben anfrageId → wird geschrieben
  const n = { art: 'Promo', standort: 'Lager Nord', flaschen: 900, datum: heuteText(), anfrageId: 'neg-12345678' };
  assert.strictEqual(p('buchen', n).brauchtBestaetigung, true);
  const c = p('buchen', Object.assign({ bestaetigt: true }, n));
  assert.strictEqual(c.ok, true);
  assert.ok(!c.wiederholt);
  // Code und Cache-Schlüssel: kein Klartext der anfrageId im Schlüssel
  assert.ok(Object.keys(w.cache).every((s) => /^anfrage:[0-9a-f]{64}$/.test(s)));
});

test('Sperre belegt: verständlicher Fehler, nichts geschrieben', () => {
  const { w, p } = welt();
  w.sperreBelegt = true;
  assert.deepStrictEqual(p('buchen', { art: 'Bruch', standort: 'Lager Süd', flaschen: 1, datum: heuteText() }),
    { ok: false, fehler: 'Gerade trägt jemand anderes ein, bitte gleich nochmal versuchen' });
  assert.deepStrictEqual(w.sheetSchreiben, []);
});

test('Fehler beim Tab Lager bzw. Abfüllungen: Buchung bleibt, Hinweis zurück', () => {
  const { w, p } = welt();
  w.schreibenKaputt['Lager'] = true;
  w.schreibenKaputt['Abfüllungen'] = true;
  const a = p('buchen', { art: 'Abfüllung', flaschen: 100, datum: heuteText() });
  assert.strictEqual(a.ok, true);
  assert.deepStrictEqual(a.hinweise, ['Im Lager-Log eingetragen, aber die Zeile im Tab Abfüllungen fehlt. Bitte Mark Bescheid geben.',
    'Eingetragen. Der Tab Lager wurde nicht aktualisiert, das holt der tägliche Lauf nach.']);
  assert.strictEqual(w.tabs['Lager-Log'][4][2], 'Abfüllung');
  assert.strictEqual(w.tabs['Abfüllungen'].length, 2);
});

test('Lager-Log voll: Zeilen werden unten angefügt', () => {
  const { w, p } = welt();
  w.maxZeilen['Lager-Log'] = 4;
  assert.strictEqual(p('buchen', { art: 'Bruch', standort: 'Lager Süd', flaschen: 1, datum: heuteText() }).ok, true);
  assert.deepStrictEqual(w.eingefuegt, ['Lager-Log:4+1']);
});

test('stornieren: Storno-Zeile, nicht doppelt, kein Storno vom Storno, Abfüllung mit Gegenzeile', () => {
  const { w, p } = welt();
  const a = p('stornieren', { id: 'u1' });
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  const z = w.tabs['Lager-Log'][4];
  assert.ok(istDatum(z[0]) && D.berlin(z[0]) === heuteText());
  assert.deepStrictEqual(z.slice(1, 7), ['Lager Süd', 'Storno', '', '', 'Jonas', 'Storno: Umlagerung 50 Fl. Lager Süd → Lager Nord vom 02.11.2026']);
  assert.deepStrictEqual(z.slice(8), [a.id, 'u1']);
  assert.deepStrictEqual(a.uebersicht.lager.slice(0, 2).map((s) => s.bestand), [1988, 100 - 48], 'Umlagerung zählt nicht mehr');
  assert.deepStrictEqual(p('stornieren', { id: 'u1' }), { ok: false, fehler: 'Eintrag ist schon storniert' });
  assert.deepStrictEqual(p('stornieren', { id: a.id }), { ok: false, fehler: 'Ein Storno kann man nicht stornieren' });
  assert.deepStrictEqual(p('stornieren', { id: 'gibtsnicht' }), { ok: false, fehler: 'Eintrag nicht gefunden' });
  assert.deepStrictEqual(p('stornieren', {}), { ok: false, fehler: 'Eintrag nicht gefunden' });

  const ab = p('buchen', { art: 'Abfüllung', flaschen: 1200, datum: heuteText() });
  const s = p('stornieren', { id: ab.id });
  assert.deepStrictEqual(s.hinweise, ['Im Tab Abfüllungen als Gegenzeile „Storno 2. Abfüllung“ eingetragen.']);
  const g = w.tabs['Abfüllungen'][3];
  assert.deepStrictEqual([g[0], g[2], g[3]], ['Storno 2. Abfüllung', -1200, 'SATE-App, Storno von ID ' + ab.id + ', Jonas, ' + heuteText()]);
  assert.strictEqual(D.berlin(g[1]), D.berlin(w.tabs['Abfüllungen'][2][1]), 'gleicher Monat');
  // neue Abfüllung bekommt wieder die 2
  p('buchen', { art: 'Abfüllung', flaschen: 1100, datum: heuteText() });
  assert.strictEqual(w.tabs['Abfüllungen'][4][0], '2. Abfüllung');
  // Abfüllung ohne App-Zeile (von Hand im Log): Hinweis für Mark
  w.tabs['Lager-Log'].push([D.zelle(2026, 11, 1), 'Lager Süd', 'Abfüllung', 10, '', 'Mark', '', '', 'hand1', '']);
  assert.match(p('stornieren', { id: 'hand1' }).hinweise[0], /Mark muss sie dort von Hand korrigieren/);
});

test('verlauf: letzte Einträge neueste zuerst mit storniert/stornierbar, nichts geschrieben', () => {
  const { w, p } = welt();
  p('stornieren', { id: 'u1' });
  w.sheetSchreiben.length = 0;
  w.sheetLesen.length = 0;
  const v = p('verlauf');
  assert.strictEqual(v.ok, true);
  assert.deepStrictEqual(v.eintraege.map((x) => [x.id, x.art, x.storniert, x.stornierbar]),
    [[v.eintraege[0].id, 'Storno', false, false], ['u1', 'Umlagerung', true, false], ['i2', 'Inventur', false, true], ['i1', 'Inventur', false, true]]);
  assert.deepStrictEqual(w.sheetLesen, ['Lager-Log!alles']);
  assert.deepStrictEqual(w.sheetSchreiben, []);
});

test('verkaufStandort: nur Spalte L der Zeilen mit dieser Rechnung, zurück auf Standard, Liste in der Übersicht', () => {
  const { w, p } = welt();
  const vorher = JSON.stringify(w.tabs['Verkäufe'].map((z) => z.slice(0, 11)));
  const a = p('verkaufStandort', { rechnung: 'R-100', standort: 'Lager Ost' });
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.strictEqual(a.geaendert, 2);
  assert.deepStrictEqual(w.sheetSchreiben, ['Verkäufe!L3', 'Verkäufe!L4', 'Lager!B2:F5']);
  assert.deepStrictEqual(w.tabs['Verkäufe'].map((z) => z[11]), ['Standort', '', 'Lager Ost', 'Lager Ost', '', '']);
  assert.strictEqual(JSON.stringify(w.tabs['Verkäufe'].map((z) => z.slice(0, 11))), vorher, 'A–K unverändert');
  const r = a.uebersicht.verkaufListe.find((x) => x.rechnung === 'R-100');
  assert.deepStrictEqual(r, { rechnung: 'R-100', datum: tag(-5), kunde: 'Späti Zwei', kanal: 'Berlin', flaschen: 48,
    standort: 'Lager Ost', standortGesetzt: true, gemischt: false });
  assert.ok(!a.uebersicht.verkaufListe.some((x) => x.rechnung === 'R-101'), 'älter als 60 Tage');
  assert.strictEqual(a.uebersicht.lager[1].bestand, 150, 'Lager Nord ohne die Berliner Rechnung');

  const b = p('verkaufStandort', { rechnung: 'R-100', standort: '' });
  assert.deepStrictEqual(b.hinweise, ['Rechnung R-100 zählt wieder beim Standard-Standort.']);
  assert.deepStrictEqual(w.tabs['Verkäufe'].map((z) => z[11]), ['Standort', '', '', '', '', '']);
  assert.strictEqual(b.uebersicht.verkaufListe.find((x) => x.rechnung === 'R-100').standort, 'Lager Nord');

  w.sheetSchreiben.length = 0;
  assert.deepStrictEqual(p('verkaufStandort', { rechnung: 'R-999', standort: 'Lager Ost' }), { ok: false, fehler: 'Rechnung nicht gefunden' });
  assert.deepStrictEqual(p('verkaufStandort', { rechnung: 'R-100', standort: 'Mond' }), { ok: false, fehler: 'Standort unbekannt' });
  assert.deepStrictEqual(w.sheetSchreiben, []);
});

test('Spaltenkopf im Lager-Log verschoben: Serverfehler, nichts geschrieben', () => {
  const { w, p } = welt();
  w.tabs['Lager-Log'][0][2] = 'Typ';
  assert.deepStrictEqual(p('buchen', { art: 'Bruch', standort: 'Lager Süd', flaschen: 1, datum: heuteText() }),
    { ok: false, fehler: 'Serverfehler, bitte später nochmal versuchen' });
  assert.deepStrictEqual(w.sheetSchreiben, []);
  assert.strictEqual(w.freigaben, 1, 'Sperre auch bei Fehler frei');
});

// Codex-Befunde (2026-11-08) ------------------------------------------------------------------------------------

test('Codex: Storno und verkaufStandort warnen ebenfalls vor negativem Bestand', () => {
  const { w, p } = welt();
  const ab = p('buchen', { art: 'Abfüllung', flaschen: 1000, datum: heuteText() });
  assert.strictEqual(p('buchen', { art: 'Promo', standort: 'Lager Süd', flaschen: 2500, datum: heuteText() }).ok, true);
  const s = p('stornieren', { id: ab.id });
  assert.strictEqual(s.brauchtBestaetigung, true);
  assert.match(s.warnung, /Lager Süd -562 Flaschen/);
  const zeilen = w.tabs['Lager-Log'].length;
  assert.strictEqual(p('stornieren', { id: ab.id, bestaetigt: true }).ok, true);
  assert.strictEqual(w.tabs['Lager-Log'].length, zeilen + 1);

  assert.strictEqual(p('buchen', { art: 'Promo', standort: 'Lager Nord', flaschen: 100, datum: heuteText() }).ok, true);
  const v = p('verkaufStandort', { rechnung: 'R-102', standort: 'Lager Nord' });
  assert.strictEqual(v.brauchtBestaetigung, true);
  assert.match(v.warnung, /Lager Nord -10 Flaschen/);
  assert.strictEqual(w.tabs['Verkäufe'][5][11], '', 'nichts geschrieben');
  assert.strictEqual(p('verkaufStandort', { rechnung: 'R-102', standort: 'Lager Nord', bestaetigt: true }).ok, true);
  assert.strictEqual(w.tabs['Verkäufe'][5][11], 'Lager Nord');
});

test('Codex: Storno prüft den Spaltenkopf vor dem Schreiben', () => {
  const { w, p } = welt();
  w.tabs['Lager-Log'][0][9] = 'Bezug';
  assert.deepStrictEqual(p('stornieren', { id: 'u1' }), { ok: false, fehler: 'Serverfehler, bitte später nochmal versuchen' });
  assert.deepStrictEqual(w.sheetSchreiben, []);
});

test('Codex: Formate vor den Werten, belegte Zielzeile (auch Formel mit "") wird nicht überschrieben', () => {
  const { w, p } = welt();
  const daten = { art: 'Bruch', standort: 'Lager Süd', flaschen: 1, datum: heuteText() };
  w.formatKaputt['Lager-Log'] = true;
  assert.deepStrictEqual(p('buchen', daten), { ok: false, fehler: 'Serverfehler, bitte später nochmal versuchen' });
  assert.deepStrictEqual(w.sheetSchreiben, [], 'Format gescheitert → keine Zeile');
  delete w.formatKaputt['Lager-Log'];
  w.formelZellen['Lager-Log!C5'] = '=IF(1;"";"")';
  assert.deepStrictEqual(p('buchen', daten), { ok: false, fehler: 'Serverfehler, bitte später nochmal versuchen' });
  assert.deepStrictEqual(w.sheetSchreiben, []);
  delete w.formelZellen['Lager-Log!C5'];
  assert.strictEqual(p('buchen', daten).ok, true);
  assert.deepStrictEqual(w.sheetSchreiben, ['Lager-Log!A5:J5', 'Lager!B2:F5']);
});
