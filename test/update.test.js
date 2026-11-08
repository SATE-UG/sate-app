'use strict';

// Automatisches Update (docs/update.js) mit Schein-Service-Worker: lädt nur neu, wenn nichts verloren geht, und pro
// Version höchstens einmal; sonst Banner. Die erste Installation (noch kein Controller) lädt nicht neu.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'docs', 'update.js'), 'utf8');
const warten = (ms) => new Promise((f) => setTimeout(f, ms || 20));

function welt(o) {
  const opt = Object.assign({ controller: true, version: 'v10', speicherKaputt: false }, o);
  const hoerer = { sw: {}, doc: {}, win: {} };
  const an = (ziel) => (t, f) => { (ziel[t] = ziel[t] || []).push(f); };
  const feuern = (ziel, t) => Promise.all((ziel[t] || []).map((f) => f({})));
  const speicher = {};
  const x = {
    neuGeladen: 0, gesucht: 0, dirty: false, version: opt.version, ansagen: [],
    banner: { hidden: true, hoerer: {}, addEventListener(t, f) { this.hoerer[t] = f; } },
    dialog: { open: false },
    code: { value: '' },
    anmelden: { hidden: true },
    zustand: { schreibt: false },
    speicher,
  };
  const reg = { update: async () => { x.gesucht++; } };
  const controller = { postMessage(nachricht, ports) { if (nachricht === 'version') ports[0].postMessage(x.version); } };
  const navigator = {
    serviceWorker: { controller: opt.controller ? controller : null, addEventListener: an(hoerer.sw), register: async () => reg },
  };
  const ids = { update: x.banner, dialog: x.dialog, code: x.code, anmelden: x.anmelden };
  const S = {
    zustand: x.zustand, el: (id) => ids[id],
    eintragenHatEingaben: () => x.dirty, frage: async () => true, melden() {}, ansagen(t) { x.ansagen.push(t); },
  };
  const sessionStorage = {
    getItem(k) { if (opt.speicherKaputt) throw new Error('nein'); return k in speicher ? speicher[k] : null; },
    setItem(k, v) { if (opt.speicherKaputt) throw new Error('nein'); speicher[k] = String(v); },
  };
  const document = { hidden: false, addEventListener: an(hoerer.doc) };
  const window = { SATE: S, sessionStorage, location: { reload() { x.neuGeladen++; } }, addEventListener: an(hoerer.win) };
  vm.runInContext(CODE, vm.createContext({ window, navigator, document, MessageChannel, setTimeout, clearTimeout, Date, Promise }));
  x.wechsel = async () => { navigator.serviceWorker.controller = controller; await feuern(hoerer.sw, 'controllerchange'); await warten(); };
  x.zurueck = async () => { await feuern(hoerer.doc, 'visibilitychange'); await warten(); };
  x.start = async () => { await feuern(hoerer.win, 'load'); await warten(); };
  return x;
}

test('Update: neue Version lädt einmal automatisch neu, dieselbe nicht nochmal (keine Schleife)', async () => {
  const x = welt();
  await x.start();
  assert.strictEqual(x.gesucht, 1, 'beim Start nach Updates gesucht');
  await x.wechsel();
  assert.strictEqual(x.neuGeladen, 1);
  assert.strictEqual(x.speicher['sate.neuGeladenFuer'], 'v10');
  await x.wechsel(); // gleiche Version meldet sich nochmal (z. B. nach dem Neuladen)
  assert.strictEqual(x.neuGeladen, 1, 'nicht nochmal');
  assert.strictEqual(x.banner.hidden, false, 'stattdessen Banner');
  x.version = 'v11';
  await x.wechsel();
  assert.strictEqual(x.neuGeladen, 2, 'neue Version wieder einmal');
});

test('Update: mit Eingaben im Formular, offener Rückfrage oder laufendem Speichern nur Banner', async () => {
  const x = welt();
  x.dirty = true;
  await x.wechsel();
  assert.strictEqual(x.neuGeladen, 0, 'Formular nicht verlieren');
  assert.strictEqual(x.banner.hidden, false);
  assert.deepStrictEqual(x.ansagen, ['Neue Version der App bereit. Oben tippen zum Laden.'], 'VoiceOver hört vom Banner (einmal)');
  x.dirty = false;
  x.dialog.open = true;
  await x.zurueck();
  assert.strictEqual(x.neuGeladen, 0, 'Rückfrage offen');
  x.dialog.open = false;
  x.zustand.schreibt = true;
  await x.zurueck();
  assert.strictEqual(x.neuGeladen, 0, 'Speichern läuft');
  x.zustand.schreibt = false;
  await x.zurueck();
  assert.strictEqual(x.neuGeladen, 1, 'beim Zurückkehren mit leerem Formular jetzt laden');
});

test('Update: Banner antippen lädt neu (bei Eingaben erst nach Rückfrage)', async () => {
  const x = welt();
  x.dirty = true;
  await x.wechsel();
  await x.banner.hoerer.click();
  assert.strictEqual(x.neuGeladen, 1);
});

test('Update: erste Installation (noch kein Controller) lädt nicht neu; ohne sessionStorage nur Banner', async () => {
  const x = welt({ controller: false });
  await x.wechsel();
  assert.strictEqual(x.neuGeladen, 0);
  assert.strictEqual(x.banner.hidden, true);
  const y = welt({ speicherKaputt: true });
  await y.wechsel();
  assert.strictEqual(y.neuGeladen, 0, 'ohne Merker kein automatisches Neuladen');
  assert.strictEqual(y.banner.hidden, false);
});

test('Update: beim Zurückkehren in die App höchstens einmal pro Minute suchen', async () => {
  const x = welt();
  await x.start();
  await x.zurueck();
  assert.strictEqual(x.gesucht, 1, 'direkt nach dem Start nicht nochmal');
});
