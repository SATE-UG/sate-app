/**
 * Web-App und Werkzeuge für Mark (Google-Dienste). Die Logik steckt in Logik.js.
 *
 * Mark führt im Apps-Script-Editor aus:
 *   einrichten()        einmal, damit Google die Berechtigung (Sheet lesen) abfragt
 *   codeAnlegen(name)   neuer Zugangscode für eine Person (ersetzt einen alten), steht einmal im Log
 *   codeSperren(name)   Code einer Person sperren
 *   codesAnzeigen()     Namen und Status (keine Codes, keine Hashes)
 *   lagerTabSchreiben() Bestand pro Standort nach Lager!B2:F5
 *   triggerEinrichten() täglicher Trigger für taeglich() (7–8 Uhr), braucht den Scope script.scriptapp
 * Die Web-App schreibt (Task 5) nur über schreibAktion() (SchreibLogik.js): Zeilen ans Lager-Log und an Abfüllungen
 * anhängen, Verkäufe Spalte L, danach Lager!B2:F5.
 * Codes nie loggen (außer einmal beim Anlegen), nie in URLs.
 */

/** Nur kurzer Text, keine Daten. */
function doGet() {
  return ContentService.createTextOutput('SATE-App-Schnittstelle. Bitte die App benutzen.');
}

/** Body: JSON { code, aktion, ... } als text/plain (kein CORS-Preflight). Antwort immer JSON. */
function doPost(e) {
  let antwort;
  try {
    const text = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
    antwort = bearbeiten(text, umgebung_());
  } catch (err) {
    // Nur der Fehlertyp, nie die Anfrage oder Teile davon (darin steht der Code).
    console.error('doPost: ' + (err && err.name ? err.name : 'Fehler'));
    antwort = { ok: false, fehler: FEHLER_SERVER };
  }
  return ContentService.createTextOutput(JSON.stringify(antwort)).setMimeType(ContentService.MimeType.JSON);
}

/** Einmal im Editor ausführen: liest Übersicht!B10 und loggt den Wert (löst die Berechtigungsabfrage aus). */
function einrichten() {
  const wert = tab_().getRange(ZELLE_BESTAND).getValue();
  Logger.log(UEBERSICHT_TAB + '!' + ZELLE_BESTAND + ' (Bestand Flaschen) = ' + wert);
}

/**
 * Schreibt den Bestand pro Standort nach Lager!B2:F5 (nur diese Zellen; Datumswerte als Datum, Stand = jetzt).
 * Die Zeilen ordnet Spalte A2:A5 zu (Standortnamen und „Summe“).
 */
function lagerTabSchreiben() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = blatt_();
    const jetzt = new Date();
    lagerTabAusUebersicht_(ss, uebersichtBauen(tabellenLesen_(ss), datumTextFunktion_(ss), jetzt), jetzt);
  } finally {
    lock.releaseLock();
  }
}

/** Lager!B2:F5 aus einer fertigen Übersicht (uebersichtBauen) schreiben. Ohne eigene Sperre. */
function lagerTabAusUebersicht_(ss, u, jetzt) {
  const tab = ss.getSheetByName(LAGER_TAB);
  if (!tab) throw new Error('Tab „' + LAGER_TAB + '“ fehlt');
  const namen = tab.getRange(LAGER_NAMEN_BEREICH).getValues().map((z) => z[0]);
  const aus = lagerTabWerte(namen, u.lager, u.kennzahlen.flaschenProKiste, jetzt);
  // Inventurdatum `JJJJ-MM-TT` → Datum (Mitternacht in der Zeitzone des Skripts, Europe/Berlin)
  const werte = aus.werte.map((z) => z.map((w) => (typeof w === 'string' && datumGueltig(w) ? datumZelle_(w) : w)));
  const bereich = tab.getRange(LAGER_BEREICH);
  bereich.setValues(werte);
  bereich.setNumberFormats(werte.map(() => LAGER_FORMATE.slice()));
  Logger.log('Lager!' + LAGER_BEREICH + ' geschrieben: ' + u.lager.map((s) => s.standort + ' ' +
    (s.bestand === null ? 'noch keine Inventur' : s.bestand)).join(', ') +
    (aus.fehlen.length ? '. Ohne Zeile im Tab Lager: ' + aus.fehlen.join(', ') : ''));
}

/** Täglich per Trigger (triggerEinrichten): Tab Lager aktualisieren. */
function taeglich() {
  lagerTabSchreiben();
}

/** Legt den täglichen Trigger für taeglich() an (7–8 Uhr Berlin) und löscht danach ältere gleichnamige. */
function triggerEinrichten() {
  const neu = ScriptApp.newTrigger(TRIGGER_FUNKTION).timeBased().everyDays(1).atHour(TRIGGER_STUNDE).inTimezone(ZEITZONE).create();
  let geloescht = 0;
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === TRIGGER_FUNKTION && t.getUniqueId() !== neu.getUniqueId()) {
      ScriptApp.deleteTrigger(t);
      geloescht++;
    }
  });
  Logger.log('Trigger für ' + TRIGGER_FUNKTION + '() täglich ' + TRIGGER_STUNDE + '–' + (TRIGGER_STUNDE + 1) + ' Uhr angelegt' +
    (geloescht ? ', ' + geloescht + ' alte gelöscht.' : '.'));
}

/**
 * Neuer Zugangscode für `name`. Gibt es die Person schon, ist ihr alter Code danach ungültig.
 * Im Editor über eine Hilfsfunktion aufrufen, z. B. `function neu() { codeAnlegen('Jonas'); }` (siehe README).
 */
function codeAnlegen(name) {
  const n = nameBereinigen(name);
  if (!n) throw new Error("Name fehlt oder ungültig. Aufruf z. B. codeAnlegen('Jonas'), siehe README.");
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    let salz = props.getProperty(SALZ_EIGENSCHAFT);
    if (!salz) {
      salz = hexAusBytes(zufallsBytes_(32));
      props.setProperty(SALZ_EIGENSCHAFT, salz);
    }
    const andere = eintraegeLesen(props.getProperties()).filter((e) => e.name !== n);
    let code;
    let hash;
    do {
      code = codeErzeugen(zufallsBytes_);
      hash = codeHash(salz, code, sha256Hex_);
    } while (andere.some((e) => gleich(e.hash, hash)));
    const vorher = props.getProperty(CODE_PRAEFIX + n);
    props.setProperty(CODE_PRAEFIX + n, JSON.stringify({ hash: hash, gesperrt: false, angelegt: new Date().toISOString() }));
    Logger.log('Zugangscode für ' + n + ': ' + codeAnzeigen(code) + '\nNur jetzt sichtbar, persönlich weitergeben.' +
      (vorher ? ' Der alte Code von ' + n + ' gilt ab sofort nicht mehr.' : ''));
  } finally {
    lock.releaseLock();
  }
}

/** Sperrt den Code von `name` (Eintrag bleibt, Status „gesperrt“). Neuer Code: codeAnlegen(name). */
function codeSperren(name) {
  const n = nameBereinigen(name);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const roh = n ? props.getProperty(CODE_PRAEFIX + n) : null;
    if (!roh) {
      const namen = eintraegeLesen(props.getProperties()).map((e) => e.name);
      throw new Error('Kein Code für „' + name + '“. Vorhanden: ' + (namen.join(', ') || 'keine'));
    }
    const e = JSON.parse(roh);
    e.gesperrt = true;
    e.gesperrtAm = new Date().toISOString();
    props.setProperty(CODE_PRAEFIX + n, JSON.stringify(e));
    Logger.log('Code von ' + n + ' ist gesperrt.');
  } finally {
    lock.releaseLock();
  }
}

/** Loggt Namen und Status, keine Codes und keine Hashes. */
function codesAnzeigen() {
  const liste = eintraegeLesen(PropertiesService.getScriptProperties().getProperties());
  if (!liste.length) {
    Logger.log('Noch keine Zugangscodes angelegt.');
    return;
  }
  Logger.log(liste.map((e) => e.name + ': ' + (e.gesperrt ? 'gesperrt seit ' + e.gesperrtAm.slice(0, 10)
    : 'aktiv seit ' + e.angelegt.slice(0, 10))).join('\n'));
}

// Adapter --------------------------------------------------------------------------------------------------

/** Google-Anbindung für bearbeiten() (Logik.js). Skripteigenschaften nur einmal pro Anfrage lesen. */
function umgebung_() {
  let alle = null;
  let blatt = null;
  const holen = () => (alle = alle || PropertiesService.getScriptProperties().getProperties());
  return {
    salz: () => holen()[SALZ_EIGENSCHAFT] || null,
    eintraege: () => eintraegeLesen(holen()),
    sha256Hex: sha256Hex_,
    kennzahlen: () => {
      const w = tab_().getRange(BEREICH_KENNZAHLEN).getValues();
      return { bestand: w[0][0], reichweite: w[3][0] };
    },
    jetzt: () => new Date(),
    tabellen: () => tabellenLesen_(holenBlatt()),
    tabWerte: (name) => tabHolen_(holenBlatt(), name).getDataRange().getValues(),
    datumText: (d) => datumTextFunktion_(holenBlatt())(d),
    // Schreiben (Task 5), nur aus schreibAktion() unter der Sperre
    mitSperre: (fn) => {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(SPERRE_MS)) return { gesperrt: true };
      try {
        return { wert: fn() };
      } finally {
        lock.releaseLock();
      }
    },
    cacheLesen: (k) => CacheService.getScriptCache().get(k),
    cacheSchreiben: (k, v) => CacheService.getScriptCache().put(k, v, ANFRAGE_CACHE_SEKUNDEN),
    uebersichtLesen: () => {
      SpreadsheetApp.flush();
      return tabHolen_(holenBlatt(), UEBERSICHT_TAB).getRange(BEREICH_UEBERSICHT).getValues();
    },
    datumZelle: datumZelle_,
    zufall: () => Utilities.getUuid(),
    zeileSchreiben: (name, nr, zellen, formate) => zeileSchreiben_(holenBlatt(), name, nr, zellen, formate),
    zelleSchreiben: (name, nr, spalte, wert) => tabHolen_(holenBlatt(), name).getRange(nr, spalte).setValue(wert),
    lagerTabSchreiben: (u, jetzt) => lagerTabAusUebersicht_(holenBlatt(), u, jetzt),
  };
  function holenBlatt() { return (blatt = blatt || blatt_()); }
}

/** Sheet „SATE Verkäufe“ (ID aus Lokal.js). */
function blatt_() {
  if (typeof LOKAL_SHEET_ID === 'undefined' || !LOKAL_SHEET_ID || LOKAL_SHEET_ID === 'HIER_SHEET_ID_EINTRAGEN') {
    throw new Error('LOKAL_SHEET_ID fehlt: api/src/Lokal.js aus api/Lokal.example.js anlegen und pushen');
  }
  return SpreadsheetApp.openById(LOKAL_SHEET_ID);
}

/** Tab „Übersicht“. */
function tab_() {
  const tab = blatt_().getSheetByName(UEBERSICHT_TAB);
  if (!tab) throw new Error('Tab „' + UEBERSICHT_TAB + '“ fehlt');
  return tab;
}

/** Datum → `JJJJ-MM-TT` in der Zeitzone des Sheets (Datumszellen meinen dessen Kalendertag), sonst Europe/Berlin. */
function datumTextFunktion_(ss) {
  const zone = (ss.getSpreadsheetTimeZone && ss.getSpreadsheetTimeZone()) || ZEITZONE;
  return (d) => Utilities.formatDate(d, zone, 'yyyy-MM-dd');
}

/** Tab nach Namen, fehlt er → Fehler. */
function tabHolen_(ss, name) {
  const t = ss.getSheetByName(name);
  if (!t) throw new Error('Tab „' + name + '“ fehlt');
  return t;
}

/** `JJJJ-MM-TT` → Datum um Mitternacht in der Zeitzone des Skripts (Europe/Berlin, siehe appsscript.json). */
function datumZelle_(text) {
  return new Date(Number(text.slice(0, 4)), Number(text.slice(5, 7)) - 1, Number(text.slice(8, 10)));
}

/**
 * Eine Zeile `nr` (1-basiert) ab Spalte A mit einem setValues schreiben. Vorher die Zahlenformate einzelner Spalten
 * (`formate`: {Spalte 1-basiert: Muster}), damit setValues der letzte Schritt ist (scheitert etwas, steht noch nichts
 * da). Reicht das Blatt nicht, kommen Zeilen unten dazu. Steht in der Zielzeile schon etwas (auch eine Formel, die
 * "" ergibt), wird nichts geschrieben.
 */
function zeileSchreiben_(ss, name, nr, zellen, formate) {
  const tab = tabHolen_(ss, name);
  const max = tab.getMaxRows();
  if (nr > max) tab.insertRowsAfter(max, nr - max);
  const ziel = tab.getRange(nr, 1, 1, zellen.length);
  const belegt = (z) => z.some((w) => w !== '' && w !== null);
  if (belegt(ziel.getFormulas()[0]) || belegt(ziel.getValues()[0].map((w) => (typeof w === 'string' ? w.trim() : w)))) {
    throw new Error('Zielzeile ' + name + '!' + nr + ' nicht leer');
  }
  Object.keys(formate || {}).forEach((sp) => tab.getRange(nr, Number(sp)).setNumberFormat(formate[sp]));
  ziel.setValues([zellen]);
}

/** Alle Tabs für uebersichtBauen(), je ein getValues() pro Tab. */
function tabellenLesen_(ss) {
  const tab = (name) => tabHolen_(ss, name);
  return {
    verkaeufe: tab(VERKAEUFE_TAB).getDataRange().getValues(),
    lagerLog: tab(LAGER_LOG_TAB).getDataRange().getValues(),
    einstellungen: tab(EINSTELLUNGEN_TAB).getDataRange().getValues(),
    abfuellungen: tab(ABFUELLUNGEN_TAB).getDataRange().getValues(),
    uebersicht: tab(UEBERSICHT_TAB).getRange(BEREICH_UEBERSICHT).getValues(),
  };
}

function sha256Hex_(text) {
  return hexAusBytes(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}

/** n Zufallsbytes: SHA-256 über zwei UUIDs (Utilities.getUuid, zufällige UUID v4), je Runde 32 Bytes. */
function zufallsBytes_(n) {
  const aus = [];
  while (aus.length < n) {
    const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + Date.now(), Utilities.Charset.UTF_8);
    for (let i = 0; i < d.length; i++) aus.push(d[i] & 0xff);
  }
  return aus.slice(0, n);
}

// Knöpfe für den Editor (der Editor startet Funktionen ohne Argument) -------------------------------------
// Auswählen und „Ausführen“: der neue Code steht danach einmal im Ausführungsprotokoll.
function codeAnlegenMark() { codeAnlegen('Mark'); }
function codeAnlegenJonas() { codeAnlegen('Jonas'); }
function codeAnlegenDave() { codeAnlegen('Dave'); }
function codeAnlegenJan() { codeAnlegen('Jan'); }
function codeAnlegenPaul() { codeAnlegen('Paul'); }
