'use strict';

// Codex-Befund 2026-11-08: Abmelden verwirft den Buchungsentwurf. docs/eintragen.js mit einem kleinen Schein-DOM
// laden, das Formular ausfüllen, senden, zurücksetzen und prüfen, dass danach eine neue anfrageId entsteht.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const H = require('../docs/hilfen.js');

const lies = (d) => fs.readFileSync(path.join(__dirname, '..', 'docs', d), 'utf8');

/** Schein-Element mit den Eigenschaften, die eintragen.js braucht. */
function element() {
  const hoerer = {};
  return {
    value: '', hidden: false, textContent: '', disabled: false, min: '', max: '', hoerer,
    append() {}, replaceChildren() {}, focus() {},
    addEventListener(t, f) { (hoerer[t] = hoerer[t] || []).push(f); },
  };
}

function laden() {
  const els = {};
  const el = (id) => (els[id] = els[id] || element());
  const form = el('buchen-form');
  let gewaehlt = null; // gewählte Art (Radio)
  const felder = ['b-standort', 'b-nach', 'b-kisten', 'b-flaschen', 'b-datum', 'b-kommentar'];
  form.querySelector = () => (gewaehlt ? { value: gewaehlt } : null);
  form.querySelectorAll = () => [];
  form.reset = () => { felder.forEach((f) => { el(f).value = ''; }); gewaehlt = null; };
  const ids = [];
  let nr = 0;
  const S = {
    H: H, el: el, h: () => element(), icon: () => element(), ansichten: {},
    zustand: { daten: { lager: [{ standort: 'Lager Süd' }, { standort: 'Lager Nord' }], kennzahlen: { flaschenProKiste: 24 } },
      schreibt: false, sitzung: 0 },
    neueAnfrageId: () => 'entwurf-' + (++nr),
    schreiben: async (aktion, daten) => { ids.push(daten.anfrageId); return { art: 'fehler', meldung: 'Die Schnittstelle antwortet nicht.' }; },
    melden() {},
  };
  vm.runInContext(lies('eintragen.js'), vm.createContext({ window: { SATE: S, scrollTo() {} } }));
  const ausfuellen = () => {
    gewaehlt = 'Promo';
    el('b-standort').value = 'Lager Süd';
    el('b-flaschen').value = '5';
    el('b-datum').value = H.heuteBerlin();
    el('b-kommentar').value = 'Fest';
  };
  const senden = async () => { for (const f of form.hoerer.submit) await f({ preventDefault() {} }); };
  return { S, el, ids, ausfuellen, senden, art: () => gewaehlt };
}

test('Eintragen: Datum höchstens heute, Zurücksetzen leert Formular und anfrageId', async () => {
  const x = laden();
  assert.strictEqual(x.el('b-datum').max, H.heuteBerlin(), 'max = heute');
  x.ausfuellen();
  await x.senden();
  await x.senden(); // Zeitüberschreitung, nochmal getippt: gleiche anfrageId
  assert.deepStrictEqual(x.ids, ['entwurf-1', 'entwurf-1']);
  assert.strictEqual(x.el('buchen-fehler').hidden, false, 'Fehler sichtbar');

  x.S.eintragenZuruecksetzen();
  assert.strictEqual(x.art(), null, 'Art leer');
  for (const f of ['b-standort', 'b-nach', 'b-kisten', 'b-flaschen', 'b-kommentar']) assert.strictEqual(x.el(f).value, '', f);
  assert.strictEqual(x.el('b-datum').value, H.heuteBerlin(), 'Datum wieder heute');
  assert.strictEqual(x.el('buchen-fehler').hidden, true, 'Fehler weg');

  x.ausfuellen();
  await x.senden();
  assert.strictEqual(x.ids[2], 'entwurf-2', 'nach dem Zurücksetzen neue anfrageId');
});

test('Eintragen: Antwort, die nach dem Abmelden ankommt, fasst das Formular nicht mehr an', async () => {
  const x = laden();
  x.S.schreiben = async () => { x.S.zustand.sitzung++; x.S.eintragenZuruecksetzen(); return { art: 'abgebrochen' }; };
  x.ausfuellen();
  await x.senden();
  assert.strictEqual(x.el('buchen-fehler').hidden, true, 'kein „Nicht gespeichert.“ nach dem Abmelden');
  assert.strictEqual(x.el('b-kommentar').value, '', 'Formular bleibt leer');
});

test('Abmelden (vergessen) setzt Formular zurück und schließt Rückfrage und Rückmeldung', () => {
  const app = lies('app.js');
  const vergessen = /function vergessen\(\) \{([\s\S]*?)\n  \}/.exec(app)[1];
  for (const aufruf of ['S.eintragenZuruecksetzen()', 'S.frageSchliessen()', 'S.meldenSchliessen()']) {
    assert.ok(vergessen.includes(aufruf), aufruf);
  }
  const kern = lies('kern.js');
  assert.match(kern, /S\.frageSchliessen = function/);
  assert.match(kern, /S\.meldenSchliessen = function/);
});
