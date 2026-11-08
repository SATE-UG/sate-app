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
function element(attrs) {
  const hoerer = {};
  const klassen = new Set();
  return Object.assign({
    value: '', hidden: false, textContent: '', disabled: false, checked: false, min: '', max: '', hoerer,
    append() {}, replaceChildren() {}, focus() {},
    classList: { toggle(k, an) { if (an) klassen.add(k); else klassen.delete(k); }, contains: (k) => klassen.has(k) },
    addEventListener(t, f) { (hoerer[t] = hoerer[t] || []).push(f); },
  }, attrs || {});
}

function laden() {
  const els = {};
  const el = (id) => (els[id] = els[id] || element());
  const form = el('buchen-form');
  const radios = []; // Art-Knöpfe, die eintragen.js per S.h baut
  const felder = ['b-standort', 'b-nach', 'b-kisten', 'b-flaschen', 'b-datum', 'b-kommentar'];
  form.querySelectorAll = () => [];
  form.reset = () => { felder.forEach((f) => { el(f).value = ''; }); radios.forEach((r) => { r.checked = false; }); };
  const speicher = {};
  const ids = [];
  let nr = 0;
  const S = {
    H: H, el: el, icon: () => element(), ansichten: {},
    h: (tag, attrs) => { const e = element(Object.assign({}, attrs)); if (tag === 'input' && attrs.type === 'radio') radios.push(e); return e; },
    SCHLUESSEL: { standort: 'sate.standort' },
    speicher: { lesen: (k) => speicher[k] || '', schreiben: (k, v) => { speicher[k] = v; return true; } },
    zustand: { daten: { lager: [{ standort: 'Lager Süd' }, { standort: 'Lager Nord' }], kennzahlen: { flaschenProKiste: 24 } },
      schreibt: false, sitzung: 0 },
    neueAnfrageId: () => 'entwurf-' + (++nr),
    schreiben: async (aktion, daten) => { ids.push(daten.anfrageId); return { art: 'fehler', meldung: 'Die Schnittstelle antwortet nicht.' }; },
    melden() {}, nachOben() {},
  };
  vm.runInContext(lies('eintragen.js'), vm.createContext({ window: { SATE: S, scrollTo() {} } }));
  /** Art wählen wie per Tipp: Radio setzen und das change-Ereignis auslösen. */
  const waehlen = (a) => {
    radios.forEach((r) => { r.checked = r.value === a; });
    const r = radios.find((x) => x.value === a);
    form.hoerer.change.forEach((f) => f({ target: r }));
  };
  /** Feld ändern wie per Tippen (input-Ereignis). */
  const tippen = (id, wert) => { el(id).value = wert; form.hoerer.input.forEach((f) => f({ target: el(id) })); };
  const ausfuellen = () => {
    radios.forEach((r) => { r.checked = r.value === 'Promo'; });
    el('b-standort').value = 'Lager Süd';
    el('b-flaschen').value = '5';
    el('b-datum').value = H.heuteBerlin();
    el('b-kommentar').value = 'Fest';
  };
  const senden = async () => { for (const f of form.hoerer.submit) await f({ preventDefault() {} }); };
  const klick = (id) => el(id).hoerer.click.forEach((f) => f());
  const art = () => { const r = radios.find((x) => x.checked); return r ? r.value : null; };
  return { S, el, ids, speicher, ausfuellen, senden, art, waehlen, tippen, klick };
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

test('Eintragen: Formular erst nach Wahl der Art, Standort vorgewählt, Speichern erst bei gültigen Eingaben', () => {
  const x = laden();
  assert.strictEqual(x.el('b-formular').hidden, true, 'ohne Art kein Formular');
  assert.strictEqual(x.el('art-text').textContent, '', 'kein „Bitte oben auswählen.“ mehr');
  assert.strictEqual(x.el('buchen-senden').disabled, true);

  x.waehlen('Abfüllung');
  assert.strictEqual(x.el('b-formular').hidden, false);
  assert.match(x.el('art-text').textContent, /Abfüller/);
  assert.strictEqual(x.el('b-standort').value, 'Lager Süd', 'Abfüllung: Hauptlager');
  assert.strictEqual(x.el('buchen-senden').disabled, true, 'Menge fehlt');
  assert.match(x.el('buchen-offen').textContent, /wie viele Flaschen/);

  x.klick('b-kisten-plus');
  x.klick('b-kisten-plus');
  x.klick('b-flaschen-plus');
  assert.strictEqual(x.el('b-kisten').value, '2');
  assert.strictEqual(x.el('b-summe').textContent, '= 49 Flaschen');
  assert.strictEqual(x.el('buchen-senden').disabled, false, 'alles gültig');
  assert.strictEqual(x.el('buchen-offen').hidden, true);

  x.klick('b-flaschen-minus');
  x.klick('b-flaschen-minus'); // nie unter 0, bei Abfüllung bleibt das Feld dann leer
  assert.strictEqual(x.el('b-flaschen').value, '');
  x.tippen('b-flaschen', 'abc');
  assert.strictEqual(x.el('buchen-senden').disabled, true, 'unlesbare Zahl');
  assert.ok(x.el('b-summe').classList.contains('summe-fehler'));

  // Wechsel zu Promo: der vorgewählte Standort wechselt mit (nichts gemerkt → leer)
  x.tippen('b-flaschen', '');
  x.waehlen('Promo');
  assert.strictEqual(x.el('b-standort').value, '', 'Promo ohne gemerkten Standort');
});

test('Eintragen: Inventur mit 0 Flaschen erlaubt, zuletzt genutzter Standort wird gemerkt und vorgewählt', async () => {
  const x = laden();
  x.waehlen('Inventur');
  x.el('b-standort').value = 'Lager Nord';
  x.klick('b-flaschen-minus');
  assert.strictEqual(x.el('b-flaschen').value, '0', 'Inventur: 0 zählt');
  assert.strictEqual(x.el('buchen-senden').disabled, false, '0 Flaschen bei Inventur gültig');

  x.S.schreiben = async () => ({ art: 'ok', daten: { hinweise: [] } });
  await x.senden();
  assert.strictEqual(x.speicher['sate.standort'], 'Lager Nord', 'Standort gemerkt');
  assert.strictEqual(x.el('b-formular').hidden, true, 'nach dem Speichern wieder zu');

  x.waehlen('Bruch');
  assert.strictEqual(x.el('b-standort').value, 'Lager Nord', 'zuletzt genutzter Standort vorgewählt');
  x.waehlen('Abfüllung');
  assert.strictEqual(x.el('b-standort').value, 'Lager Süd', 'vorgewählter Standort wechselt bei Abfüllung aufs Hauptlager');
  x.tippen('b-standort', 'Lager Nord');
  x.waehlen('Promo');
  x.waehlen('Abfüllung');
  assert.strictEqual(x.el('b-standort').value, 'Lager Nord', 'selbst gewählter Standort bleibt');
});

test('Eintragen: Vorbelegen aus dem Lager (Inventur eintragen) wählt Art und Standort', () => {
  const x = laden();
  assert.strictEqual(x.S.eintragenVorbelegen('Inventur', 'Lager Nord'), true);
  assert.strictEqual(x.art(), 'Inventur');
  assert.strictEqual(x.el('b-standort').value, 'Lager Nord');
  assert.strictEqual(x.el('b-formular').hidden, false);
  assert.strictEqual(x.el('b-standort-label').textContent, 'Gezählt in');
  assert.strictEqual(x.S.eintragenVorbelegen('Quatsch', 'Lager Nord'), false);
  x.S.zustand.schreibt = true;
  assert.strictEqual(x.S.eintragenVorbelegen('Bruch', 'Lager Süd'), false, 'nicht während gespeichert wird');
});

test('Eintragen: während eine andere Schreib-Aktion läuft, bleibt „Speichern“ gesperrt (Codex-Befund)', () => {
  const x = laden();
  x.ausfuellen();
  x.S.eintragenPruefen();
  assert.strictEqual(x.el('buchen-senden').disabled, false);
  x.S.zustand.schreibt = true; // z. B. Storno oder Verkauf zuordnen läuft
  x.S.eintragenPruefen();
  assert.strictEqual(x.el('buchen-senden').disabled, true);
  assert.match(x.el('buchen-offen').textContent, /gespeichert/);
  x.S.zustand.schreibt = false;
  x.S.eintragenPruefen();
  assert.strictEqual(x.el('buchen-senden').disabled, false);
});
