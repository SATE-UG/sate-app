/**
 * Web-App und Werkzeuge für Mark (Google-Dienste). Die Logik steckt in Logik.js.
 *
 * Mark führt im Apps-Script-Editor aus:
 *   einrichten()        einmal, damit Google die Berechtigung (Sheet lesen) abfragt
 *   codeAnlegen(name)   neuer Zugangscode für eine Person (ersetzt einen alten), steht einmal im Log
 *   codeSperren(name)   Code einer Person sperren
 *   codesAnzeigen()     Namen und Status (keine Codes, keine Hashes)
 * Codes nie loggen (außer einmal beim Anlegen), nie in URLs.
 */

/** Nur kurzer Text, keine Daten. */
function doGet() {
  return ContentService.createTextOutput('SATE-App-Schnittstelle. Bitte die App benutzen.');
}

/** Body: JSON { code, aktion } als text/plain (kein CORS-Preflight). Antwort immer JSON. */
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
  };
}

/** Tab „Übersicht“ im Sheet „SATE Verkäufe“ (ID aus Lokal.js). */
function tab_() {
  if (typeof LOKAL_SHEET_ID === 'undefined' || !LOKAL_SHEET_ID || LOKAL_SHEET_ID === 'HIER_SHEET_ID_EINTRAGEN') {
    throw new Error('LOKAL_SHEET_ID fehlt: api/src/Lokal.js aus api/Lokal.example.js anlegen und pushen');
  }
  const tab = SpreadsheetApp.openById(LOKAL_SHEET_ID).getSheetByName(UEBERSICHT_TAB);
  if (!tab) throw new Error('Tab „' + UEBERSICHT_TAB + '“ fehlt');
  return tab;
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
