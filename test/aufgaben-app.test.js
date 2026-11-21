'use strict';

// Aufgaben fürs Team (seit v43): die reine Logik der App in docs/hilfen.js. Nur erfundene Namen und Texte.
const test = require('node:test');
const assert = require('node:assert');
const H = require('../docs/hilfen.js');

const HEUTE = '2026-11-21'; // ein Samstag
const aufgabe = (id, fuer, extra) => Object.assign({ id: id, titel: 'Aufgabe ' + id, fuer: fuer, von: 'Ada', faellig: '', uhrzeit: '', notiz: '', status: 'offen',
  erstellt: '2026-11-01', erledigtAm: '', erledigtVon: '' }, extra);

test('Aufgaben: Antwortfeld lesen – fehlt es oder passt es nicht, gibt es die Funktion nicht', () => {
  assert.strictEqual(H.aufgabenDaten(null), null);
  assert.strictEqual(H.aufgabenDaten(undefined), null);
  assert.strictEqual(H.aufgabenDaten({ team: ['Ada'] }), null);
  assert.strictEqual(H.aufgabenDaten({ liste: [] }), null);
  const d = H.aufgabenDaten({ team: ['Ada', '', 7, 'Ben'], liste: [
    aufgabe('a1', 'Ben', { titel: '  Etiketten bestellen ', faellig: '2026-11-30', uhrzeit: '14:00' }),
    { id: '', titel: 'ohne ID' }, { id: 'x', titel: '   ' }, null, 'Text',
    aufgabe('a2', 'Ada', { faellig: '2026-02-30', uhrzeit: '09:00', status: 'erledigt', erledigtAm: 'gestern' }),
    aufgabe('a3', 'Ada', { uhrzeit: '25:00', faellig: '2026-12-01', status: 'irgendwas', notiz: 5 }),
  ] });
  assert.deepStrictEqual(d.team, ['Ada', 'Ben']);
  assert.deepStrictEqual(d.liste.map((x) => x.id), ['a1', 'a2', 'a3']);
  assert.strictEqual(d.liste[0].titel, 'Etiketten bestellen');
  assert.strictEqual(d.liste[0].uhrzeit, '14:00');
  // ungültiges Datum: kein Datum und dann auch keine Uhrzeit; unbekannter Status zählt als offen
  assert.deepStrictEqual([d.liste[1].faellig, d.liste[1].uhrzeit, d.liste[1].status, d.liste[1].erledigtAm], ['', '', 'erledigt', '']);
  assert.deepStrictEqual([d.liste[2].uhrzeit, d.liste[2].status, d.liste[2].notiz], ['', 'offen', '']);
});

test('Aufgaben: Frist in Worten', () => {
  const f = (faellig, uhrzeit) => H.aufgabeFrist({ faellig: faellig, uhrzeit: uhrzeit || '' }, HEUTE);
  assert.deepStrictEqual(f(''), { text: '', stufe: '' });
  assert.deepStrictEqual(f('2026-11-21'), { text: 'Heute', stufe: 'heute' });
  assert.deepStrictEqual(f('2026-11-21', '18:30'), { text: 'Heute, 18:30 Uhr', stufe: 'heute' });
  assert.deepStrictEqual(f('2026-11-22'), { text: 'Morgen', stufe: 'bald' });
  assert.deepStrictEqual(f('2026-11-25', '09:00'), { text: 'Mittwoch, 09:00 Uhr', stufe: '' });
  assert.deepStrictEqual(f('2026-11-28'), { text: '28. Nov', stufe: '' });
  assert.deepStrictEqual(f('2027-01-05'), { text: '5. Jan 2027', stufe: '' });
  assert.deepStrictEqual(f('2026-11-20'), { text: 'Überfällig seit gestern', stufe: 'ueber' });
  assert.deepStrictEqual(f('2026-11-11'), { text: 'Überfällig seit 10 Tagen', stufe: 'ueber' });
  assert.deepStrictEqual(f('2026-06-01'), { text: 'Überfällig seit 1. Jun 2026', stufe: 'ueber' });
  assert.deepStrictEqual(H.aufgabeFrist({ faellig: '2026-11-22' }, 'kaputt'), { text: '', stufe: '' });
});

test('Aufgaben: Reihenfolge und Sicht je Person', () => {
  const d = H.aufgabenDaten({ team: ['Ada', 'Ben', 'Cem'], liste: [
    aufgabe('ohne1', 'Ada'),
    aufgabe('spaet', 'Ada', { faellig: '2026-12-10' }),
    aufgabe('heuteOhne', 'Ada', { faellig: '2026-11-21' }),
    aufgabe('heuteFrueh', 'Ben', { faellig: '2026-11-21', uhrzeit: '08:00' }),
    aufgabe('ueber', 'Ben', { faellig: '2026-11-10' }),
    aufgabe('fertigAlt', 'Ada', { status: 'erledigt', erledigtAm: '2026-11-02', erledigtVon: 'Ada' }),
    aufgabe('fertigNeu', 'Ben', { status: 'erledigt', erledigtAm: '2026-11-20', erledigtVon: 'Ada' }),
    aufgabe('ohne2', 'Ada'),
    aufgabe('fremd', 'Dora', { faellig: '2026-11-01' }),
  ] });
  const s = H.aufgabenSicht(d, 'Ben', HEUTE);
  assert.deepStrictEqual(s.offen.map((x) => x.id), ['fremd', 'ueber', 'heuteFrueh', 'heuteOhne', 'spaet', 'ohne1', 'ohne2']);
  assert.deepStrictEqual(s.meine.map((x) => x.id), ['ueber', 'heuteFrueh']);
  assert.deepStrictEqual(s.erledigt.map((x) => x.id), ['fertigNeu', 'fertigAlt']);
  // ich zuerst, dann das Team, am Ende wer nicht im Team ist, aber Offenes hat
  assert.deepStrictEqual(s.personen.map((p) => [p.name, p.ich, p.offen, p.ueber, p.naechste ? p.naechste.id : null]),
    [['Ben', true, 2, 1, 'ueber'], ['Ada', false, 4, 0, 'heuteOhne'], ['Cem', false, 0, 0, null], ['Dora', false, 1, 1, 'fremd']]);
  // Wer nicht im Team ist und nichts offen hat (z. B. ein gesperrter Code), bekommt keinen eigenen Platz
  assert.deepStrictEqual(H.aufgabenSicht(d, 'Emil', HEUTE).personen.map((p) => p.name), ['Ada', 'Ben', 'Cem', 'Dora']);
});

test('Aufgaben: Eingabe prüfen (dieselben Regeln wie die Schnittstelle)', () => {
  const team = ['Ada', 'Ben'];
  const p = (e) => H.aufgabePruefen(Object.assign({ titel: 'Flyer abholen', fuer: 'Ben', faellig: '', uhrzeit: '', notiz: '' }, e), team, HEUTE);
  assert.deepStrictEqual(p({ titel: '  Flyer   abholen \n', notiz: ' im Copyshop ' }), { ok: true, daten: { titel: 'Flyer abholen', fuer: 'Ben', faellig: '', uhrzeit: '', notiz: 'im Copyshop' } });
  assert.strictEqual(p({ titel: '   ' }).feld, 'titel');
  assert.strictEqual(p({ titel: 'x'.repeat(141) }).feld, 'titel');
  assert.strictEqual(p({ titel: 'x'.repeat(140) }).ok, true);
  assert.strictEqual(p({ fuer: 'Dora' }).feld, 'fuer');
  assert.strictEqual(p({ fuer: '' }).feld, 'fuer');
  assert.strictEqual(p({ faellig: '2026-02-30' }).feld, 'faellig');
  assert.strictEqual(p({ faellig: '2024-12-31' }).feld, 'faellig');
  assert.strictEqual(p({ faellig: '2032-01-01' }).feld, 'faellig');
  assert.strictEqual(p({ faellig: '2025-01-01' }).ok, true);
  assert.strictEqual(p({ uhrzeit: '14:00' }).feld, 'uhrzeit');
  assert.strictEqual(p({ faellig: '2026-11-30', uhrzeit: '24:00' }).feld, 'uhrzeit');
  assert.deepStrictEqual(p({ faellig: '2026-11-30', uhrzeit: '07:05' }).daten.uhrzeit, '07:05');
  assert.strictEqual(p({ notiz: 'n'.repeat(501) }).feld, 'notiz');
  // Meldungen ohne Trennpunkte (Mark)
  [p({ titel: '' }), p({ fuer: '' }), p({ uhrzeit: '14:00' })].forEach((x) => assert.doesNotMatch(x.meldung, /[·•]/));
});

test('Aufgaben: beim Ändern gehen nur die wirklich geänderten Felder mit (Codex v43)', () => {
  const alt = aufgabe('a1', 'Ben', { titel: 'Flyer abholen', faellig: '2026-11-30', uhrzeit: '14:00', notiz: 'im Copyshop' });
  const gleich = { titel: 'Flyer abholen', fuer: 'Ben', faellig: '2026-11-30', uhrzeit: '14:00', notiz: 'im Copyshop' };
  assert.deepStrictEqual(H.aufgabeAenderung(alt, gleich), {});
  // Nur die Notiz geändert: Eine Fälligkeit, die jemand anderes inzwischen umgestellt hat, wird nicht zurückgeschrieben
  assert.deepStrictEqual(H.aufgabeAenderung(alt, Object.assign({}, gleich, { notiz: 'bis 18 Uhr offen' })), { notiz: 'bis 18 Uhr offen' });
  // Datum geleert: Datum und Uhrzeit gehen mit
  assert.deepStrictEqual(H.aufgabeAenderung(alt, Object.assign({}, gleich, { faellig: '', uhrzeit: '' })), { faellig: '', uhrzeit: '' });
  assert.deepStrictEqual(H.aufgabeAenderung(alt, Object.assign({}, gleich, { fuer: 'Ada', titel: 'Flyer holen' })), { titel: 'Flyer holen', fuer: 'Ada' });
  // Felder, die es an der alten Aufgabe nicht gibt, zählen als leer
  assert.deepStrictEqual(H.aufgabeAenderung({ id: 'x', titel: 'A', fuer: 'Ben' }, { titel: 'A', fuer: 'Ben', faellig: '', uhrzeit: '', notiz: '' }), {});
});

test('Aufgaben: Abkürzungen für die Frist und Anfangsbuchstabe', () => {
  assert.deepStrictEqual(H.aufgabeTage(HEUTE), [['2026-11-21', 'Heute'], ['2026-11-22', 'Morgen'], ['2026-11-28', 'In einer Woche']]);
  assert.deepStrictEqual(H.aufgabeTage('x'), []);
  assert.strictEqual(H.initiale(' jonas'), 'J');
  assert.strictEqual(H.initiale(''), '?');
  assert.strictEqual(H.initiale(null), '?');
});
