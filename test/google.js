'use strict';

// Attrappen für die Google-Dienste (PropertiesService, SpreadsheetApp, Utilities, ContentService, LockService,
// CacheService, Logger, console, ScriptApp, UrlFetchApp), damit Api.js unter Node läuft. Alles liegt im Speicher (`welt`).
// Geschrieben werden darf nur Lager!B2:F5, eine Zeile A–J im Lager-Log, A–D in Abfüllungen, einzelne Zellen in
// Verkäufe Spalte L und im Tab Aufgaben Zellen einer Zeile in A–L ab Zeile 2 (siehe erlaubt()); jeder andere
// schreibende Aufruf wirft. Alle Schreibversuche landen in `welt.sheetSchreiben`, die geschriebenen Werte in
// `welt.schreibLog`. Die Tabs (`welt.tabs`) sind 2D-Arrays wie von getValues(); Übersicht ist nur lesbar
// (`welt.zellen`). Dazu LockService (tryLock) und CacheService. Neue Tabs legt nur insertSheet() an (`welt.neueTabs`):
// Solange so ein Tab leer ist, darf seine Kopfzeile geschrieben, fett gesetzt und fixiert werden.
//
// Tab Aufgaben mit Beispielzeilen (z. B. für einen lokalen Testserver), Helfer in test/daten.js:
//   welt.tabs['Aufgaben'] = [D.aufgabenKopf(),
//     D.aufgabenZeile({ id: 'A1', von: 'Jonas', fuer: 'Nina', titel: 'Kühlschrank auffüllen', faellig: '2026-11-25', uhrzeit: '09:30' }),
//     D.aufgabenZeile({ id: 'A2', von: 'Nina', fuer: 'Jonas', titel: 'Pfand wegbringen', status: 'erledigt', erledigtAm: '2026-11-20', erledigtVon: 'Jonas' })];
// Das Team sind die nicht gesperrten Zugangscodes: je Person einmal codeAnlegen('Name') aufrufen.
//
// Mitteilungen aufs Handy: UrlFetchApp.fetchAll() ruft nichts im Netz ab. Jede Anfrage landet in `welt.pushAnfragen`,
// der Statuscode kommt aus `welt.pushStatus` (Funktion (url) → Zahl oder Objekt url → Zahl, sonst 201), der Antworttext
// aus `welt.pushText` (Text oder Funktion (url) → Text). `welt.pushKaputt = true` oder Funktion (url) → true: Ein Abruf
// mit so einer Adresse wirft als Ganzes (Push-Dienst nicht erreichbar). Jeder Aufruf steht als 'push' in
// `welt.ereignisse`. Schreibende Zugriffe auf die Skripteigenschaften stehen in `welt.propsSchreiben`.

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
    // Aufgaben: per insertSheet() angelegte Tabs, fett gesetzte Bereiche, fixierte Zeilen je Tab
    neueTabs: [],
    fett: {},
    fixiert: {},
    // Reihenfolge von Sperre ('sperre'), Schreiben ('schreiben Tab!Bereich'), flush ('flush') und Freigabe ('frei')
    ereignisse: [],
    schreibFehler: null, // (tab, bereich) → true: dieser Schreibversuch wirft (nach dem Eintrag in sheetSchreiben)
    flushes: 0,
    // Mitteilungen aufs Handy: schreibende Zugriffe auf die Skripteigenschaften ('set Name', 'delete Name'), Anfragen an
    // die Push-Dienste, einstellbare Antworten
    propsSchreiben: [],
    pushAnfragen: [],
    pushStatus: null,
    pushText: '',
    pushKaputt: false,
  };

  /** Bytes wie in Apps Script (Java): Liste aus ganzen Zahlen von −128 bis 127, alles andere wirft. */
  function javaBytes(wert) {
    if (!Array.isArray(wert) || !wert.every((b) => Number.isInteger(b) && b >= -128 && b <= 127)) {
      throw new Error('Bytes mit Vorzeichen (−128 bis 127) erwartet');
    }
    return Buffer.from(wert.map((b) => b & 0xff));
  }

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

  /** Frisch per insertSheet() angelegter Tab, in dem noch nichts steht (nur dann darf die Kopfzeile geschrieben werden). */
  const neuUndLeer = (name) => welt.neueTabs.indexOf(name) >= 0 && (welt.tabs[name] || []).length === 0;

  /**
   * Erlaubte Schreibbereiche: Lager!B2:F<Summe> (bis 20 Zeilen), eine ganze Zeile A–J im Lager-Log, A–D in Abfüllungen (mit der
   * Kosten-Spalte A–E), eine Zelle in Verkäufe Spalte L, im Tab Aufgaben Zellen einer Zeile innerhalb von A–L ab Zeile 2
   * (die Kopfzeile A1:L1 nur in einem frisch angelegten, leeren Tab). Alles andere wirft (so fällt jeder Schreibversuch
   * in A–K der Verkäufe sofort auf).
   */
  function erlaubt(name, z, sp, nz, ns) {
    if (welt.schreibenKaputt[name]) return false;
    if (name === 'Aufgaben') {
      if (z === 0) return neuUndLeer(name) && sp === 0 && nz === 1 && ns === 12;
      return nz === 1 && sp >= 0 && ns >= 1 && sp + ns <= 12;
    }
    if (name === 'Lager') {
      // nur B2:F bis genau zur Zeile „Summe“ (darunter steht der Hinweistext)
      const summe = (welt.tabs.Lager || []).findIndex((r) => r && String(r[0] || '').trim() === 'Summe');
      return z === 1 && sp === 1 && ns === 5 && summe >= 1 && z + nz - 1 === summe;
    }
    if (name === 'Lager-Log') return z >= 1 && sp === 0 && nz === 1 && ns === 10;
    // A–D, mit der freiwilligen Kosten-Spalte (Kopf in E1) auch A–E
    if (name === 'Abfüllungen') {
      const mitKosten = String(((welt.tabs[name] || [])[0] || [])[4] || '').trim() === 'Kosten/Fl (€)';
      return z >= 1 && sp === 0 && nz === 1 && (ns === 4 || (ns === 5 && mitKosten));
    }
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
    const neuerTab = welt.neueTabs.indexOf(name) >= 0;
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
        welt.ereignisse.push('schreiben ' + name + '!' + text);
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
          const zeileOk = name === 'Abfüllungen' ? (sp <= 3 ? erlaubt(name, z, 0, 1, 4) : erlaubt(name, z, 0, 1, 5))
            : name === 'Aufgaben' ? z >= 1 && erlaubt(name, z, 0, 1, 12) : erlaubt(name, z, 0, 1, 10);
          // in einem frisch angelegten Tab auch ganze Spalten (Uhrzeit als Text)
          if (!zeileOk && !neuerTab && !(name === 'Lager' && text === 'B2:F5')) {
            throw new Error('Format in ' + name + '!' + text + ' nicht erlaubt');
          }
          welt.formate[name + '!' + text] = f;
        },
        setFontWeight: (g) => {
          if (!neuerTab) throw new Error('Schrift in ' + name + '!' + text + ' nicht erlaubt');
          welt.fett[name + '!' + text] = g;
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
      setFrozenRows: (n) => {
        if (!neuerTab) throw new Error('Fixieren in ' + name + ' nicht erlaubt');
        welt.fixiert[name] = n;
      },
    };
  }

  const globals = {
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      // Text mit UTF_8 oder Bytes mit Vorzeichen (ohne Zeichensatz)
      computeDigest: (alg, wert, charset) => {
        if (typeof wert !== 'string' && charset === undefined) return vorzeichen(crypto.createHash(alg).update(javaBytes(wert)).digest());
        if (typeof wert !== 'string' || charset !== 'utf8') throw new Error('nur Text mit UTF_8 erwartet');
        return vorzeichen(crypto.createHash(alg).update(wert, 'utf8').digest());
      },
      // Wie in Apps Script: erst die Daten, dann der Schlüssel, beide als Bytes mit Vorzeichen
      computeHmacSha256Signature: (wert, schluessel, ...mehr) => {
        if (mehr.length) throw new Error('nur Bytes erwartet');
        return vorzeichen(crypto.createHmac('sha256', javaBytes(schluessel)).update(javaBytes(wert)).digest());
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
        setProperty: (k, v) => { welt.propsSchreiben.push('set ' + k); welt.props[k] = String(v); },
        // mehrere auf einmal, die übrigen bleiben (ohne das zweite Argument deleteAllOthers)
        setProperties: (o, ...mehr) => {
          if (mehr.length) throw new Error('setProperties nur ohne deleteAllOthers');
          Object.keys(o).forEach((k) => { welt.propsSchreiben.push('set ' + k); welt.props[k] = String(o[k]); });
        },
        getProperties: () => Object.assign({}, welt.props),
        deleteProperty: (k) => { welt.propsSchreiben.push('delete ' + k); delete welt.props[k]; },
      }),
    },
    SpreadsheetApp: {
      flush: () => { welt.flushes++; welt.ereignisse.push('flush'); },
      openById: (id) => {
        welt.sheetIds.push(id);
        return {
          getSpreadsheetTimeZone: () => 'Europe/Berlin',
          getSheetByName: (n) => {
            if (n === 'Übersicht') return welt.tabFehlt ? null : tab;
            return welt.tabs[n] ? gitterTab(n) : null;
          },
          // Übersicht plus die Tabs im Speicher
          getNumSheets: () => Object.keys(welt.tabs).length + (welt.tabFehlt ? 0 : 1),
          // Neuer leerer Tab (nur aufgabenTabAnlegen); `index` = Platz in der Tab-Leiste, hier nur gemerkt
          insertSheet: (n, index) => {
            if (n === 'Übersicht' || welt.tabs[n]) throw new Error('Tab ' + n + ' gibt es schon');
            welt.sheetSchreiben.push('insertSheet ' + n + ' @' + index);
            welt.tabs[n] = [];
            welt.neueTabs.push(n);
            return gitterTab(n);
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
        waitLock: () => { welt.sperren.push('wait'); welt.ereignisse.push('sperre'); },
        tryLock: (ms) => {
          welt.sperren.push(ms);
          if (!welt.sperreBelegt) welt.ereignisse.push('sperre');
          return !welt.sperreBelegt;
        },
        releaseLock: () => { welt.freigaben++; welt.ereignisse.push('frei'); },
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
    UrlFetchApp: {
      // Mehrere Anfragen gleichzeitig. Nichts geht ins Netz: aufzeichnen und mit dem eingestellten Status antworten.
      fetchAll: (anfragen) => {
        welt.ereignisse.push('push');
        if (!Array.isArray(anfragen) || !anfragen.length) throw new Error('fetchAll braucht Anfragen');
        anfragen.forEach((a) => {
          if (typeof a.url !== 'string' || !/^https:\/\//.test(a.url)) throw new Error('Invalid argument: ' + a.url);
          Object.keys(a.headers || {}).forEach((h) => {
            if (typeof a.headers[h] !== 'string') throw new Error('Attribute provided with invalid value: Header:' + h);
          });
          welt.pushAnfragen.push(JSON.parse(JSON.stringify(a)));
        });
        // wie in Apps Script scheitert der ganze Abruf, und die Adresse steht in der Fehlermeldung (sie darf nie im Log landen)
        const kaputt = anfragen.find((a) => (typeof welt.pushKaputt === 'function' ? welt.pushKaputt(a.url) : welt.pushKaputt));
        if (kaputt) throw new Error('DNS error: ' + kaputt.url);
        return anfragen.map((a) => {
          const s = typeof welt.pushStatus === 'function' ? welt.pushStatus(a.url) : welt.pushStatus && welt.pushStatus[a.url];
          if (a.muteHttpExceptions !== true && s >= 400) throw new Error('Request failed for ' + a.url + ' returned code ' + s);
          return { getResponseCode: () => s || 201, getContentText: () => (typeof welt.pushText === 'function' ? welt.pushText(a.url) : welt.pushText) };
        });
      },
      fetch: () => { throw new Error('UrlFetchApp.fetch ist nicht vorgesehen'); },
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
