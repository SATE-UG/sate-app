'use strict';

// Attrappen für die Google-Dienste (PropertiesService, SpreadsheetApp, Utilities, ContentService, LockService,
// Logger, console, ScriptApp), damit Api.js unter Node läuft. Alles liegt im Speicher (`welt`).
// Das Sheet ist nur lesbar, außer Lager!B2:F5: jeder andere schreibende Aufruf wirft. Alle Schreibversuche landen
// in `welt.sheetSchreiben`. Die übrigen Tabs (`welt.tabs`) sind 2D-Arrays wie von getValues().

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
    zellen: { B8: 3000, B9: 0, B10: 8041, B11: 335, B12: 1103, B13: 7.3 },
    tabFehlt: false,
    uuids: 0,
    tabs: {},
    formate: {},
    trigger: [],
    triggerNr: 0,
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

  /** A1 → [zeile0, spalte0, zeilen, spalten], z. B. 'B2:F5' → [1, 1, 4, 5]. */
  function a1(text) {
    const m = /^([A-Z])(\d+)(?::([A-Z])(\d+))?$/.exec(text);
    if (!m) throw new Error('unbekannter Bereich ' + text);
    const sp = (c) => c.charCodeAt(0) - 65;
    const z1 = Number(m[2]) - 1;
    const s1 = sp(m[1]);
    return [z1, s1, Number(m[4] || m[2]) - z1, sp(m[3] || m[1]) - s1 + 1];
  }

  /** Tab aus `welt.tabs[name]` (2D-Array). Schreiben nur in Lager!B2:F5. */
  function gitterTab(name) {
    const daten = welt.tabs[name];
    const range = (z, sp, nz, ns, text) => ({
      getValues: () => {
        welt.sheetLesen.push(name + '!' + text);
        const aus = [];
        for (let r = 0; r < nz; r++) {
          const zeile = [];
          for (let c = 0; c < ns; c++) zeile.push(daten[z + r] && daten[z + r][sp + c] !== undefined ? daten[z + r][sp + c] : '');
          aus.push(zeile);
        }
        return aus;
      },
      setValues: (w) => {
        welt.sheetSchreiben.push(name + '!' + text);
        if (name !== 'Lager' || text !== 'B2:F5') throw new Error('Schreiben nur in Lager!B2:F5 erlaubt');
        if (w.length !== nz || w.some((x) => x.length !== ns)) throw new Error('Größe passt nicht');
        w.forEach((x, r) => { daten[z + r] = daten[z + r] || []; x.forEach((v, c) => { daten[z + r][sp + c] = v; }); });
      },
      setNumberFormats: (f) => {
        if (name !== 'Lager' || text !== 'B2:F5') throw new Error('Formate nur in Lager!B2:F5');
        welt.formate[name + '!' + text] = f;
      },
    });
    return {
      getDataRange: () => range(0, 0, daten.length, Math.max(0, ...daten.map((x) => x.length)), 'alles'),
      getRange: (text) => { const [z, sp, nz, ns] = a1(text); return range(z, sp, nz, ns, text); },
    };
  }

  const globals = {
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, wert, charset) => {
        if (typeof wert !== 'string' || charset !== 'utf8') throw new Error('nur Text mit UTF_8 erwartet');
        return vorzeichen(crypto.createHash(alg).update(wert, 'utf8').digest());
      },
      getUuid: () => { welt.uuids++; return crypto.randomUUID(); },
      formatDate: (d, zone, muster) => {
        if (muster !== 'yyyy-MM-dd') throw new Error('nur yyyy-MM-dd');
        return new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      },
    },
    ScriptApp: {
      newTrigger: (fn) => {
        const t = { fn: fn };
        const bauer = {
          timeBased: () => bauer, everyDays: (n) => { t.tage = n; return bauer; }, atHour: (h) => { t.stunde = h; return bauer; },
          inTimezone: (z) => { t.zone = z; return bauer; },
          create: () => {
            const id = 'trigger-' + (++welt.triggerNr);
            const obj = { getHandlerFunction: () => fn, getUniqueId: () => id, daten: t };
            welt.trigger.push(obj);
            return obj;
          },
        };
        return bauer;
      },
      getProjectTriggers: () => welt.trigger.slice(),
      deleteTrigger: (t) => { welt.trigger = welt.trigger.filter((x) => x !== t); },
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
        return {
          getSpreadsheetTimeZone: () => 'Europe/Berlin',
          getSheetByName: (n) => {
            if (n === 'Übersicht') return welt.tabFehlt ? null : tab;
            return welt.tabs[n] ? gitterTab(n) : null;
          },
        };
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
