/**
 * Web-App und Werkzeuge für Mark (Google-Dienste). Die Logik steckt in Logik.js.
 *
 * Mark führt im Apps-Script-Editor aus:
 *   einrichten()        einmal, damit Google die Berechtigung (Sheet lesen) abfragt
 *   codeAnlegen(name)   neuer Zugangscode für eine Person (ersetzt einen alten), steht einmal im Log
 *   codeSperren(name)   Code einer Person sperren
 *   codesAnzeigen()     Namen und Status (keine Codes, keine Hashes)
 *   lagerTabSchreiben() Bestand pro Standort nach Lager!B2:F… (bis zur Zeile „Summe“)
 *   triggerEinrichten() täglicher Trigger für taeglich() (7–8 Uhr), braucht den Scope script.scriptapp
 *   aufgabenTabAnlegen() einmal, legt den Tab „Aufgaben“ mit Kopfzeile an (nur wenn es ihn noch nicht gibt)
 *   pushEinrichten()    einmal, legt das Schlüsselpaar für Mitteilungen aufs Handy an (braucht den Scope script.external_request)
 *   pushTesten(name)    Mitteilung an die Geräte einer Person schicken, je Gerät steht der Status im Log
 *   pushAnzeigen()      Zahl der angemeldeten Geräte je Person (keine Adressen, keine Schlüssel)
 * Die Web-App schreibt (Task 5) nur über schreibAktion() (SchreibLogik.js): Zeilen ans Lager-Log und an Abfüllungen
 * anhängen, Verkäufe Spalte L, danach Lager!B2:F… . Dazu über aufgabenAktion() (AufgabenLogik.js) im Tab Aufgaben:
 * neue Zeile A–L anhängen bzw. einzelne Zellen einer Aufgabe ändern. Mitteilungen aufs Handy (PushLogik.js) stehen nur
 * in den Skripteigenschaften (`push:…`), nie im Sheet; gesendet wird ohne Inhalt an die Push-Dienste der Browser.
 * Codes nie loggen (außer einmal beim Anlegen), nie in URLs. Private Schlüssel und Adressen der Geräte nie loggen.
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
 * Schreibt den Bestand pro Standort nach Lager!B2:F<Zeile von „Summe“> (nur diese Zellen; Datumswerte als Datum,
 * Stand = jetzt). Die Zeilen ordnet Spalte A ab Zeile 2 zu (Standortnamen und „Summe“).
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
  const namen = lagerNamenBisSumme(tab.getRange(LAGER_NAMEN_BEREICH).getValues().map((z) => z[0]));
  if (!namen) throw new Error('Tab „' + LAGER_TAB + '“: Zeile „' + LAGER_SUMME + '“ in Spalte A fehlt');
  const aus = lagerTabWerte(namen, u.lager, u.kennzahlen.flaschenProKiste, jetzt);
  // Inventurdatum `JJJJ-MM-TT` → Datum (Mitternacht in der Zeitzone des Skripts, Europe/Berlin)
  const werte = aus.werte.map((z) => z.map((w) => (typeof w === 'string' && datumGueltig(w) ? datumZelle_(w) : w)));
  const bereich = tab.getRange(LAGER_ERSTE_ZEILE, 2, werte.length, LAGER_FORMATE.length);
  bereich.setValues(werte);
  bereich.setNumberFormats(werte.map(() => LAGER_FORMATE.slice()));
  Logger.log('Lager!' + bereich.getA1Notation() + ' geschrieben: ' + u.lager.map((s) => s.standort + ' ' +
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
 * Einmal im Editor ausführen (Aufgaben fürs Team): legt den Tab „Aufgaben“ ganz hinten an, mit der Kopfzeile A–L (fett,
 * erste Zeile fixiert) und der Spalte Uhrzeit als Text. Gibt es den Tab schon, bleibt er unberührt (auch mit falscher
 * Kopfzeile, das steht dann im Log). Loggt, was passiert ist.
 */
function aufgabenTabAnlegen() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = blatt_();
    const da = ss.getSheetByName(AUFGABEN_TAB);
    if (da) {
      const passt = aufgabenKopfPasst(da.getDataRange().getValues());
      Logger.log('Tab „' + AUFGABEN_TAB + '“ gibt es schon, nichts geändert.' + (passt ? ' Die Kopfzeile passt.'
        : ' Achtung: Die Kopfzeile passt nicht, die App zeigt die Aufgaben so nicht. Erwartet in A1 bis L1: ' + AUFGABEN_KOPF.join(', ')));
      return;
    }
    const tab = ss.insertSheet(AUFGABEN_TAB, ss.getNumSheets());
    const kopf = tab.getRange(1, 1, 1, AUFGABEN_KOPF.length);
    kopf.setValues([AUFGABEN_KOPF]);
    kopf.setFontWeight('bold');
    tab.setFrozenRows(1);
    // Uhrzeit als Text, auch für Zeilen von Hand: Sheets macht sonst aus „9:30“ eine Zeitzelle
    tab.getRange(1, AU.UHRZEIT + 1, tab.getMaxRows(), 1).setNumberFormat(AU_FORMATE[AU.UHRZEIT + 1]);
    Logger.log('Tab „' + AUFGABEN_TAB + '“ angelegt. Kopfzeile A1 bis L1: ' + AUFGABEN_KOPF.join(', '));
  } finally {
    lock.releaseLock();
  }
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

// Mitteilungen aufs Handy (Web Push) -----------------------------------------------------------------------

/**
 * Einmal im Editor ausführen: legt das Schlüsselpaar für die Mitteilungen an (privater Schlüssel aus Zufallsbytes,
 * gültig nur 1 ≤ d < n, sonst neu ziehen; der öffentliche wird daraus berechnet) und speichert beide in den
 * Skripteigenschaften. Ein vorhandenes Paar wird nie überschrieben: Mit einem neuen Schlüssel wären alle angemeldeten
 * Geräte verloren. Fehlt nur der öffentliche Schlüssel, wird er aus dem privaten neu berechnet. Im Log steht nur der
 * öffentliche Schlüssel, nie der private. Der erste Lauf nach dem Hochladen fragt die neue Berechtigung ab
 * (Verbindung zu externen Diensten, für die Push-Dienste).
 */
function pushEinrichten() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const privatText = props.getProperty(PUSH_PRIVAT_EIGENSCHAFT);
    const oeffentlichText = props.getProperty(PUSH_OEFFENTLICH_EIGENSCHAFT);
    const kaputt = 'Die Schlüssel für Mitteilungen in den Skripteigenschaften sind unvollständig oder passen nicht zusammen. ' +
      'Nichts geändert. Nur wenn noch kein Gerät angemeldet ist (pushAnzeigen): ' + PUSH_PRIVAT_EIGENSCHAFT + ' und ' +
      PUSH_OEFFENTLICH_EIGENSCHAFT + ' in den Projekteinstellungen löschen und pushEinrichten() noch einmal ausführen.';
    if (!privatText && !oeffentlichText) {
      let privat;
      do {
        privat = zufallsBytes_(P256_BYTES);
      } while (!pushPrivatGueltig(privat));
      const oeffentlich = base64urlAusBytes(pushOeffentlicherSchluessel(privat));
      const beide = {};
      beide[PUSH_PRIVAT_EIGENSCHAFT] = base64urlAusBytes(privat);
      beide[PUSH_OEFFENTLICH_EIGENSCHAFT] = oeffentlich;
      props.setProperties(beide); // beide in einem Schritt, die übrigen Skripteigenschaften bleiben
      Logger.log('Mitteilungen sind eingerichtet, alles bereit. Öffentlicher Schlüssel: ' + oeffentlich);
      return;
    }
    const privat = bytesAusBase64url(privatText);
    if (!privat || !pushPrivatGueltig(privat)) throw new Error(kaputt);
    const soll = base64urlAusBytes(pushOeffentlicherSchluessel(privat));
    if (!oeffentlichText) {
      props.setProperty(PUSH_OEFFENTLICH_EIGENSCHAFT, soll);
      Logger.log('Der öffentliche Schlüssel fehlte und ist aus dem privaten neu berechnet. Alles bereit. Öffentlicher Schlüssel: ' + soll);
      return;
    }
    if (oeffentlichText !== soll) throw new Error(kaputt);
    Logger.log('Mitteilungen sind schon eingerichtet, nichts geändert. Alles bereit. Öffentlicher Schlüssel: ' + soll);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Mitteilung an die Geräte von `name` schicken und je Gerät nur Kennung, HTTP-Status und die ersten 200 Zeichen der
 * Antwort loggen (für die Fehlersuche, z. B. `BadJwtToken` am iPhone). Üblich ist Status 201. Nie im Log: Adressen
 * der Geräte und Schlüssel (wiederholt der Push-Dienst die Adresse in seiner Antwort, nimmt pushLogText() sie heraus).
 * Im Editor über den Knopf pushTestenMark oder eine Hilfsfunktion aufrufen.
 */
function pushTesten(name) {
  const n = nameBereinigen(name);
  if (!n) throw new Error("Name fehlt oder ungültig. Aufruf z. B. pushTesten('Jonas') oder der Knopf pushTestenMark.");
  const eigenschaften = PropertiesService.getScriptProperties().getProperties();
  if (!pushSchluesselLesen(eigenschaften)) {
    Logger.log('Mitteilungen sind noch nicht eingerichtet: zuerst pushEinrichten() ausführen.');
    return;
  }
  let ergebnisse;
  try {
    ergebnisse = pushSendenRoh_(n, eigenschaften);
  } catch (err) {
    // Nur der Fehlertyp und die Meldung ohne Adressen
    const meldung = pushLogText(err && err.message, []);
    Logger.log('Senden gescheitert, kein Gerät hat die Mitteilung bekommen. ' + (err && err.name ? err.name : 'Fehler') + (meldung ? ': ' + meldung : ''));
    return;
  }
  if (!ergebnisse.length) {
    Logger.log('Für ' + n + ' ist kein Gerät angemeldet. In der App bei den Aufgaben die Mitteilungen einschalten.');
    return;
  }
  Logger.log('Mitteilung an ' + ergebnisse.length + (ergebnisse.length === 1 ? ' Gerät' : ' Geräte') + ' von ' + n + ' geschickt, üblich ist HTTP 201:\n' +
    ergebnisse.map((e) => 'Gerät ' + e.kennung + ': ' + (e.fehler ? 'Senden gescheitert (' + e.fehler + ')' : 'HTTP ' + e.status) +
      (e.entfernt ? ' (Gerät gibt es nicht mehr, Eintrag gelöscht)' : '') + (e.text ? ' ' + e.text : '')).join('\n'));
}

/** Loggt, ob die Mitteilungen eingerichtet sind, und je Person die Zahl der angemeldeten Geräte (keine Adressen, keine Schlüssel). */
function pushAnzeigen() {
  const eigenschaften = PropertiesService.getScriptProperties().getProperties();
  const zahl = Object.create(null);
  pushGeraeteLesen(eigenschaften).forEach((g) => { zahl[g.name] = (zahl[g.name] || 0) + 1; });
  const namen = Object.keys(zahl).sort();
  const kaputt = pushKaputteEintraege(eigenschaften);
  Logger.log((pushSchluesselLesen(eigenschaften) ? 'Mitteilungen sind eingerichtet.' : 'Mitteilungen sind noch nicht eingerichtet: pushEinrichten() ausführen.') + '\n' +
    (namen.length ? namen.map((n) => n + ': ' + zahl[n] + (zahl[n] === 1 ? ' Gerät' : ' Geräte')).join('\n') : 'Noch kein Gerät angemeldet.') +
    (kaputt ? '\nUnlesbare Einträge (an sie wird nicht gesendet): ' + kaputt : ''));
}

/**
 * Mitteilung ohne Inhalt an alle Geräte von `name` schicken: je Gerät ein POST mit leerem Body und den Kopfzeilen aus
 * pushAnfragen() (PushLogik.js), Weiterleitungen folgt die Anfrage nicht. Je Push-Dienst ein Abruf mit allen seinen
 * Geräten gleichzeitig (pushNachDienst): Ist ein Dienst nicht erreichbar, bekommen die Geräte bei den anderen ihre
 * Mitteilung trotzdem. Antwortet der Push-Dienst mit 404 oder 410, gibt es das Gerät nicht mehr: Sein Eintrag wird
 * gelöscht. Rückgabe je Gerät { kennung, status, fehler, text, entfernt } in der Reihenfolge der Geräte, ohne Geräte
 * eine leere Liste. `status` = HTTP-Status, oder null und in `fehler` der Fehlertyp, wenn der Abruf bei diesem Dienst
 * gescheitert ist; `text` = die ersten 200 Zeichen der Antwort bzw. Fehlermeldung ohne Adressen (pushLogText).
 */
function pushSendenRoh_(name, eigenschaften) {
  const plan = pushAnfragen(eigenschaften, name, Date.now(), sha256Bytes_, hmacSha256_);
  const ergebnisse = new Array(plan.length);
  pushNachDienst(plan).forEach((gruppe) => {
    let antworten;
    try {
      antworten = UrlFetchApp.fetchAll(gruppe.map((p) => ({
        url: p.url, method: 'post', headers: p.kopfzeilen, payload: '', muteHttpExceptions: true, followRedirects: false,
      })));
    } catch (err) {
      // z. B. Dienst nicht erreichbar: Die Meldung von Apps Script nennt die Adresse, deshalb nur bereinigt weiter
      const fehler = err && err.name ? String(err.name) : 'Fehler';
      const text = pushLogText(err && err.message, plan);
      gruppe.forEach((p) => { ergebnisse[plan.indexOf(p)] = { kennung: p.kennung, status: null, fehler: fehler, text: text, entfernt: false }; });
      return;
    }
    gruppe.forEach((p, i) => {
      const status = antworten[i].getResponseCode();
      let text = '';
      try {
        text = pushLogText(antworten[i].getContentText(), plan);
      } catch (err) {
        // Antwort ohne lesbaren Text: Der Status reicht
      }
      let entfernt = false;
      if (PUSH_STATUS_WEG.indexOf(status) >= 0) {
        try {
          pushEigenschaftAendern_(p.eigenschaft, null);
          entfernt = true;
        } catch (err) {
          // Löschen hat nicht geklappt: Der Eintrag fällt beim nächsten Senden weg
        }
      }
      ergebnisse[plan.indexOf(p)] = { kennung: p.kennung, status: status, fehler: '', text: text, entfernt: entfernt };
    });
  });
  return ergebnisse;
}

/**
 * Für die Aufgaben (umgebung_().pushSenden): Mitteilung an alle Geräte von `name`, Rückgabe = Zahl der Geräte, die
 * angenommen haben. Scheitert nie: Jeder Fehler wird geschluckt und zählt als 0. Im Log steht nur der Fehlertyp bzw.
 * der Statuscode, nie eine Adresse, ein Schlüssel oder etwas von der Aufgabe.
 */
function pushSenden_(name, eigenschaften) {
  try {
    const ergebnisse = pushSendenRoh_(name, eigenschaften);
    const abgelehnt = ergebnisse.filter((e) => !pushAngenommen(e.status));
    if (abgelehnt.length) console.warn('pushSenden: ' + abgelehnt.map((e) => e.fehler || 'Status ' + e.status).join(', '));
    return ergebnisse.length - abgelehnt.length;
  } catch (err) {
    console.error('pushSenden: ' + (err && err.name ? err.name : 'Fehler'));
    return 0;
  }
}

/** Einen Geräte-Eintrag `push:<Name>:<Kennung>` schreiben (Text) oder löschen (null). Jede andere Skripteigenschaft: Fehler. */
function pushEigenschaftAendern_(eigenschaft, text) {
  if (typeof eigenschaft !== 'string' || !PUSH_EIGENSCHAFT_MUSTER.test(eigenschaft)) throw new Error('Kein Geräte-Eintrag');
  const props = PropertiesService.getScriptProperties();
  if (text === null) props.deleteProperty(eigenschaft);
  else props.setProperty(eigenschaft, String(text));
}

/** Bytes (0–255) → Bytes mit Vorzeichen (−128 bis 127), wie die Utilities von Apps Script sie erwarten. */
function bytesMitVorzeichen_(bytes) {
  return Array.from(bytes, (b) => ((b & 0xff) > 127 ? (b & 0xff) - 256 : b & 0xff));
}

/** SHA-256 über Bytes (0–255) → 32 Bytes (0–255). */
function sha256Bytes_(bytes) {
  return Array.from(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytesMitVorzeichen_(bytes)), (b) => b & 0xff);
}

/** HMAC-SHA256 mit Schlüssel und Daten als Bytes (0–255) → 32 Bytes (0–255). Utilities will erst die Daten, dann den Schlüssel. */
function hmacSha256_(schluessel, daten) {
  return Array.from(Utilities.computeHmacSha256Signature(bytesMitVorzeichen_(daten), bytesMitVorzeichen_(schluessel)), (b) => b & 0xff);
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
    // Mit dem Team (Namen der nicht gesperrten Codes) für die Aufgaben: Die Übersicht selbst kennt keine Skripteigenschaften
    tabellen: () => Object.assign(tabellenLesen_(holenBlatt()), { team: teamNamen(eintraegeLesen(holen())) }),
    tabWerte: (name) => tabHolen_(holenBlatt(), name).getDataRange().getValues(),
    // Freiwilliger Tab (Aufgaben): fehlt er, null statt Fehler
    tabWerteFreiwillig: (name) => {
      const t = holenBlatt().getSheetByName(name);
      return t ? t.getDataRange().getValues() : null;
    },
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
    // Aufgaben: Zellen nebeneinander in einer bestehenden Zeile, nur aus aufgabenAktion() unter der Sperre
    zellenSchreiben: (name, nr, spalte, zellen, formate) => zellenSchreiben_(holenBlatt(), name, nr, spalte, zellen, formate),
    // Alles Geschriebene ins Sheet bringen, bevor die Sperre frei wird (sonst liest die nächste Anfrage den alten Stand)
    schreibenAbschliessen: () => SpreadsheetApp.flush(),
    lagerTabSchreiben: (u, jetzt) => lagerTabAusUebersicht_(holenBlatt(), u, jetzt),
    // Mitteilungen aufs Handy (PushLogik.js): alle Skripteigenschaften, wie sie zu Beginn der Anfrage gelesen wurden,
    // bzw. neu gelesen (unter der Sperre); schreiben und löschen geht nur für Geräte-Einträge `push:<Name>:<Kennung>`
    eigenschaften: () => holen(),
    eigenschaftenFrisch: () => {
      alle = null;
      return holen();
    },
    pushSchreiben: (eigenschaft, text) => {
      alle = null;
      pushEigenschaftAendern_(eigenschaft, text);
    },
    pushLoeschen: (eigenschaft) => {
      alle = null;
      pushEigenschaftAendern_(eigenschaft, null);
    },
    // Nur nach der Sperre: Mitteilung an alle Geräte einer Person, Rückgabe = Zahl der Geräte, die angenommen haben.
    // Die Geräte werden dafür neu gelesen: Seit dem Beginn der Anfrage kann sich eines ab- oder umgemeldet haben.
    pushSenden: (name) => {
      alle = null; // abgelaufene Geräte löscht das Senden
      try {
        return pushSenden_(name, PropertiesService.getScriptProperties().getProperties());
      } catch (err) {
        console.error('pushSenden: ' + (err && err.name ? err.name : 'Fehler'));
        return 0;
      }
    },
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

/**
 * Zellen nebeneinander in Zeile `nr` ab Spalte `spalte` (beide 1-basiert) mit einem setValues überschreiben (bestehende
 * Zeile ändern, z. B. den Status einer Aufgabe). Vorher die Zahlenformate einzelner Spalten (`formate`: {Spalte
 * 1-basiert: Muster}), damit setValues der letzte Schritt ist. Die Kopfzeile wird nie überschrieben.
 */
function zellenSchreiben_(ss, name, nr, spalte, zellen, formate) {
  if (!(nr >= 2) || !(spalte >= 1) || !zellen.length) throw new Error('Zellen ' + name + '!' + nr + ' nicht schreibbar');
  const tab = tabHolen_(ss, name);
  Object.keys(formate || {}).forEach((sp) => tab.getRange(nr, Number(sp)).setNumberFormat(formate[sp]));
  tab.getRange(nr, spalte, 1, zellen.length).setValues([zellen]);
}

/** Alle Tabs für uebersichtBauen(), je ein getValues() pro Tab. */
function tabellenLesen_(ss) {
  const tab = (name) => tabHolen_(ss, name);
  // Lexware-Kosten (seit v38) sind freiwillig: Fehlt der Tab, ist es null und alles andere läuft wie vorher
  const kosten = ss.getSheetByName(LEXWARE_KOSTEN_TAB);
  // Lexware-Rechnungen (seit v41) ebenso: Fehlt der Tab, ist es null und die App zeigt keine offenen Rechnungen
  const rechnungen = ss.getSheetByName(LEXWARE_RECHNUNGEN_TAB);
  // Lexware-GuV (seit v42) ebenso freiwillig: Fehlt der Tab, rechnet die App den Jahresgewinn nur aus den Belegen
  const guv = ss.getSheetByName(LEXWARE_GUV_TAB);
  // Aufgaben fürs Team ebenso freiwillig: Fehlt der Tab, ist es null und die App zeigt die Funktion nicht
  const aufgaben = ss.getSheetByName(AUFGABEN_TAB);
  return {
    verkaeufe: tab(VERKAEUFE_TAB).getDataRange().getValues(),
    lagerLog: tab(LAGER_LOG_TAB).getDataRange().getValues(),
    einstellungen: tab(EINSTELLUNGEN_TAB).getDataRange().getValues(),
    abfuellungen: tab(ABFUELLUNGEN_TAB).getDataRange().getValues(),
    uebersicht: tab(UEBERSICHT_TAB).getRange(BEREICH_UEBERSICHT).getValues(),
    lexwareKosten: kosten ? kosten.getDataRange().getValues() : null,
    lexwareRechnungen: rechnungen ? rechnungen.getDataRange().getValues() : null,
    lexwareGuv: guv ? guv.getDataRange().getValues() : null,
    aufgaben: aufgaben ? aufgaben.getDataRange().getValues() : null,
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
// Mitteilung an die eigenen Geräte schicken: Der Status je Gerät steht danach im Ausführungsprotokoll.
function pushTestenMark() { pushTesten('Mark'); }
