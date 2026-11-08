'use strict';

// Attrappen für die Google-Dienste (PropertiesService, SpreadsheetApp, Utilities, ContentService, LockService,
// Logger, console), damit Api.js unter Node läuft. Alles liegt im Speicher (`welt`).
// Das Sheet ist nur lesbar: jeder schreibende Aufruf wirft und landet in `welt.sheetSchreiben`.

const crypto = require('node:crypto');

const vorzeichen = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));

function neueWelt() {
  const welt = {
    props: {},
    logs: [],
    fehlerLogs: [],
    sheetLesen: [],
    sheetSchreiben: [],
    sheetIds: [],
    // Übersicht!B10 und B13 wie im echten Sheet (Zahlen)
    zellen: { B10: 8041, B11: 335, B12: 1103, B13: 7.3 },
    tabFehlt: false,
    uuids: 0,
  };

  function bereich(a1) {
    welt.sheetLesen.push(a1);
    const verboten = () => { welt.sheetSchreiben.push(a1); throw new Error('Sheet ist nur lesbar'); };
    const m = /^B(\d+)(?::B(\d+))?$/.exec(a1);
    if (!m) throw new Error('unbekannter Bereich ' + a1);
    const von = Number(m[1]);
    const bis = Number(m[2] || m[1]);
    const werte = [];
    for (let r = von; r <= bis; r++) werte.push([welt.zellen['B' + r] === undefined ? '' : welt.zellen['B' + r]]);
    return {
      getValue: () => werte[0][0], getValues: () => werte.map((z) => z.slice()),
      setValue: verboten, setValues: verboten, clear: verboten, clearContent: verboten,
    };
  }

  const tab = { getRange: bereich, appendRow: () => { welt.sheetSchreiben.push('appendRow'); throw new Error('nur lesbar'); } };

  const globals = {
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, wert, charset) => {
        if (typeof wert !== 'string' || charset !== 'utf8') throw new Error('nur Text mit UTF_8 erwartet');
        return vorzeichen(crypto.createHash(alg).update(wert, 'utf8').digest());
      },
      getUuid: () => { welt.uuids++; return crypto.randomUUID(); },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (Object.prototype.hasOwnProperty.call(welt.props, k) ? welt.props[k] : null),
        setProperty: (k, v) => { welt.props[k] = String(v); },
        getProperties: () => Object.assign({}, welt.props),
        deleteProperty: (k) => { delete welt.props[k]; },
      }),
    },
    SpreadsheetApp: {
      openById: (id) => {
        welt.sheetIds.push(id);
        return { getSheetByName: (n) => (n === 'Übersicht' && !welt.tabFehlt ? tab : null) };
      },
    },
    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: (text) => {
        const aus = { text: String(text), mime: 'text/plain' };
        aus.setMimeType = (m) => { aus.mime = m; return aus; };
        aus.getContent = () => aus.text;
        return aus;
      },
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Logger: { log: (...a) => { welt.logs.push(a.map(String).join(' ')); } },
    console: {
      log: (...a) => { welt.logs.push(a.map(String).join(' ')); },
      error: (...a) => { welt.fehlerLogs.push(a.map(String).join(' ')); },
      warn: (...a) => { welt.fehlerLogs.push(a.map(String).join(' ')); },
    },
  };

  /** Alles, was das Skript irgendwo ausgegeben hat (Logs, Fehler-Logs, Skripteigenschaften). */
  welt.alleAusgaben = () => welt.logs.concat(welt.fehlerLogs, Object.keys(welt.props), Object.values(welt.props));

  return { welt: welt, globals: globals };
}

module.exports = { neueWelt };
