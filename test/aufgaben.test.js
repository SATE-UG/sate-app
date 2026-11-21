'use strict';

// Aufgaben fürs Team: Tab Aufgaben lesen (Feld `aufgaben` der Übersicht), Aktionen aufgabeAnlegen und aufgabeAendern,
// Einrichten mit aufgabenTabAnlegen(). Rein und über doPost mit Google-Attrappen. Alle Namen und Texte frei erfunden.

const test = require('node:test');
const assert = require('node:assert');
const { lade, ladeAlles, roh } = require('./lade');
const { neueWelt } = require('./google');
const D = require('./daten');

const k = lade();
const HEUTE = '2026-11-21';
const TEAM = ['Jonas', 'Nina'];
const KOPF_HINWEIS = 'Tab Aufgaben: Kopfzeile passt nicht, die Aufgaben fehlen in der App.';
const FEHLT = { ok: false, fehler: 'Diese Aufgabe gibt es nicht mehr.' };

const istDatum = (x) => Object.prototype.toString.call(x) === '[object Date]';
const lesen = (zeilen, hinweise) => roh(k.aufgabenLesen(zeilen, TEAM, D.berlin, hinweise || [], HEUTE));

// Rein --------------------------------------------------------------------------------------------------------

test('teamNamen: nur nicht gesperrte Zugangscodes, nach Name sortiert', () => {
  const eintraege = k.eintraegeLesen({
    'CODE:Nina': JSON.stringify({ hash: 'b' }), 'CODE:Olaf': JSON.stringify({ hash: 'c', gesperrt: true }),
    'CODE:Jonas': JSON.stringify({ hash: 'a', gesperrt: false }), CODE_SALZ: 'x',
  });
  assert.deepStrictEqual(roh(k.teamNamen(eintraege)), ['Jonas', 'Nina']);
  assert.deepStrictEqual(roh(k.teamNamen([])), []);
  assert.deepStrictEqual(roh(k.teamNamen(undefined)), []);
});

test('aufgabenLesen: Tab fehlt → null ohne Hinweis, Kopfzeile passt nicht → null mit Hinweis', () => {
  const h = [];
  assert.strictEqual(k.aufgabenLesen(null, TEAM, D.berlin, h, HEUTE), null);
  assert.strictEqual(k.aufgabenLesen(undefined, TEAM, D.berlin, h, HEUTE), null);
  assert.deepStrictEqual(h, []);
  // jede der zwölf Spalten zählt
  for (let i = 0; i < 12; i++) {
    const kopf = D.aufgabenKopf();
    kopf[i] = 'Anders';
    const hh = [];
    assert.strictEqual(k.aufgabenLesen([kopf, D.aufgabenZeile({ id: 'A1', titel: 'Bleibt unsichtbar' })], TEAM, D.berlin, hh, HEUTE), null, 'Spalte ' + i);
    assert.deepStrictEqual(hh, [KOPF_HINWEIS]);
  }
  for (const leer of [[], [[]], [['']], [D.aufgabenKopf().slice(0, 11)]]) {
    const hh = [];
    assert.strictEqual(k.aufgabenLesen(leer, TEAM, D.berlin, hh, HEUTE), null);
    assert.deepStrictEqual(hh, [KOPF_HINWEIS]);
  }
  // nur Kopf (Leerzeichen drumherum und Spalten dahinter stören nicht): leere Liste
  const kopf = D.aufgabenKopf().map((t) => ' ' + t + ' ').concat(['Eigene Spalte']);
  assert.deepStrictEqual(lesen([kopf], h), { team: TEAM, liste: [], fehler: 0 });
  assert.deepStrictEqual(h, []);
});

test('aufgabenLesen: Reihenfolge wie im Tab, entfernte und alte erledigte fehlen, unlesbare Zeilen zählen', () => {
  const zeilen = [D.aufgabenKopf(),
    D.aufgabenZeile({ id: 'A1', erstellt: '2026-11-18', von: 'Nina', fuer: 'Jonas', titel: 'Leergut zurückbringen', faellig: '2026-11-23',
      uhrzeit: '09:30', notiz: 'Kasten steht im Flur' }),
    D.aufgabenZeile({ id: 'A2', von: 'Jonas', fuer: 'Nina', titel: 'Plakate abholen', status: 'entfernt' }),
    // erledigt vor genau 30 Tagen: noch da; vor 31 Tagen: fehlt
    D.aufgabenZeile({ id: 'A3', erstellt: '2026-10-01', von: 'Jonas', fuer: 'Nina', titel: 'Kasse zählen', status: 'erledigt',
      erledigtAm: '2026-10-22', erledigtVon: 'Nina' }),
    D.aufgabenZeile({ id: 'A4', von: 'Jonas', fuer: 'Nina', titel: 'Banner aufhängen', status: 'erledigt', erledigtAm: '2026-10-21', erledigtVon: 'Nina' }),
    ['', '', '', '', '', '', '', '', '', '', '', ''],
    [' ', null],
    D.aufgabenZeile({ id: '', titel: 'Ohne ID' }),
    D.aufgabenZeile({ id: 'A5', titel: '' }),
    D.aufgabenZeile({ id: 'A6', titel: 'Status unbekannt', status: 'vielleicht' }),
    D.aufgabenZeile({ id: 'A7', titel: 'Status leer', status: '' }),
    D.aufgabenZeile({ id: 'A1', titel: 'ID steht oben schon' }),
    D.aufgabenZeile({ id: 'A8', von: 'Nina', fuer: 'Nina', titel: 'Erledigt ohne Datum', status: 'erledigt', erledigtVon: 'Jonas' }),
    // Codex 2026-11-21: je ID zählt nur die oberste Zeile, auch wenn sie unlesbar oder entfernt ist (wie beim Ändern)
    D.aufgabenZeile({ id: 'A5', titel: 'Oben steht A5 ohne Text' }),
    D.aufgabenZeile({ id: 'A2', titel: 'Oben steht A2 als entfernt' }),
  ];
  const a = lesen(zeilen);
  assert.deepStrictEqual(a.team, TEAM);
  assert.strictEqual(a.fehler, 7, 'ohne ID, ohne Text, Status unbekannt, Status leer, drei doppelte IDs');
  assert.deepStrictEqual(a.liste, [
    { id: 'A1', titel: 'Leergut zurückbringen', fuer: 'Jonas', von: 'Nina', faellig: '2026-11-23', uhrzeit: '09:30', notiz: 'Kasten steht im Flur',
      status: 'offen', erstellt: '2026-11-18', erledigtAm: '', erledigtVon: '' },
    { id: 'A3', titel: 'Kasse zählen', fuer: 'Nina', von: 'Jonas', faellig: '', uhrzeit: '', notiz: '', status: 'erledigt', erstellt: '2026-10-01',
      erledigtAm: '2026-10-22', erledigtVon: 'Nina' },
    { id: 'A8', titel: 'Erledigt ohne Datum', fuer: 'Nina', von: 'Nina', faellig: '', uhrzeit: '', notiz: '', status: 'erledigt', erstellt: '',
      erledigtAm: '', erledigtVon: 'Jonas' },
  ]);
  // alles Texte, Status nur offen oder erledigt
  for (const x of a.liste) {
    assert.ok(Object.keys(x).every((f) => typeof x[f] === 'string'), JSON.stringify(x));
    assert.ok(['offen', 'erledigt'].includes(x.status));
  }
  // das Team ist eine Kopie
  const team = ['Jonas'];
  assert.notStrictEqual(k.aufgabenLesen(zeilen, team, D.berlin, [], HEUTE).team, team);
});

test('aufgabenLesen: von Hand eingetragene Zeilen (Datum als Text, Uhrzeit ohne Null, Zahl, Status groß geschrieben)', () => {
  const zeilen = [D.aufgabenKopf(),
    [7, '18.11.2026', ' Nina ', 'Jonas', 4711, '23.11.2026', '9:30', 'Zeile eins\nZeile zwei', ' Erledigt ', '20.11.2026 14:05', 'Jonas', ''],
    // Uhrzeit ohne Fälligkeit, unlesbare Uhrzeit, unlesbare Fälligkeit: die Aufgabe bleibt, das Feld ist leer
    D.aufgabenZeile({ id: 'B1', titel: 'Uhrzeit ohne Datum', uhrzeit: '10:00' }),
    D.aufgabenZeile({ id: 'B2', titel: 'Uhrzeit unlesbar', faellig: '2026-12-01', uhrzeit: 'abends' }),
    ['B3', '', '', '', 'Datum unlesbar', 'bald', '10:00', '', 'offen', '', '', ''],
    // offen mit Resten in „Erledigt am/von“: zählen nicht
    D.aufgabenZeile({ id: 'B4', titel: 'Wieder offen', status: 'offen', erledigtAm: '2026-11-01', erledigtVon: 'Nina' }),
  ];
  const a = lesen(zeilen);
  assert.strictEqual(a.fehler, 0);
  assert.deepStrictEqual(a.liste[0], { id: '7', titel: '4711', fuer: 'Jonas', von: 'Nina', faellig: '2026-11-23', uhrzeit: '09:30',
    notiz: 'Zeile eins\nZeile zwei', status: 'erledigt', erstellt: '2026-11-18', erledigtAm: '2026-11-20', erledigtVon: 'Jonas' });
  assert.deepStrictEqual(a.liste.slice(1).map((x) => [x.id, x.faellig, x.uhrzeit, x.erledigtAm, x.erledigtVon]),
    [['B1', '', '', '', ''], ['B2', '2026-12-01', '', '', ''], ['B3', '', '', '', ''], ['B4', '', '', '', '']]);
});

test('uhrzeitLesen: HH:MM als Text, auch 9:30, mit Sekunden oder Hochkomma; alles andere leer', () => {
  for (const [ein, aus] of [['09:30', '09:30'], ['9:30', '09:30'], ['09:30:00', '09:30'], ["'09:30", '09:30'], [' 23:59 ', '23:59'], ['00:00', '00:00']]) {
    assert.strictEqual(k.uhrzeitLesen(ein), aus, ein);
  }
  for (const w of ['24:00', '12:60', 'abends', '', '930', 0.5, 930, new Date(), null, undefined, true]) assert.strictEqual(k.uhrzeitLesen(w), '', String(w));
});

test('aufgabePruefen: Titel, Für, Fällig, Uhrzeit, Notiz', () => {
  const gut = { titel: 'Kühlschrank auffüllen', fuer: 'Nina' };
  const p = (x) => roh(k.aufgabePruefen(Object.assign({}, gut, x), TEAM, HEUTE));
  assert.deepStrictEqual(p({}), { aufgabe: { titel: 'Kühlschrank auffüllen', fuer: 'Nina', faellig: '', uhrzeit: '', notiz: '' } });
  // Titel: getrimmt, Steuerzeichen und Zeilenumbrüche → Leerzeichen, 1 bis 140 Zeichen
  assert.strictEqual(p({ titel: '  Getränke\n\tkalt' + String.fromCharCode(0) + 'stellen  ' }).aufgabe.titel, 'Getränke kalt stellen');
  assert.strictEqual(p({ titel: 'x'.repeat(140) }).aufgabe.titel.length, 140);
  assert.strictEqual(p({ titel: '🍹'.repeat(140) }).aufgabe.titel.length, 280, 'Emoji zählt als ein Zeichen');
  for (const t of ['', '   ', '\n\t', undefined, null, 5, { a: 1 }, ['x'], 'x'.repeat(141)]) {
    assert.deepStrictEqual(p({ titel: t }), { fehler: 'Aufgabe: bitte einen Text mit 1 bis 140 Zeichen' }, JSON.stringify(t));
  }
  // Für: genau ein Name aus dem Team
  assert.strictEqual(p({ fuer: ' Jonas ' }).aufgabe.fuer, 'Jonas');
  for (const f of ['', 'Olaf', 'nina', 'Jonas, Nina', undefined, null, 3, ['Nina']]) {
    assert.deepStrictEqual(p({ fuer: f }), { fehler: 'Für: bitte eine Person aus dem Team wählen' }, JSON.stringify(f));
  }
  assert.deepStrictEqual(roh(k.aufgabePruefen(gut, [], HEUTE)), { fehler: 'Für: bitte eine Person aus dem Team wählen' }, 'leeres Team');
  // Fällig: leer oder echter Kalendertag, Jahr von heute − 1 bis heute + 5
  for (const d of ['', '  ', null, undefined]) assert.strictEqual(p({ faellig: d }).aufgabe.faellig, '', JSON.stringify(d));
  for (const d of ['2026-11-21', ' 2026-11-22 ', '2025-01-01', '2031-12-31', '2028-02-29']) assert.strictEqual(p({ faellig: d }).aufgabe.faellig, d.trim(), d);
  for (const d of ['2026-02-30', '21.11.2026', '2026-11-5', '2027-02-29', 'morgen', 20261121, true, {}]) {
    assert.deepStrictEqual(p({ faellig: d }), { fehler: 'Fällig: Datum ungültig' }, JSON.stringify(d));
  }
  for (const d of ['2024-12-31', '2032-01-01', '1999-05-05']) {
    assert.deepStrictEqual(p({ faellig: d }), { fehler: 'Fällig: bitte ein Datum in den Jahren 2025 bis 2031' }, d);
  }
  // Uhrzeit: leer oder HH:MM von 00:00 bis 23:59, nur zusammen mit Fällig
  for (const u of ['00:00', '09:30', '23:59', ' 18:05 ']) assert.strictEqual(p({ faellig: HEUTE, uhrzeit: u }).aufgabe.uhrzeit, u.trim(), u);
  for (const u of ['', null, undefined]) assert.strictEqual(p({ faellig: HEUTE, uhrzeit: u }).aufgabe.uhrzeit, '', JSON.stringify(u));
  for (const u of ['24:00', '9:30', '09:60', '0930', '09:30:00', 'abends', 930, true]) {
    assert.deepStrictEqual(p({ faellig: HEUTE, uhrzeit: u }), { fehler: 'Uhrzeit: bitte als HH:MM von 00:00 bis 23:59' }, JSON.stringify(u));
  }
  for (const d of [undefined, '', null]) {
    assert.deepStrictEqual(p({ faellig: d, uhrzeit: '09:30' }), { fehler: 'Eine Uhrzeit geht nur zusammen mit einem Fälligkeitsdatum' }, JSON.stringify(d));
  }
  // Notiz: 0 bis 500 Zeichen, Zeilenumbrüche bleiben
  assert.strictEqual(p({ notiz: '  Zeile eins \r\n\tZeile  zwei\n\n\n\nZeile drei\n ' }).aufgabe.notiz, 'Zeile eins\nZeile zwei\n\nZeile drei');
  assert.strictEqual(p({ notiz: 'x'.repeat(500) }).aufgabe.notiz.length, 500);
  assert.strictEqual(p({ notiz: '🍹'.repeat(500) }).aufgabe.notiz.length, 1000, 'Emoji zählt als ein Zeichen');
  for (const n of ['x'.repeat(501), { a: 1 }, 5, ['x']]) {
    assert.deepStrictEqual(p({ notiz: n }), { fehler: 'Notiz zu lang (höchstens 500 Zeichen)' }, JSON.stringify(n).slice(0, 20));
  }
});

test('aufgabeAenderungPruefen: nur was sich ändert, bisherige Werte werden nicht neu geprüft', () => {
  const alt = { id: 'A1', titel: 'Alt', fuer: 'Olaf', von: 'Nina', faellig: '2019-03-01', uhrzeit: '08:00', notiz: 'Notiz', status: 'offen',
    erstellt: '2019-02-01', erledigtAm: '', erledigtVon: '' };
  const p = (d) => roh(k.aufgabeAenderungPruefen(d, alt, TEAM, HEUTE));
  assert.deepStrictEqual(p({ id: 'A1' }), { fehler: 'Keine Änderung angegeben' });
  assert.deepStrictEqual(p({ id: 'A1', anfrageId: 'abc-12345678' }), { fehler: 'Keine Änderung angegeben' });
  // Formular schickt alles zurück: gesperrte Person und alte Fälligkeit bleiben, nur der Titel ändert sich
  assert.deepStrictEqual(p({ titel: 'Neu', fuer: 'Olaf', faellig: '2019-03-01', uhrzeit: '08:00', notiz: 'Notiz', status: 'offen' }), { neu: { titel: 'Neu' } });
  assert.deepStrictEqual(p({ titel: ' Alt ' }), { neu: {} });
  // Codex 2026-11-21: auch ein von Hand eingetragener, zu langer Text oder eine zu lange Notiz bleibt, wenn sie niemand anfasst
  const lang = Object.assign({}, alt, { titel: 'x'.repeat(141), notiz: 'y'.repeat(501), fuer: '' });
  assert.deepStrictEqual(roh(k.aufgabeAenderungPruefen({ titel: 'x'.repeat(141), notiz: 'y'.repeat(501), fuer: '', status: 'erledigt' }, lang, TEAM, HEUTE)),
    { neu: { status: 'erledigt' } });
  assert.deepStrictEqual(roh(k.aufgabeAenderungPruefen({ titel: 'x'.repeat(142) }, lang, TEAM, HEUTE)), { fehler: 'Aufgabe: bitte einen Text mit 1 bis 140 Zeichen' });
  assert.deepStrictEqual(roh(k.aufgabeAenderungPruefen({ notiz: 'y'.repeat(502) }, lang, TEAM, HEUTE)), { fehler: 'Notiz zu lang (höchstens 500 Zeichen)' });
  // wer sie anfasst, muss gültige Werte schicken
  assert.deepStrictEqual(p({ fuer: 'Unbekannt' }), { fehler: 'Für: bitte eine Person aus dem Team wählen' });
  assert.deepStrictEqual(p({ fuer: '' }), { fehler: 'Für: bitte eine Person aus dem Team wählen' });
  assert.deepStrictEqual(p({ fuer: null }), { fehler: 'Für: bitte eine Person aus dem Team wählen' });
  assert.deepStrictEqual(p({ fuer: 'Nina' }), { neu: { fuer: 'Nina' } });
  assert.deepStrictEqual(p({ faellig: '2019-03-02' }), { fehler: 'Fällig: bitte ein Datum in den Jahren 2025 bis 2031' });
  assert.deepStrictEqual(p({ faellig: '2026-12-01' }), { neu: { faellig: '2026-12-01' } });
  // Fälligkeit leeren (leer oder null) nimmt die Uhrzeit mit
  assert.deepStrictEqual(p({ faellig: '' }), { neu: { faellig: '', uhrzeit: '' } });
  assert.deepStrictEqual(p({ faellig: null }), { neu: { faellig: '', uhrzeit: '' } });
  assert.deepStrictEqual(p({ faellig: '', uhrzeit: '09:00' }), { fehler: 'Eine Uhrzeit geht nur zusammen mit einem Fälligkeitsdatum' });
  assert.deepStrictEqual(p({ uhrzeit: '' }), { neu: { uhrzeit: '' } });
  assert.deepStrictEqual(p({ uhrzeit: '09:00' }), { neu: { uhrzeit: '09:00' } }, 'die Fälligkeit steht in der Zeile');
  assert.deepStrictEqual(p({ uhrzeit: '9 Uhr' }), { fehler: 'Uhrzeit: bitte als HH:MM von 00:00 bis 23:59' });
  assert.deepStrictEqual(p({ notiz: null }), { neu: { notiz: '' } });
  assert.deepStrictEqual(p({ titel: null }), { fehler: 'Aufgabe: bitte einen Text mit 1 bis 140 Zeichen' });
  for (const s of ['fertig', 'Erledigt', '', null, 5]) assert.deepStrictEqual(p({ status: s }), { fehler: 'Status unbekannt' }, JSON.stringify(s));
  assert.deepStrictEqual(p({ status: 'erledigt' }), { neu: { status: 'erledigt' } });
  // ohne Fälligkeit in der Zeile braucht die Uhrzeit eine in der Anfrage
  const ohne = Object.assign({}, alt, { faellig: '', uhrzeit: '' });
  const q = (d) => roh(k.aufgabeAenderungPruefen(d, ohne, TEAM, HEUTE));
  assert.deepStrictEqual(q({ uhrzeit: '09:00' }), { fehler: 'Eine Uhrzeit geht nur zusammen mit einem Fälligkeitsdatum' });
  assert.deepStrictEqual(q({ uhrzeit: '09:00', faellig: '2026-12-01' }), { neu: { faellig: '2026-12-01', uhrzeit: '09:00' } });
  assert.deepStrictEqual(q({ uhrzeit: '', faellig: '' }), { neu: {} });
});

test('Zellen: textGenau setzt vor jeden Text ein Hochkomma (keine Formel, nichts umgedeutet), Stücke nebeneinander', () => {
  for (const t of ['=1+1', '+49', '-1', '@x', '12 Kisten', "'s Leergut", 'Leergut', 'WAHR', 'Mai 2027', '€5', ' ']) assert.strictEqual(k.textGenau(t), "'" + t, t);
  for (const t of ['', null, undefined]) assert.strictEqual(k.textGenau(t), '');
  const d = new Date();
  assert.deepStrictEqual(roh(k.zellenGenau(['=1', '', 'ok', 5])), ["'=1", '', "'ok", 5]);
  assert.strictEqual(k.zellenGenau([d])[0], d);
  const u = undefined;
  assert.deepStrictEqual(roh(k.zellenStuecke([u, u, u, 'a', 'b', u, u, u, 'c', u, u, 'd'])),
    [{ spalte: 4, werte: ['a', 'b'] }, { spalte: 9, werte: ['c'] }, { spalte: 12, werte: ['d'] }]);
  assert.deepStrictEqual(roh(k.zellenStuecke([u, u])), []);
  // erledigt: Status, Erledigt am, Erledigt von und Geändert liegen nebeneinander (ein Schreibvorgang)
  const jetzt = new Date('2026-11-21T10:00:00Z');
  const z = k.aufgabeZellen({ status: 'erledigt' }, 'Nina', HEUTE, jetzt, (t) => 'Datum ' + t);
  assert.strictEqual(z.length, 12);
  assert.deepStrictEqual(roh(k.zellenStuecke(z)), [{ spalte: 9, werte: ['erledigt', 'Datum 2026-11-21', 'Nina', jetzt.toISOString()] }]);
  assert.deepStrictEqual(roh(k.zellenGenau(k.zellenStuecke(z)[0].werte)), ["'erledigt", "'Datum 2026-11-21", "'Nina", jetzt.toISOString()]);
  assert.deepStrictEqual(roh(k.zellenStuecke(k.aufgabeZellen({ status: 'offen' }, 'Nina', HEUTE, jetzt, String))),
    [{ spalte: 9, werte: ['offen', '', '', jetzt.toISOString()] }]);
  assert.deepStrictEqual(roh(k.zellenStuecke(k.aufgabeZellen({ faellig: '' }, 'Nina', HEUTE, jetzt, String))),
    [{ spalte: 6, werte: ['', ''] }, { spalte: 12, werte: [jetzt.toISOString()] }]);
});

// Über doPost mit Google-Attrappen -------------------------------------------------------------------------------

/** Tag relativ zu heute (Berlin) als Text. */
const heuteText = () => D.berlin(new Date());
const tag = (n) => k.tagePlus(heuteText(), n);
const jahr = () => Number(heuteText().slice(0, 4));

function post(kk, body) {
  const aus = kk.doPost({ postData: { contents: JSON.stringify(body), type: 'text/plain' } });
  return JSON.parse(aus.text);
}

/** Verkäufe-Zeile mit Rechnungsnummer `re` und Rechnungsdatum `t` (Text). */
function vz(t, kanal, kunde, flaschen, re) {
  const z = D.rechnungszeile(Number(t.slice(0, 4)), Number(t.slice(5, 7)), Number(t.slice(8, 10)), kanal, kunde, flaschen, flaschen);
  z[9] = re;
  return z;
}

const codeAusLog = (w) => /: ([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})/.exec(w.logs[w.logs.length - 1])[1];

/**
 * Welt mit allen Tabs (erfundene Werte), dem Tab Aufgaben (A1 offen, A2 erledigt) und drei Zugangscodes: Jonas und Nina
 * sind das Team, Olaf ist gesperrt. `p` schickt als Jonas, `pNina` als Nina. `ohneAufgaben`: Tab Aufgaben fehlt.
 */
function welt(ohneAufgaben) {
  const { welt: w, globals } = neueWelt();
  const kk = ladeAlles(globals);
  w.tabs['Verkäufe'] = [D.verkaufKopf(),
    D.altzeile(2026, 8, 'Karlsruhe', 'Bar Eins', 300, 360),
    vz(tag(-5), 'Berlin', 'Späti Zwei', 24, 'R-100'),
    vz(tag(-2), 'Karlsruhe', 'Bar Drei', 12, 'R-102')];
  w.tabs['Lager-Log'] = [D.lagerKopf(),
    [D.zelle(2026, 10, 31), 'Lager Süd', 'Inventur', 2000, '', 'Jonas', '', '', 'i1', ''],
    [D.zelle(2026, 10, 31), 'Lager Nord', 'Inventur', 100, '', 'Nina', '', '', 'i2', '']];
  w.tabs['App-Einstellungen'] = D.einstellungen();
  w.tabs['Abfüllungen'] = [['Abfüllung', 'Monat', 'Flaschen', 'Quelle'], ['1. Abfüllung', D.serie(2026, 7, 1), 3000, 'Altliste']];
  w.tabs['Lager'] = [['Standort', 'Bestand (Flaschen)', 'Kisten', 'Letzte Inventur', 'Schwund', 'Stand'],
    ['Lager Süd'], ['Lager Nord'], ['Lager Ost'], ['Summe']];
  if (!ohneAufgaben) {
    w.tabs['Aufgaben'] = [D.aufgabenKopf(),
      D.aufgabenZeile({ id: 'A1', erstellt: tag(-3), von: 'Nina', fuer: 'Jonas', titel: 'Leergut zurückbringen', faellig: tag(2), uhrzeit: '09:30',
        notiz: 'Kasten steht im Flur' }),
      D.aufgabenZeile({ id: 'A2', erstellt: tag(-10), von: 'Jonas', fuer: 'Nina', titel: 'Plakate abholen', status: 'erledigt', erledigtAm: tag(-1),
        erledigtVon: 'Nina' }),
      // Zeilen mit nur Auswahllisten liefert getValues() als leere Zeilen
      ['', '', '', '', '', '', '', '', '', '', '', '']];
  }
  kk.codeAnlegen('Olaf');
  const codeOlaf = codeAusLog(w);
  kk.codeSperren('Olaf');
  kk.codeAnlegen('Nina');
  const codeNina = codeAusLog(w);
  kk.codeAnlegen('Jonas');
  const code = codeAusLog(w);
  w.sheetLesen.length = 0;
  w.sperren.length = 0; // codeAnlegen sperrt auch
  w.freigaben = 0;
  const p = (aktion, daten) => post(kk, Object.assign({ code: code, aktion: aktion }, daten || {}));
  const pNina = (aktion, daten) => post(kk, Object.assign({ code: codeNina, aktion: aktion }, daten || {}));
  return { w, kk, p, pNina, code, codeOlaf };
}

const A1 = () => ({ id: 'A1', titel: 'Leergut zurückbringen', fuer: 'Jonas', von: 'Nina', faellig: tag(2), uhrzeit: '09:30',
  notiz: 'Kasten steht im Flur', status: 'offen', erstellt: tag(-3), erledigtAm: '', erledigtVon: '' });
const A2 = () => ({ id: 'A2', titel: 'Plakate abholen', fuer: 'Nina', von: 'Jonas', faellig: '', uhrzeit: '', notiz: '', status: 'erledigt',
  erstellt: tag(-10), erledigtAm: tag(-1), erledigtVon: 'Nina' });
const nurAufgaben = (liste) => liste.every((x) => /^Aufgaben!/.test(x));

test('uebersicht: Feld aufgaben mit Team (ohne Gesperrte) und Liste, Tab einmal gelesen, nichts geschrieben', () => {
  const { w, p } = welt();
  const u = p('uebersicht');
  assert.strictEqual(u.ok, true, JSON.stringify(u));
  assert.deepStrictEqual(u.aufgaben, { team: ['Jonas', 'Nina'], liste: [A1(), A2()], fehler: 0 });
  assert.deepStrictEqual(w.sheetLesen.filter((x) => /^Aufgaben/.test(x)), ['Aufgaben!alles']);
  assert.deepStrictEqual(w.sheetSchreiben, []);
  assert.ok(!u.hinweise.some((h) => /Aufgaben/.test(h)));
  // entfernte und lange erledigte fehlen, unlesbare zählen
  w.tabs['Aufgaben'].push(
    D.aufgabenZeile({ id: 'A3', von: 'Jonas', fuer: 'Nina', titel: 'Entfernt', status: 'entfernt' }),
    D.aufgabenZeile({ id: 'A4', von: 'Jonas', fuer: 'Nina', titel: 'Lange erledigt', status: 'erledigt', erledigtAm: tag(-31), erledigtVon: 'Nina' }),
    D.aufgabenZeile({ id: 'A5', von: 'Jonas', fuer: 'Nina', titel: 'Vor 30 Tagen erledigt', status: 'erledigt', erledigtAm: tag(-30), erledigtVon: 'Nina' }),
    D.aufgabenZeile({ id: '', titel: 'Ohne ID' }), D.aufgabenZeile({ id: 'A6', titel: 'Kaputt', status: 'irgendwas' }));
  const v = p('uebersicht').aufgaben;
  assert.deepStrictEqual(v.liste.map((x) => x.id), ['A1', 'A2', 'A5']);
  assert.strictEqual(v.fehler, 2);
});

test('uebersicht ohne Tab Aufgaben: aufgaben null, alles andere wie vorher; falsche Kopfzeile: null mit Hinweis', () => {
  const { w, p } = welt();
  const mit = p('uebersicht');
  const tab = w.tabs['Aufgaben'];
  delete w.tabs['Aufgaben'];
  w.sheetLesen.length = 0;
  const ohne = p('uebersicht');
  assert.strictEqual(ohne.ok, true, JSON.stringify(ohne));
  assert.strictEqual(ohne.aufgaben, null);
  assert.ok(!w.sheetLesen.some((x) => /Aufgaben/.test(x)));
  const rest = (u) => { const x = Object.assign({}, u); delete x.aufgaben; delete x.stand; return x; };
  assert.deepStrictEqual(rest(ohne), rest(mit));
  // Kopfzeile passt nicht (Spalte umbenannt)
  tab[0][3] = 'Fuer';
  w.tabs['Aufgaben'] = tab;
  const falsch = p('uebersicht');
  assert.strictEqual(falsch.ok, true);
  assert.strictEqual(falsch.aufgaben, null);
  assert.deepStrictEqual(falsch.hinweise.filter((h) => h === KOPF_HINWEIS), [KOPF_HINWEIS]);
  assert.deepStrictEqual(falsch.hinweise.filter((h) => h !== KOPF_HINWEIS), mit.hinweise);
  assert.deepStrictEqual(rest(Object.assign({}, falsch, { hinweise: mit.hinweise })), rest(mit));
});

test('aufgabeAnlegen: eine Zeile A–L unten, Datum als Datum, Uhrzeit als Text, Von aus dem Code, frische Liste', () => {
  const { w, p } = welt();
  const a = p('aufgabeAnlegen', { titel: '  Getränke\nkalt stellen ', fuer: ' Nina ', faellig: tag(1), uhrzeit: '18:00', notiz: 'Zeile eins\r\nZeile zwei' });
  const ereignisse = w.ereignisse.slice();
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.deepStrictEqual(Object.keys(a).sort(), ['aufgaben', 'benachrichtigt', 'id', 'name', 'ok']);
  assert.strictEqual(a.benachrichtigt, 0, 'Mitteilungen sind nicht eingerichtet (siehe test/push.test.js)');
  assert.strictEqual(a.name, 'Jonas');
  assert.match(a.id, /^A[0-9A-Z]+-[0-9A-Z]{4}$/);
  assert.doesNotMatch(a.id, /^AA-/);
  // nach der letzten Zeile mit Inhalt (die leere Zeile 4 zählt nicht), nur der Tab Aufgaben wird gelesen und beschrieben
  assert.deepStrictEqual(w.sheetSchreiben, ['Aufgaben!A4:L4']);
  assert.ok(w.sheetLesen.length >= 1 && nurAufgaben(w.sheetLesen), JSON.stringify(w.sheetLesen));
  assert.strictEqual(w.sheetLesen.filter((x) => x === 'Aufgaben!alles').length, 1);
  const z = w.tabs['Aufgaben'][3];
  assert.strictEqual(z.length, 12);
  assert.strictEqual(z[0], a.id);
  assert.ok(istDatum(z[1]) && Math.abs(z[1] - Date.now()) < 60000, 'Erstellt = jetzt');
  assert.deepStrictEqual(z.slice(2, 5), ['Jonas', 'Nina', 'Getränke kalt stellen']);
  assert.ok(istDatum(z[5]) && D.berlin(z[5]) === tag(1), 'Fällig = Mitternacht Berlin');
  assert.deepStrictEqual(z.slice(6), ['18:00', 'Zeile eins\nZeile zwei', 'offen', '', '', '']);
  assert.strictEqual(w.schreibLog[0].werte[0][6], "'18:00", 'Uhrzeit geht als Text ins Sheet');
  // jede Textzelle geht mit Hochkomma ins Sheet (reiner Text), Datumswerte als Datum, leere Zellen leer
  assert.deepStrictEqual(roh(w.schreibLog[0].werte[0].map((x) => (istDatum(x) ? 'Datum' : x))),
    ["'" + a.id, 'Datum', "'Jonas", "'Nina", "'Getränke kalt stellen", 'Datum', "'18:00", "'Zeile eins\nZeile zwei", "'offen", '', '', '']);
  assert.deepStrictEqual(['B4', 'F4', 'G4', 'J4', 'L4'].map((x) => w.formate['Aufgaben!' + x]),
    ['dd.MM.yyyy HH:mm:ss', 'dd.MM.yyyy', '@', 'dd.MM.yyyy', 'dd.MM.yyyy HH:mm:ss']);
  assert.deepStrictEqual(roh(k.__k.AU_FORMATE), { 2: 'dd.MM.yyyy HH:mm:ss', 6: 'dd.MM.yyyy', 7: '@', 10: 'dd.MM.yyyy', 12: 'dd.MM.yyyy HH:mm:ss' });
  // Antwort: frische Liste mit der neuen Aufgabe am Ende
  assert.deepStrictEqual(a.aufgaben, { team: ['Jonas', 'Nina'], fehler: 0, liste: [A1(), A2(),
    { id: a.id, titel: 'Getränke kalt stellen', fuer: 'Nina', von: 'Jonas', faellig: tag(1), uhrzeit: '18:00', notiz: 'Zeile eins\nZeile zwei',
      status: 'offen', erstellt: heuteText(), erledigtAm: '', erledigtVon: '' }] });
  assert.deepStrictEqual(p('uebersicht').aufgaben, a.aufgaben, 'dieselbe Liste beim nächsten Laden');
  assert.deepStrictEqual(w.sperren, [10000]);
  assert.strictEqual(w.freigaben, 1, 'Sperre wieder frei');
  assert.deepStrictEqual(w.cache, {}, 'ohne Cache');
  // Codex 2026-11-21: erst ins Sheet (flush), dann die Sperre frei, sonst sieht die nächste Anfrage die Zeile noch nicht
  assert.deepStrictEqual(ereignisse.slice(-4), ['sperre', 'schreiben Aufgaben!A4:L4', 'flush', 'frei']);
  // ohne Fälligkeit, Uhrzeit und Notiz: Zellen bleiben leer, nächste Zeile; jede ID nur einmal
  const b = p('aufgabeAnlegen', { titel: 'Kasse zählen', fuer: 'Jonas' });
  assert.strictEqual(b.ok, true, JSON.stringify(b));
  assert.strictEqual(w.sheetSchreiben[1], 'Aufgaben!A5:L5');
  assert.deepStrictEqual(w.tabs['Aufgaben'][4].slice(2), ['Jonas', 'Jonas', 'Kasse zählen', '', '', '', 'offen', '', '', '']);
  assert.notStrictEqual(b.id, a.id);
  assert.strictEqual(b.aufgaben.liste.length, 4);
});

test('aufgabeAnlegen: alle Prüfungen, bei einem Fehler wird nichts geschrieben', () => {
  const { w, p } = welt();
  const gut = { titel: 'Kühlschrank auffüllen', fuer: 'Nina' };
  const f = (x) => p('aufgabeAnlegen', Object.assign({}, gut, x));
  const fehler = (x, text) => assert.deepStrictEqual(f(x), { ok: false, fehler: text }, JSON.stringify(x).slice(0, 60));
  for (const t of ['', '   ', '\n\t', undefined, null, 5, { a: 1 }, 'x'.repeat(141)]) fehler({ titel: t }, 'Aufgabe: bitte einen Text mit 1 bis 140 Zeichen');
  for (const n of ['', 'Unbekannt', 'jonas', 'Jonas, Nina', undefined, null, 3, ['Nina']]) fehler({ fuer: n }, 'Für: bitte eine Person aus dem Team wählen');
  for (const d of ['2026-02-30', '21.11.2026', (jahr() + 1) + '-1-5', 20261121, true]) fehler({ faellig: d }, 'Fällig: Datum ungültig');
  const jahre = 'Fällig: bitte ein Datum in den Jahren ' + (jahr() - 1) + ' bis ' + (jahr() + 5);
  for (const d of [(jahr() - 2) + '-12-31', (jahr() + 6) + '-01-01']) fehler({ faellig: d }, jahre);
  for (const u of ['24:00', '9:30', '09:60', '0930', '09:30:00', 'abends', 930]) fehler({ faellig: tag(1), uhrzeit: u }, 'Uhrzeit: bitte als HH:MM von 00:00 bis 23:59');
  fehler({ uhrzeit: '09:30' }, 'Eine Uhrzeit geht nur zusammen mit einem Fälligkeitsdatum');
  fehler({ faellig: '', uhrzeit: '09:30' }, 'Eine Uhrzeit geht nur zusammen mit einem Fälligkeitsdatum');
  for (const n of ['x'.repeat(501), { a: 1 }, 7]) fehler({ notiz: n }, 'Notiz zu lang (höchstens 500 Zeichen)');
  assert.deepStrictEqual(w.sheetSchreiben, []);
  assert.strictEqual(w.tabs['Aufgaben'].length, 4);
  assert.strictEqual(w.freigaben, w.sperren.length, 'Sperre jedes Mal wieder frei');
  // die Grenzen gehen durch
  const grenzen = [{ titel: 'x'.repeat(140) }, { titel: '🍹'.repeat(140) }, { notiz: 'x'.repeat(500) }, { faellig: (jahr() - 1) + '-01-01' },
    { faellig: (jahr() + 5) + '-12-31', uhrzeit: '00:00' }, { faellig: tag(0), uhrzeit: '23:59' }, { faellig: null, uhrzeit: null, notiz: null }];
  for (const x of grenzen) assert.strictEqual(f(x).ok, true, JSON.stringify(x).slice(0, 60));
  assert.strictEqual(w.tabs['Aufgaben'].length, 3 + grenzen.length);
});

test('aufgabeAnlegen: Für muss im Team sein, gesperrte Personen sind nicht im Team', () => {
  const { w, kk, p, codeOlaf } = welt();
  assert.deepStrictEqual(p('uebersicht').aufgaben.team, ['Jonas', 'Nina']);
  assert.deepStrictEqual(p('aufgabeAnlegen', { titel: 'Für Olaf', fuer: 'Olaf' }), { ok: false, fehler: 'Für: bitte eine Person aus dem Team wählen' });
  // der gesperrte Code selbst kommt gar nicht erst durch
  assert.deepStrictEqual(post(kk, { code: codeOlaf, aktion: 'aufgabeAnlegen', titel: 'Von Olaf', fuer: 'Nina' }), { ok: false, fehler: 'Code ungültig' });
  assert.deepStrictEqual(w.sheetSchreiben, []);
  // an sich selbst geht, an Nina auch
  assert.strictEqual(p('aufgabeAnlegen', { titel: 'Für mich', fuer: 'Jonas' }).ok, true);
  const a = p('aufgabeAnlegen', { titel: 'Für Nina', fuer: 'Nina' });
  assert.strictEqual(a.ok, true);
  // Nina wird gesperrt: nicht mehr im Team, ihre Aufgaben bleiben in der Liste, neue an sie gehen nicht
  kk.codeSperren('Nina');
  const u = p('uebersicht').aufgaben;
  assert.deepStrictEqual(u.team, ['Jonas']);
  assert.ok(u.liste.some((x) => x.id === a.id && x.fuer === 'Nina'));
  assert.deepStrictEqual(p('aufgabeAnlegen', { titel: 'Noch eine', fuer: 'Nina' }), { ok: false, fehler: 'Für: bitte eine Person aus dem Team wählen' });
  // neuer Code für Olaf: wieder im Team (sortiert)
  kk.codeAnlegen('Olaf');
  assert.deepStrictEqual(p('uebersicht').aufgaben.team, ['Jonas', 'Olaf']);
  assert.strictEqual(p('aufgabeAnlegen', { titel: 'Für Olaf', fuer: 'Olaf' }).ok, true);
});

test('Formelschutz: gefährliche Anfänge gehen als Text ins Sheet, beim Lesen kommt der eingegebene Text heraus', () => {
  const { w, p } = welt();
  const a = p('aufgabeAnlegen', { titel: '=IMPORTXML("http://x")', fuer: 'Nina', notiz: '+49 30 000000' });
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.strictEqual(w.schreibLog[0].werte[0][4], "'=IMPORTXML(\"http://x\")");
  assert.strictEqual(w.schreibLog[0].werte[0][7], "'+49 30 000000");
  assert.strictEqual(w.tabs['Aufgaben'][3][4], '=IMPORTXML("http://x")');
  assert.deepStrictEqual([a.aufgaben.liste[2].titel, a.aufgaben.liste[2].notiz], ['=IMPORTXML("http://x")', '+49 30 000000']);
  const texte = ['12 Kisten bestellen', '-5 Grad im Lager prüfen', '@Nina fragen', "'s Leergut zählen", "''doppelt", '2026-12-01', 'WAHR', 'Mai 2027', '€5'];
  for (const t of texte) {
    const b = p('aufgabeAnlegen', { titel: t, fuer: 'Jonas', notiz: t });
    const neu = b.aufgaben.liste[b.aufgaben.liste.length - 1];
    assert.deepStrictEqual([neu.titel, neu.notiz], [t, t], t);
    const zellen = w.schreibLog[w.schreibLog.length - 1].werte[0];
    assert.deepStrictEqual([zellen[4], zellen[7]], ["'" + t, "'" + t], 'mit Hochkomma ins Sheet: ' + t);
    assert.strictEqual(p('uebersicht').aufgaben.liste.find((x) => x.id === b.id).titel, t, t);
  }
  // Ändern ebenso
  const c = p('aufgabeAendern', { id: 'A1', titel: '=SUM(A1:A9)', notiz: '-nichts-' });
  assert.deepStrictEqual([c.aufgaben.liste[0].titel, c.aufgaben.liste[0].notiz], ['=SUM(A1:A9)', '-nichts-']);
  assert.deepStrictEqual(roh(w.schreibLog[w.schreibLog.length - 1].werte), [["'=SUM(A1:A9)"]]);
  assert.strictEqual(w.tabs['Aufgaben'][1][7], '-nichts-');
  assert.deepStrictEqual(w.formeln, [], 'keine Formel im Sheet');
});

test('anfrageId: feste ID, dieselbe Anfrage legt nichts doppelt an und antwortet wie beim ersten Mal', () => {
  const { w, p, pNina } = welt();
  w.cacheKaputt = true; // der Schutz braucht keinen Cache
  const daten = { titel: 'Pfandbons einlösen', fuer: 'Jonas', faellig: tag(3), anfrageId: 'aufgabe-0001' };
  const a = p('aufgabeAnlegen', daten);
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.match(a.id, /^AA-[0-9A-F]{20}$/);
  assert.strictEqual(w.tabs['Aufgaben'][3][0], a.id);
  const b = p('aufgabeAnlegen', daten);
  assert.strictEqual(b.wiederholt, true);
  const ohne = Object.assign({}, b);
  delete ohne.wiederholt;
  assert.deepStrictEqual(ohne, a, 'Antwort wie beim ersten Mal');
  assert.deepStrictEqual(w.sheetSchreiben, ['Aufgaben!A4:L4']);
  assert.strictEqual(w.tabs['Aufgaben'].filter((z) => z[0] === a.id).length, 1);
  // auch wenn die Aufgabe inzwischen erledigt oder entfernt ist: nicht noch einmal anlegen
  assert.strictEqual(p('aufgabeAendern', { id: a.id, status: 'entfernt' }).ok, true);
  const c = p('aufgabeAnlegen', daten);
  assert.deepStrictEqual([c.ok, c.id, c.wiederholt], [true, a.id, true]);
  assert.ok(!c.aufgaben.liste.some((x) => x.id === a.id));
  assert.strictEqual(w.tabs['Aufgaben'].filter((z) => z[0] === a.id).length, 1);
  // andere anfrageId oder andere Person: eigene Aufgabe
  const d = p('aufgabeAnlegen', Object.assign({}, daten, { anfrageId: 'aufgabe-0002' }));
  const e = pNina('aufgabeAnlegen', daten);
  assert.strictEqual(new Set([a.id, d.id, e.id]).size, 3);
  assert.ok(!d.wiederholt && !e.wiederholt);
  assert.strictEqual(w.tabs['Aufgaben'].length, 6);
  // ungültige anfrageId: nichts gelesen, nichts geschrieben
  const vorher = w.sheetLesen.length;
  for (const id of ['x', 'kurz', 5, 'mit leerzeichen', 'x'.repeat(65), true]) {
    assert.deepStrictEqual(p('aufgabeAnlegen', Object.assign({}, daten, { anfrageId: id })), { ok: false, fehler: 'Ungültige Anfrage' }, String(id));
  }
  assert.strictEqual(w.sheetLesen.length, vorher);
  assert.strictEqual(w.tabs['Aufgaben'].length, 6);
  assert.deepStrictEqual(w.cache, {});
});

test('aufgabeAendern: erledigt setzt „Erledigt am“ und „Erledigt von“, offen leert beide, entfernt nimmt sie aus der Liste', () => {
  const { w, p, pNina } = welt();
  const vorher = w.tabs['Aufgaben'][1].slice(0, 8);
  const a = pNina('aufgabeAendern', { id: 'A1', status: 'erledigt' });
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.deepStrictEqual(Object.keys(a).sort(), ['aufgaben', 'benachrichtigt', 'name', 'ok']);
  assert.strictEqual(a.benachrichtigt, 0);
  assert.strictEqual(a.name, 'Nina');
  assert.deepStrictEqual(w.sheetSchreiben, ['Aufgaben!I2:L2'], 'ein Schreibvorgang für Status, Erledigt am, Erledigt von, Geändert');
  assert.deepStrictEqual(w.ereignisse.slice(-4), ['sperre', 'schreiben Aufgaben!I2:L2', 'flush', 'frei'], 'flush vor der Freigabe');
  assert.ok(nurAufgaben(w.sheetLesen) && w.sheetLesen.length === 1, JSON.stringify(w.sheetLesen));
  let z = w.tabs['Aufgaben'][1];
  assert.strictEqual(z[8], 'erledigt');
  assert.ok(istDatum(z[9]) && D.berlin(z[9]) === heuteText(), 'Erledigt am = heute als Datum');
  assert.strictEqual(z[10], 'Nina');
  assert.ok(istDatum(z[11]) && Math.abs(z[11] - Date.now()) < 60000, 'Geändert = jetzt');
  assert.deepStrictEqual(z.slice(0, 8), vorher, 'A–H unverändert');
  assert.deepStrictEqual([w.formate['Aufgaben!J2'], w.formate['Aufgaben!L2']], ['dd.MM.yyyy', 'dd.MM.yyyy HH:mm:ss']);
  assert.deepStrictEqual(a.aufgaben, { team: ['Jonas', 'Nina'], fehler: 0,
    liste: [Object.assign(A1(), { status: 'erledigt', erledigtAm: heuteText(), erledigtVon: 'Nina' }), A2()] });
  assert.deepStrictEqual(w.sperren, [10000]);
  assert.strictEqual(w.freigaben, 1);
  // noch einmal erledigt (jemand tippt gleichzeitig): nichts geschrieben, es bleibt bei Nina
  const b = p('aufgabeAendern', { id: 'A1', status: 'erledigt' });
  assert.strictEqual(b.ok, true);
  assert.strictEqual(b.name, 'Jonas');
  assert.strictEqual(w.sheetSchreiben.length, 1);
  assert.strictEqual(b.aufgaben.liste[0].erledigtVon, 'Nina');
  // zurück auf offen: beide Zellen leer
  const c = p('aufgabeAendern', { id: 'A1', status: 'offen' });
  assert.deepStrictEqual(w.sheetSchreiben.slice(1), ['Aufgaben!I2:L2']);
  z = w.tabs['Aufgaben'][1];
  assert.deepStrictEqual(z.slice(8, 11), ['offen', '', '']);
  assert.ok(istDatum(z[11]));
  assert.deepStrictEqual(c.aufgaben.liste[0], A1());
  // entfernt: Zeile bleibt im Tab, fehlt in der Liste; danach gibt es die Aufgabe für die App nicht mehr
  const d = p('aufgabeAendern', { id: 'A1', status: 'entfernt' });
  assert.strictEqual(d.ok, true, JSON.stringify(d));
  assert.deepStrictEqual(d.aufgaben.liste, [A2()]);
  assert.strictEqual(w.tabs['Aufgaben'].length, 4, 'nichts gelöscht');
  assert.deepStrictEqual(w.tabs['Aufgaben'][1].slice(0, 9), vorher.concat(['entfernt']));
  assert.deepStrictEqual(p('uebersicht').aufgaben.liste, [A2()]);
  const n = w.sheetSchreiben.length;
  for (const x of [{ status: 'offen' }, { status: 'erledigt' }, { status: 'entfernt' }, { titel: 'Neu' }]) {
    assert.deepStrictEqual(p('aufgabeAendern', Object.assign({ id: 'A1' }, x)), FEHLT, JSON.stringify(x));
  }
  assert.strictEqual(w.sheetSchreiben.length, n);
  // eine erledigte entfernen: „Erledigt am/von“ bleiben als Verlauf stehen
  assert.strictEqual(p('aufgabeAendern', { id: 'A2', status: 'entfernt' }).ok, true);
  assert.deepStrictEqual([w.tabs['Aufgaben'][2][8], w.tabs['Aufgaben'][2][10]], ['entfernt', 'Nina']);
  assert.ok(istDatum(w.tabs['Aufgaben'][2][9]));
});

test('aufgabeAendern: unbekannte ID, unlesbare Zeile, ungültiger Status, nichts angegeben', () => {
  const { w, p } = welt();
  w.tabs['Aufgaben'].push(D.aufgabenZeile({ id: 'K1', titel: 'Status kaputt', status: 'vielleicht' }),
    // Codex 2026-11-21: ID doppelt, oben unlesbar. Die untere Zeile zeigt die App nicht, also lässt sie sich auch nicht ändern
    D.aufgabenZeile({ id: 'K2', titel: '' }), D.aufgabenZeile({ id: 'K2', titel: 'Unten lesbar' }));
  const u = p('uebersicht').aufgaben;
  assert.deepStrictEqual([u.liste.map((x) => x.id), u.fehler], [['A1', 'A2'], 3]);
  for (const id of ['A99', '', ' ', undefined, null, 5, 'x'.repeat(65), 'K1', 'K2', 'ID']) {
    assert.deepStrictEqual(p('aufgabeAendern', { id: id, status: 'erledigt' }), FEHLT, JSON.stringify(id));
  }
  for (const s of ['fertig', 'Erledigt', '', null, 5]) {
    assert.deepStrictEqual(p('aufgabeAendern', { id: 'A1', status: s }), { ok: false, fehler: 'Status unbekannt' }, JSON.stringify(s));
  }
  assert.deepStrictEqual(p('aufgabeAendern', { id: 'A1' }), { ok: false, fehler: 'Keine Änderung angegeben' });
  assert.deepStrictEqual(w.sheetSchreiben, []);
  assert.strictEqual(w.freigaben, w.sperren.length);
  // ID mit Leerzeichen drumherum passt
  assert.strictEqual(p('aufgabeAendern', { id: ' A1 ', status: 'erledigt' }).ok, true);
});

test('aufgabeAendern: Felder mit denselben Prüfungen, Uhrzeit braucht ein Datum, ohne Fälligkeit auch keine Uhrzeit', () => {
  const { w, p } = welt();
  const a = p('aufgabeAendern', { id: 'A1', titel: ' Leergut wegbringen ', fuer: 'Nina', faellig: tag(5), uhrzeit: '14:15', notiz: '' });
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.deepStrictEqual(w.sheetSchreiben, ['Aufgaben!L2', 'Aufgaben!D2:H2']);
  let z = w.tabs['Aufgaben'][1];
  assert.deepStrictEqual([z[0], z[2], z[3], z[4], z[6], z[7], z[8]], ['A1', 'Nina', 'Nina', 'Leergut wegbringen', '14:15', '', 'offen']);
  assert.ok(istDatum(z[5]) && D.berlin(z[5]) === tag(5));
  assert.ok(istDatum(z[1]) && D.berlin(z[1]) === tag(-3), 'Erstellt bleibt');
  assert.ok(istDatum(z[11]));
  assert.deepStrictEqual([w.formate['Aufgaben!F2'], w.formate['Aufgaben!G2']], ['dd.MM.yyyy', '@']);
  assert.deepStrictEqual(a.aufgaben.liste[0], Object.assign(A1(), { titel: 'Leergut wegbringen', fuer: 'Nina', faellig: tag(5), uhrzeit: '14:15', notiz: '' }));
  // dasselbe noch einmal: alles ist schon so, nichts geschrieben
  w.sheetSchreiben.length = 0;
  const gleich = p('aufgabeAendern', { id: 'A1', titel: 'Leergut wegbringen', fuer: 'Nina', faellig: tag(5), uhrzeit: '14:15', notiz: '' });
  assert.strictEqual(gleich.ok, true);
  assert.deepStrictEqual(gleich.aufgaben, a.aufgaben);
  assert.deepStrictEqual(w.sheetSchreiben, []);
  // nur die Uhrzeit: das Datum steht in der Zeile
  assert.strictEqual(p('aufgabeAendern', { id: 'A1', uhrzeit: '08:00' }).aufgaben.liste[0].uhrzeit, '08:00');
  assert.deepStrictEqual(w.sheetSchreiben, ['Aufgaben!L2', 'Aufgaben!G2']);
  assert.strictEqual(w.schreibLog[w.schreibLog.length - 1].werte[0][0], "'08:00");
  // Fälligkeit geleert: die Uhrzeit geht mit
  w.sheetSchreiben.length = 0;
  const leer = p('aufgabeAendern', { id: 'A1', faellig: '' });
  assert.deepStrictEqual([leer.aufgaben.liste[0].faellig, leer.aufgaben.liste[0].uhrzeit], ['', '']);
  assert.deepStrictEqual(w.sheetSchreiben, ['Aufgaben!L2', 'Aufgaben!F2:G2']);
  assert.deepStrictEqual(w.tabs['Aufgaben'][1].slice(5, 7), ['', '']);
  // Uhrzeit ohne Datum (weder in der Anfrage noch in der Zeile)
  w.sheetSchreiben.length = 0;
  const ohneDatum = { ok: false, fehler: 'Eine Uhrzeit geht nur zusammen mit einem Fälligkeitsdatum' };
  assert.deepStrictEqual(p('aufgabeAendern', { id: 'A1', uhrzeit: '10:00' }), ohneDatum);
  assert.deepStrictEqual(p('aufgabeAendern', { id: 'A1', faellig: '', uhrzeit: '10:00' }), ohneDatum);
  assert.deepStrictEqual(p('aufgabeAendern', { id: 'A2', uhrzeit: '10:00' }), ohneDatum);
  // dieselben Prüfungen wie beim Anlegen
  const f = (x, text) => assert.deepStrictEqual(p('aufgabeAendern', Object.assign({ id: 'A1' }, x)), { ok: false, fehler: text }, JSON.stringify(x).slice(0, 60));
  f({ titel: '' }, 'Aufgabe: bitte einen Text mit 1 bis 140 Zeichen');
  f({ titel: 'x'.repeat(141) }, 'Aufgabe: bitte einen Text mit 1 bis 140 Zeichen');
  f({ fuer: 'Olaf' }, 'Für: bitte eine Person aus dem Team wählen');
  f({ fuer: '' }, 'Für: bitte eine Person aus dem Team wählen');
  f({ faellig: '2026-02-30' }, 'Fällig: Datum ungültig');
  f({ faellig: (jahr() + 6) + '-01-01' }, 'Fällig: bitte ein Datum in den Jahren ' + (jahr() - 1) + ' bis ' + (jahr() + 5));
  f({ faellig: tag(1), uhrzeit: '25:00' }, 'Uhrzeit: bitte als HH:MM von 00:00 bis 23:59');
  f({ notiz: 'x'.repeat(501) }, 'Notiz zu lang (höchstens 500 Zeichen)');
  // ein Fehler in einem Feld: auch die anderen Felder werden nicht geschrieben
  f({ titel: 'Gültig', status: 'erledigt', notiz: 'x'.repeat(501) }, 'Notiz zu lang (höchstens 500 Zeichen)');
  assert.deepStrictEqual(w.sheetSchreiben, []);
  // Datum und Uhrzeit zusammen, dazu Status in derselben Anfrage
  const b = p('aufgabeAendern', { id: 'A1', faellig: tag(3), uhrzeit: '10:00', status: 'erledigt', notiz: 'Erste Zeile\nZweite Zeile' });
  assert.strictEqual(b.ok, true, JSON.stringify(b));
  assert.deepStrictEqual(w.sheetSchreiben, ['Aufgaben!F2:L2']);
  assert.deepStrictEqual(b.aufgaben.liste[0], Object.assign(A1(), { titel: 'Leergut wegbringen', fuer: 'Nina', faellig: tag(3), uhrzeit: '10:00',
    notiz: 'Erste Zeile\nZweite Zeile', status: 'erledigt', erledigtAm: heuteText(), erledigtVon: 'Jonas' }));
});

test('aufgabeAendern: alte Fälligkeit und gesperrte Person bleiben, solange sie niemand anfasst; lange Erledigtes lässt sich öffnen', () => {
  const { w, p } = welt();
  w.tabs['Aufgaben'].push(
    D.aufgabenZeile({ id: 'A3', erstellt: '2019-02-01', von: 'Nina', fuer: 'Olaf', titel: 'Uralt', faellig: '2019-03-01', uhrzeit: '08:00' }),
    D.aufgabenZeile({ id: 'A4', von: 'Jonas', fuer: 'Nina', titel: 'Lange erledigt', status: 'erledigt', erledigtAm: tag(-90), erledigtVon: 'Nina' }));
  // das Formular schickt alle Felder zurück, geändert ist nur der Titel
  const a = p('aufgabeAendern', { id: 'A3', titel: 'Uralt, aber wichtig', fuer: 'Olaf', faellig: '2019-03-01', uhrzeit: '08:00', notiz: '' });
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.deepStrictEqual(w.sheetSchreiben, ['Aufgaben!L5', 'Aufgaben!E5']);
  const x = a.aufgaben.liste.find((y) => y.id === 'A3');
  assert.deepStrictEqual([x.titel, x.fuer, x.faellig, x.uhrzeit], ['Uralt, aber wichtig', 'Olaf', '2019-03-01', '08:00']);
  // wer sie ändert, braucht gültige Werte
  assert.deepStrictEqual(p('aufgabeAendern', { id: 'A3', faellig: '2019-03-02' }),
    { ok: false, fehler: 'Fällig: bitte ein Datum in den Jahren ' + (jahr() - 1) + ' bis ' + (jahr() + 5) });
  assert.strictEqual(p('aufgabeAendern', { id: 'A3', fuer: 'Jonas' }).ok, true);
  assert.deepStrictEqual(p('aufgabeAendern', { id: 'A3', fuer: 'Olaf' }), { ok: false, fehler: 'Für: bitte eine Person aus dem Team wählen' });
  // A4 fehlt in der Liste (vor 90 Tagen erledigt), steht aber im Tab: wieder öffnen geht
  assert.ok(!a.aufgaben.liste.some((y) => y.id === 'A4'));
  const b = p('aufgabeAendern', { id: 'A4', status: 'offen' });
  assert.deepStrictEqual(b.aufgaben.liste.find((y) => y.id === 'A4'),
    { id: 'A4', titel: 'Lange erledigt', fuer: 'Nina', von: 'Jonas', faellig: '', uhrzeit: '', notiz: '', status: 'offen', erstellt: '', erledigtAm: '', erledigtVon: '' });
});

test('Tab Aufgaben fehlt oder Kopfzeile passt nicht: verständlicher Fehler bei beiden Aktionen, nichts geschrieben', () => {
  const { w, p } = welt(true);
  const fehlt = { ok: false, fehler: 'Der Tab „Aufgaben“ fehlt im Sheet, bitte Mark Bescheid geben' };
  assert.deepStrictEqual(p('aufgabeAnlegen', { titel: 'Kühlschrank auffüllen', fuer: 'Nina' }), fehlt);
  assert.deepStrictEqual(p('aufgabeAnlegen', { titel: 'Kühlschrank auffüllen', fuer: 'Nina', anfrageId: 'aufgabe-0001' }), fehlt);
  assert.deepStrictEqual(p('aufgabeAendern', { id: 'A1', status: 'erledigt' }), fehlt);
  assert.deepStrictEqual(w.sheetLesen, []);
  assert.deepStrictEqual(w.sheetSchreiben, []);
  assert.deepStrictEqual(Object.keys(w.tabs).sort(), ['Abfüllungen', 'App-Einstellungen', 'Lager', 'Lager-Log', 'Verkäufe'], 'kein Tab angelegt');
  assert.strictEqual(w.freigaben, 3);
  // Kopfzeile verschoben (Spalte eingefügt): nichts schreiben
  const kopf = D.aufgabenKopf();
  kopf.splice(4, 0, 'Neu');
  w.tabs['Aufgaben'] = [kopf, ['A1', '', 'Nina', 'Jonas', '', 'Leergut zurückbringen', '', '', '', 'offen', '', '', '']];
  const falsch = { ok: false, fehler: 'Die Kopfzeile im Tab „Aufgaben“ passt nicht, bitte Mark Bescheid geben' };
  assert.deepStrictEqual(p('aufgabeAnlegen', { titel: 'Kühlschrank auffüllen', fuer: 'Nina' }), falsch);
  assert.deepStrictEqual(p('aufgabeAendern', { id: 'A1', status: 'erledigt' }), falsch);
  assert.deepStrictEqual(w.sheetSchreiben, []);
  assert.strictEqual(w.tabs['Aufgaben'].length, 2);
});

test('Sperre belegt: verständlicher Fehler bei beiden Aktionen, nichts gelesen, nichts geschrieben', () => {
  const { w, p } = welt();
  w.sperreBelegt = true;
  const belegt = { ok: false, fehler: 'Gerade trägt jemand anderes ein, bitte gleich nochmal versuchen' };
  assert.deepStrictEqual(p('aufgabeAnlegen', { titel: 'Kühlschrank auffüllen', fuer: 'Nina' }), belegt);
  assert.deepStrictEqual(p('aufgabeAendern', { id: 'A1', status: 'erledigt' }), belegt);
  assert.deepStrictEqual(w.sperren, [10000, 10000]);
  assert.deepStrictEqual(w.sheetLesen, []);
  assert.deepStrictEqual(w.sheetSchreiben, []);
  w.sperreBelegt = false;
  assert.strictEqual(p('aufgabeAendern', { id: 'A1', status: 'erledigt' }).ok, true);
});

test('ungültiger Code: beide Aktionen lesen das Sheet nicht, sperren nichts und schreiben nichts', () => {
  const { w, kk, codeOlaf } = welt();
  for (const code of ['ABCD-EFGH-JKMN', codeOlaf, '']) {
    assert.deepStrictEqual(post(kk, { code: code, aktion: 'aufgabeAnlegen', titel: 'Kühlschrank auffüllen', fuer: 'Nina' }), { ok: false, fehler: 'Code ungültig' });
    assert.deepStrictEqual(post(kk, { code: code, aktion: 'aufgabeAendern', id: 'A1', status: 'entfernt' }), { ok: false, fehler: 'Code ungültig' });
  }
  assert.deepStrictEqual(w.sheetIds, [], 'das Sheet wird gar nicht erst geöffnet');
  assert.deepStrictEqual(w.sheetLesen, []);
  assert.deepStrictEqual(w.sheetSchreiben, []);
  assert.deepStrictEqual(w.sperren, []);
  assert.strictEqual(w.tabs['Aufgaben'][1][8], 'offen');
});

test('Schreibfehler: Serverfehler, Sperre frei; scheitert beim Ändern ein Stück, holt die Wiederholung es nach', () => {
  const { w, p } = welt();
  const server = { ok: false, fehler: 'Serverfehler, bitte später nochmal versuchen' };
  w.schreibFehler = (tab, bereich) => tab === 'Aufgaben' && bereich === 'A4:L4';
  assert.deepStrictEqual(p('aufgabeAnlegen', { titel: 'Kühlschrank auffüllen', fuer: 'Nina' }), server);
  assert.strictEqual(w.tabs['Aufgaben'].filter((z) => z[0]).length, 3, 'keine halbe Zeile');
  assert.strictEqual(w.freigaben, 1);
  // Status und Titel: erst der Titel (E), zuletzt das Stück mit dem Status (I–L), das hier scheitert
  w.schreibFehler = (tab, bereich) => tab === 'Aufgaben' && bereich === 'I2:L2';
  w.sheetSchreiben.length = 0;
  w.ereignisse.length = 0;
  assert.deepStrictEqual(p('aufgabeAendern', { id: 'A1', status: 'erledigt', titel: 'Leergut wegbringen' }), server);
  assert.deepStrictEqual(w.sheetSchreiben, ['Aufgaben!E2', 'Aufgaben!I2:L2']);
  assert.deepStrictEqual([w.tabs['Aufgaben'][1][4], w.tabs['Aufgaben'][1][8]], ['Leergut wegbringen', 'offen']);
  assert.deepStrictEqual(w.ereignisse, ['sperre', 'schreiben Aufgaben!E2', 'flush', 'frei'], 'auch nach dem Fehler: flush vor der Freigabe');
  w.schreibFehler = null;
  w.sheetSchreiben.length = 0;
  const a = p('aufgabeAendern', { id: 'A1', status: 'erledigt', titel: 'Leergut wegbringen' });
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.deepStrictEqual(w.sheetSchreiben, ['Aufgaben!I2:L2']);
  assert.deepStrictEqual([a.aufgaben.liste[0].titel, a.aufgaben.liste[0].status, a.aufgaben.liste[0].erledigtVon], ['Leergut wegbringen', 'erledigt', 'Jonas']);
  assert.strictEqual(w.freigaben, w.sperren.length);
  // Codex 2026-11-21: entfernen und zugleich ein Feld ändern. Der Status kommt zuletzt, egal welches Stück scheitert,
  // die Wiederholung kommt durch (stünde „entfernt“ schon da, hieße es „Diese Aufgabe gibt es nicht mehr.“)
  for (const kaputt of ['L3', 'E3', 'I3']) {
    w.tabs['Aufgaben'][2] = D.aufgabenZeile({ id: 'A2', von: 'Jonas', fuer: 'Nina', titel: 'Plakate abholen', status: 'erledigt', erledigtAm: tag(-1), erledigtVon: 'Nina' });
    w.schreibFehler = (tab, bereich) => tab === 'Aufgaben' && bereich === kaputt;
    w.sheetSchreiben.length = 0;
    assert.deepStrictEqual(p('aufgabeAendern', { id: 'A2', status: 'entfernt', titel: 'Plakate (doppelt angelegt)' }), server, kaputt);
    assert.deepStrictEqual(w.sheetSchreiben, ['Aufgaben!L3', 'Aufgaben!E3', 'Aufgaben!I3'].slice(0, ['L3', 'E3', 'I3'].indexOf(kaputt) + 1), kaputt);
    assert.strictEqual(w.tabs['Aufgaben'][2][8], 'erledigt', 'noch nicht entfernt: ' + kaputt);
    w.schreibFehler = null;
    const b = p('aufgabeAendern', { id: 'A2', status: 'entfernt', titel: 'Plakate (doppelt angelegt)' });
    assert.strictEqual(b.ok, true, kaputt + ' ' + JSON.stringify(b));
    assert.deepStrictEqual([w.tabs['Aufgaben'][2][4], w.tabs['Aufgaben'][2][8]], ['Plakate (doppelt angelegt)', 'entfernt'], kaputt);
    assert.ok(!b.aufgaben.liste.some((x) => x.id === 'A2'));
  }
  // Format lässt sich nicht setzen: nichts geschrieben
  w.formatKaputt['Aufgaben'] = true;
  w.sheetSchreiben.length = 0;
  assert.deepStrictEqual(p('aufgabeAnlegen', { titel: 'Kühlschrank auffüllen', fuer: 'Nina' }), server);
  assert.deepStrictEqual(p('aufgabeAendern', { id: 'A1', status: 'offen' }), server);
  assert.deepStrictEqual(w.sheetSchreiben, []);
  // belegte Zielzeile (Formel, die "" ergibt) wird nicht überschrieben
  delete w.formatKaputt['Aufgaben'];
  w.formelZellen['Aufgaben!E4'] = '=IF(1;"";"")';
  assert.deepStrictEqual(p('aufgabeAnlegen', { titel: 'Kühlschrank auffüllen', fuer: 'Nina' }), server);
  assert.deepStrictEqual(w.sheetSchreiben, []);
});

test('Tab Aufgaben voll: Zeilen werden unten angefügt', () => {
  const { w, p } = welt();
  w.maxZeilen['Aufgaben'] = 3;
  assert.strictEqual(p('aufgabeAnlegen', { titel: 'Kühlschrank auffüllen', fuer: 'Nina' }).ok, true);
  assert.deepStrictEqual(w.eingefuegt, ['Aufgaben:3+1']);
});

test('die Übersicht nach buchen, stornieren und verkaufStandort enthält aufgaben; diese Aktionen schreiben nie in den Tab', () => {
  const { w, kk, p } = welt();
  const soll = { team: ['Jonas', 'Nina'], liste: [A1(), A2()], fehler: 0 };
  const a = p('buchen', { art: 'Bruch', standort: 'Lager Süd', flaschen: 1, datum: heuteText(), anfrageId: 'buchung-0001' });
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.deepStrictEqual(a.uebersicht.aufgaben, soll);
  assert.deepStrictEqual(p('buchen', { art: 'Bruch', standort: 'Lager Süd', flaschen: 1, datum: heuteText(), anfrageId: 'buchung-0001' }).uebersicht.aufgaben, soll,
    'auch bei einer Wiederholung');
  assert.deepStrictEqual(p('stornieren', { id: a.id }).uebersicht.aufgaben, soll);
  assert.deepStrictEqual(p('verkaufStandort', { rechnung: 'R-100', standort: 'Lager Ost' }).uebersicht.aufgaben, soll);
  assert.ok(!w.sheetSchreiben.some((x) => /Aufgaben/.test(x)), JSON.stringify(w.sheetSchreiben));
  // der tägliche Lauf schreibt weiter nur den Tab Lager
  w.sheetSchreiben.length = 0;
  kk.taeglich();
  assert.deepStrictEqual(w.sheetSchreiben, ['Lager!B2:F5']);
  // neue Aufgabe steht in der nächsten Übersicht einer Buchung
  const neu = p('aufgabeAnlegen', { titel: 'Kühlschrank auffüllen', fuer: 'Nina' });
  const b = p('buchen', { art: 'Bruch', standort: 'Lager Süd', flaschen: 1, datum: heuteText() });
  assert.deepStrictEqual(b.uebersicht.aufgaben, neu.aufgaben);
  // ohne den Tab: null, die Buchung läuft wie vorher
  delete w.tabs['Aufgaben'];
  const c = p('buchen', { art: 'Bruch', standort: 'Lager Süd', flaschen: 1, datum: heuteText() });
  assert.strictEqual(c.ok, true, JSON.stringify(c));
  assert.strictEqual(c.uebersicht.aufgaben, null);
  assert.strictEqual(c.uebersicht.lager[0].bestand, b.uebersicht.lager[0].bestand - 1);
});

test('aufgabenTabAnlegen: legt den Tab mit Kopfzeile an (fett, fixiert, Uhrzeit als Text), einen vorhandenen rührt sie nicht an', () => {
  const { w, kk, p } = welt(true);
  assert.strictEqual(p('uebersicht').aufgaben, null);
  w.sheetSchreiben.length = 0;
  w.sperren.length = 0;
  w.freigaben = 0;
  kk.aufgabenTabAnlegen();
  // ganz hinten: fünf Tabs im Speicher plus Übersicht
  assert.deepStrictEqual(w.sheetSchreiben, ['insertSheet Aufgaben @6', 'Aufgaben!A1:L1']);
  assert.deepStrictEqual(w.tabs['Aufgaben'], [D.aufgabenKopf()]);
  assert.deepStrictEqual(roh(k.__k.AUFGABEN_KOPF), D.aufgabenKopf());
  assert.strictEqual(k.__k.AUFGABEN_TAB, 'Aufgaben');
  assert.strictEqual(w.fett['Aufgaben!A1:L1'], 'bold');
  assert.strictEqual(w.fixiert['Aufgaben'], 1);
  assert.strictEqual(w.formate['Aufgaben!G1:G1000'], '@');
  assert.strictEqual(w.logs[w.logs.length - 1],
    'Tab „Aufgaben“ angelegt. Kopfzeile A1 bis L1: ID, Erstellt, Von, Für, Aufgabe, Fällig, Uhrzeit, Notiz, Status, Erledigt am, Erledigt von, Geändert');
  assert.deepStrictEqual(w.sperren, ['wait']);
  assert.strictEqual(w.freigaben, 1);
  // die App zeigt die Funktion jetzt (leere Liste), die erste Aufgabe landet in Zeile 2
  assert.deepStrictEqual(p('uebersicht').aufgaben, { team: ['Jonas', 'Nina'], liste: [], fehler: 0 });
  w.sheetSchreiben.length = 0;
  const a = p('aufgabeAnlegen', { titel: 'Kühlschrank auffüllen', fuer: 'Nina' });
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.deepStrictEqual(w.sheetSchreiben, ['Aufgaben!A2:L2']);
  assert.strictEqual(a.aufgaben.liste.length, 1);
  // zweiter Aufruf: nichts angefasst
  const vorher = JSON.stringify(w.tabs['Aufgaben']);
  w.sheetSchreiben.length = 0;
  kk.aufgabenTabAnlegen();
  assert.deepStrictEqual(w.sheetSchreiben, []);
  assert.strictEqual(JSON.stringify(w.tabs['Aufgaben']), vorher);
  assert.strictEqual(w.logs[w.logs.length - 1], 'Tab „Aufgaben“ gibt es schon, nichts geändert. Die Kopfzeile passt.');
  // vorhandener Tab mit anderer Kopfzeile: bleibt, wie er ist, das Log sagt es
  w.tabs['Aufgaben'] = [['Was', 'Wer'], ['Etwas Altes', 'Jonas']];
  kk.aufgabenTabAnlegen();
  assert.deepStrictEqual(w.sheetSchreiben, []);
  assert.deepStrictEqual(w.tabs['Aufgaben'], [['Was', 'Wer'], ['Etwas Altes', 'Jonas']]);
  assert.match(w.logs[w.logs.length - 1], /^Tab „Aufgaben“ gibt es schon, nichts geändert\. Achtung: Die Kopfzeile passt nicht, .*Erwartet in A1 bis L1: ID, Erstellt, /);
});

test('keine Trennpunkte in Texten für Menschen, Scopes nur Sheet, Trigger und (für die Mitteilungen) externe Dienste', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = path.join(__dirname, '..', 'api', 'src');
  const konfig = fs.readFileSync(path.join(src, 'Konfig.js'), 'utf8');
  const neu = konfig.slice(konfig.indexOf('// Aufgaben fürs Team'), konfig.indexOf('// Mitteilungen aufs Handy'));
  assert.ok(neu.length > 1000);
  assert.doesNotMatch(neu + fs.readFileSync(path.join(src, 'AufgabenLogik.js'), 'utf8'), /[·•]/);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(src, 'appsscript.json'), 'utf8')).oauthScopes,
    ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/script.scriptapp',
      'https://www.googleapis.com/auth/script.external_request']);
});
