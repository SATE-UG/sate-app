'use strict';

// Lädt Apps-Script-Dateien aus api/src/ in einen gemeinsamen vm-Kontext (wie der globale Namensraum in Apps Script).
// Funktionsdeklarationen landen direkt auf dem Kontext, const-Werte holt `__k` heraus.
// Ohne Argumente nur die reinen Dateien; `ladeAlles(globals)` lädt zusätzlich Api.js und die Vorlage
// api/Lokal.example.js (statt der echten Lokal.js, die nicht im Git steht) mit Google-Attrappen (test/google.js).

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'api', 'src');

const KONSTANTEN = [
  'UEBERSICHT_TAB', 'ZELLE_BESTAND', 'ZELLE_REICHWEITE', 'BEREICH_KENNZAHLEN', 'CODE_ALPHABET', 'CODE_LAENGE',
  'CODE_PRAEFIX', 'SALZ_EIGENSCHAFT', 'HASH_VERSION', 'MAX_NAME_ZEICHEN', 'MAX_ANFRAGE_ZEICHEN',
  'FEHLER_CODE', 'FEHLER_ANFRAGE', 'FEHLER_AKTION', 'FEHLER_SERVER', 'LAGER_FORMATE', 'TRIGGER_FUNKTION',
  'FEHLER_BESCHAEFTIGT', 'LL_FORMATE', 'AB_FORMATE', 'MAX_KOMMENTAR',
];

const REIN = ['Konfig.js', 'Logik.js', 'LagerLogik.js', 'VerkaufLogik.js', 'UebersichtLogik.js', 'SchreibLogik.js'];
const ALLE = REIN.concat(['Api.js']);

function lade(globals, dateien, zusatz) {
  const code = (dateien || REIN).map((d) => fs.readFileSync(path.join(SRC, d), 'utf8')).concat(zusatz || []).join('\n;\n');
  const kontext = vm.createContext(Object.assign({}, globals || {}));
  vm.runInContext(code + '\n;globalThis.__k = {' + KONSTANTEN.join(',') + '};', kontext);
  return kontext;
}

/** Alle Dateien plus Lokal-Vorlage; `sheetId` ersetzt den Platzhalter (Standard: Test-ID). */
function ladeAlles(globals, sheetId) {
  const lokal = fs.readFileSync(path.join(__dirname, '..', 'api', 'Lokal.example.js'), 'utf8')
    .replace('HIER_SHEET_ID_EINTRAGEN', sheetId === undefined ? 'test-sheet-id' : sheetId);
  return lade(globals, ALLE, [lokal]);
}

/** Objekte aus dem vm-Kontext in normale Objekte wandeln (für deepStrictEqual). */
function roh(x) {
  return JSON.parse(JSON.stringify(x));
}

module.exports = { lade, ladeAlles, roh, SRC };
