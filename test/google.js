'use strict';

// Attrappen für die Google-Dienste (PropertiesService, SpreadsheetApp, Utilities, ContentService, LockService,
// CacheService, Logger, console, ScriptApp), damit Api.js unter Node läuft. Alles liegt im Speicher (`welt`).
// Geschrieben werden darf nur Lager!B2:F5, eine Zeile A–J im Lager-Log, A–D in Abfüllungen und einzelne Zellen in
// Verkäufe Spalte L (siehe erlaubt()); jeder andere schreibende Aufruf wirft. Alle Schreibversuche landen in
// `welt.sheetSchreiben`, die geschriebenen Werte in `welt.schreibLog`. Die Tabs (`welt.tabs`) sind 2D-Arrays wie von
// getValues(); Übersicht ist nur lesbar (`welt.zellen`). Dazu LockService (tryLock) und CacheService.

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
    // Task 5: Schreiben, Sperre, Cache
    schreibLog: [],
    formeln: [],
    maxZeilen: {},
    eingefuegt: [],
    schreibenKaputt: {},
    formatKaputt: {},
    formelZellen: {},
    sperreBelegt: false,
    sperren: [],
    freigaben: 0,
    cache: {},
    cacheZeiten: [],
    cacheKaputt: false, // true: CacheService wirft (z. B. Dienst gestört)
    schreibFehler: null, // (tab, bereich) → true: dieser Schreibversuch wirft (nach dem Eintrag in sheetSchreiben)
    flushes: 0,
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
  /** [zeile0, spalte0, zeilen, spalten] → A1, z. B. [4, 0, 1, 10] → 'A5:J5'. */
  function zuA1(z, sp, nz, ns) {
    const b = (c) => String.fromCharCode(65 + c);
    const von = b(sp) + (z + 1);
    return nz === 1 && ns === 1 ? von : von + ':' + b(sp + ns - 1) + (z + nz);
  }

  /**
   * Erlaubte Schreibbereiche: Lager!B2:F<Summe> (bis 20 Zeilen), eine ganze Zeile A–J im Lager-Log, A–D in Abfüllungen, eine Zelle in
   * Verkäufe Spalte L. Alles andere wirft (so fällt jeder Schreibversuch in A–K der Verkäufe sofort auf).
   */
  function erlaubt(name, z, sp, nz, ns) {
    if (welt.schreibenKaputt[name]) return false;
    if (name === 'Lager') {
      // nur B2:F bis genau zur Zeile „Summe“ (darunter steht der Hinweistext)
      const summe = (welt.tabs.Lager || []).findIndex((r) => r && String(r[0] || '').trim() === 'Summe');
      return z === 1 && sp === 1 && ns === 5 && summe >= 1 && z + nz - 1 === summe;
    }
    if (name === 'Lager-Log') return z >= 1 && sp === 0 && nz === 1 && ns === 10;
    if (name === 'Abfüllungen') return z >= 1 && sp === 0 && nz === 1 && ns === 4;
    if (name === 'Verkäufe') return z >= 1 && sp === 11 && nz === 1 && ns === 1;
    return false;
  }

  /** Wie Sheets: ' am Anfang → Text ohne ', = am Anfang → Formel (landet in welt.formeln). */
  function zelleSpeichern(name, z, sp, v) {
    if (typeof v === 'string' && v[0] === "'") return v.slice(1);
    if (typeof v === 'string' && v[0] === '=') welt.formeln.push(name + '!' + zuA1(z, sp, 1, 1) + ' ' + v);
    return v;
  }

  /** Tab aus `welt.tabs[name]` (2D-Array). Schreiben nur in den erlaubten Bereichen. */
  function gitterTab(name) {
    const daten = welt.tabs[name];
    const range = (z, sp, nz, ns, text) => {
      const schreiben = (w) => {
        welt.sheetSchreiben.push(name + '!' + text);
        if (!erlaubt(name, z, sp, nz, ns)) throw new Error('Schreiben in ' + name + '!' + text + ' nicht erlaubt');
        if (welt.schreibFehler && welt.schreibFehler(name, text)) throw new Error('Schreibfehler ' + name + '!' + text);
        if (w.length !== nz || w.some((x) => x.length !== ns)) throw new Error('Größe passt nicht');
        w.forEach((x, r) => {
          daten[z + r] = daten[z + r] || [];
          x.forEach((v, c) => { daten[z + r][sp + c] = zelleSpeichern(name, z + r, sp + c, v); });
        });
        welt.schreibLog.push({ tab: name, bereich: text, werte: w.map((x) => x.slice()) });
      };
      return {
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
        getFormulas: () => {
          const aus = [];
          for (let r = 0; r < nz; r++) {
            const zeile = [];
            for (let c = 0; c < ns; c++) zeile.push(welt.formelZellen[name + '!' + zuA1(z + r, sp + c, 1, 1)] || '');
            aus.push(zeile);
          }
          return aus;
        },
        getA1Notation: () => text,
        setValues: schreiben,
        setValue: (v) => schreiben([[v]]),
        setNumberFormats: (f) => {
          if (!erlaubt(name, z, sp, nz, ns)) throw new Error('Formate nur in erlaubten Bereichen');
          welt.formate[name + '!' + text] = f;
        },
        setNumberFormat: (f) => {
          if (welt.formatKaputt[name]) throw new Error('Format kaputt');
          if (!erlaubt(name, z, 0, 1, name === 'Abfüllungen' ? 4 : 10) && !(name === 'Lager' && text === 'B2:F5')) {
            throw new Error('Format in ' + name + '!' + text + ' nicht erlaubt');
          }
          welt.formate[name + '!' + text] = f;
        },
      };
    };
    return {
      getDataRange: () => range(0, 0, daten.length, Math.max(0, ...daten.map((x) => x.length)), 'alles'),
      getRange: (a, b, c, d) => {
        if (typeof a === 'string') { const [z, sp, nz, ns] = a1(a); return range(z, sp, nz, ns, a); }
        const nz = c || 1;
        const ns = d || 1;
        return range(a - 1, b - 1, nz, ns, zuA1(a - 1, b - 1, nz, ns));
      },
      getMaxRows: () => welt.maxZeilen[name] || 1000,
      insertRowsAfter: (nach, n) => {
        welt.eingefuegt.push(name + ':' + nach + '+' + n);
        welt.maxZeilen[name] = (welt.maxZeilen[name] || 1000) + n;
      },
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
      flush: () => { welt.flushes++; },
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
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { welt.sperren.push('wait'); },
        tryLock: (ms) => { welt.sperren.push(ms); return !welt.sperreBelegt; },
        releaseLock: () => { welt.freigaben++; },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => {
          if (welt.cacheKaputt) throw new Error('Cache gestört');
          return Object.prototype.hasOwnProperty.call(welt.cache, k) ? welt.cache[k] : null;
        },
        put: (k, v, sek) => {
          if (welt.cacheKaputt) throw new Error('Cache gestört');
          welt.cache[k] = String(v);
          welt.cacheZeiten.push(sek);
        },
      }),
    },
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
