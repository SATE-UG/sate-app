/**
 * Reine Lager-Logik ohne Google-Dienste (unter Node testbar, siehe test/lager.test.js).
 * Datumswerte sind hier immer Texte `JJJJ-MM-TT` (Kalendertag in Europe/Berlin), Monate `JJJJ-MM`.
 * Zellen wandelt zelleDatum() um; Datumsobjekte formatiert eine Funktion von außen (Utilities.formatDate).
 */

// Datum ----------------------------------------------------------------------------------------------------

/** Echtes Datumsobjekt (auch aus einem anderen JS-Kontext)? */
function istDatumObjekt(w) {
  return Object.prototype.toString.call(w) === '[object Date]';
}

/** `JJJJ-MM-TT` ist ein echter Kalendertag? */
function datumGueltig(t) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(t));
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

const zwei_ = (n) => ('0' + n).slice(-2);
const utcText_ = (d) => d.getUTCFullYear() + '-' + zwei_(d.getUTCMonth() + 1) + '-' + zwei_(d.getUTCDate());
const utcAus_ = (t) => Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)));

/**
 * Sheets-Seriennummer (Tage seit 1899-12-30) → `JJJJ-MM-TT`. So liefert getValues() Zellen, die als ZAHL mit
 * Datumsmuster gespeichert sind (Altzeilen im Tab Verkäufe, Spalte A, Muster `MM.yyyy`). Nur 1954–2118, sonst null.
 * Nachkommastellen (Uhrzeit) zählen nicht. Wie sate-belege/src/BerichtLogik.js.
 */
function datumAusSeriennummer(n) {
  if (typeof n !== 'number' || !isFinite(n) || n < 20000 || n > 80000) return null;
  return utcText_(new Date((Math.floor(n) - 25569) * 86400000));
}

/** Text `JJJJ-MM-TT` oder `TT.MM.JJJJ` (auch mit Uhrzeit dahinter) → `JJJJ-MM-TT`; sonst null. */
function datumAusText(text) {
  const t = String(text || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+Z?)?$/.exec(t);
  let d = m ? m[1] + '-' + m[2] + '-' + m[3] : null;
  if (!m) {
    m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,? \d{1,2}:\d{2}(?::\d{2})?)?$/.exec(t);
    if (m) d = m[3] + '-' + zwei_(m[2]) + '-' + zwei_(m[1]);
  }
  return d && datumGueltig(d) ? d : null;
}

/** Text `MM.JJJJ` oder `JJJJ-MM` → `JJJJ-MM`; sonst null. */
function monatAusText(text) {
  const t = String(text || '').trim();
  let m = /^(\d{1,2})\.(\d{4})$/.exec(t);
  if (m) return Number(m[1]) >= 1 && Number(m[1]) <= 12 ? m[2] + '-' + zwei_(m[1]) : null;
  m = /^(\d{4})-(\d{2})$/.exec(t);
  if (m) return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? t : null;
  return null;
}

/** Zelle (Datum, Seriennummer oder Text) → `JJJJ-MM-TT` oder null. `formatieren(date)` → `JJJJ-MM-TT` (Berlin). */
function zelleDatum(wert, formatieren) {
  if (istDatumObjekt(wert)) return isNaN(wert.getTime()) ? null : formatieren(wert);
  if (typeof wert === 'number') return datumAusSeriennummer(wert);
  if (typeof wert === 'string') return datumAusText(wert);
  return null;
}

/** Zelle → `JJJJ-MM` (Datum, Seriennummer, `MM.JJJJ`, `JJJJ-MM`) oder null. */
function zelleMonat(wert, formatieren) {
  const d = zelleDatum(wert, formatieren);
  if (d) return d.slice(0, 7);
  return typeof wert === 'string' ? monatAusText(wert) : null;
}

/** Zeitpunkt einer Zelle in ms (nur zum Ordnen, z. B. „Erfasst am“). Unlesbar → null. */
function zelleZeit(wert) {
  if (istDatumObjekt(wert)) return isNaN(wert.getTime()) ? null : wert.getTime();
  if (typeof wert === 'number') return isFinite(wert) && wert > 20000 && wert < 80000 ? Math.round((wert - 25569) * 86400000) : null;
  if (typeof wert !== 'string') return null;
  const t = wert.trim();
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (m) return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
  m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(t);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
  const d = datumAusText(t);
  return d ? utcAus_(d) : null;
}

/** monatPlus('2026-10', 3) → '2027-01'. */
function monatPlus(monat, n) {
  const j = Number(monat.slice(0, 4));
  const m = Number(monat.slice(5, 7)) - 1 + n;
  const jj = j + Math.floor(m / 12);
  return jj + '-' + zwei_(((m % 12) + 12) % 12 + 1);
}

/** Letzter Tag eines Monats: '2026-02' → '2026-02-28'. */
function monatsletzter(monat) {
  return utcText_(new Date(Date.UTC(Number(monat.slice(0, 4)), Number(monat.slice(5, 7)), 0)));
}

/** Datum + n Tage (n darf negativ sein und Nachkommastellen haben, die abgeschnitten werden). */
function tagePlus(datum, n) {
  return utcText_(new Date(utcAus_(datum) + Math.trunc(n) * 86400000));
}

/** Datum + n Kalendermonate, Tag am Monatsende gekappt: '2026-03-31' − 1 → '2026-02-28'. */
function monatePlus(datum, n) {
  const monat = monatPlus(datum.slice(0, 7), n);
  const letzter = monatsletzter(monat);
  const tag = Math.min(Number(datum.slice(8, 10)), Number(letzter.slice(8, 10)));
  return monat + '-' + zwei_(tag);
}

/** Tage von a bis b (b − a). */
function tageZwischen(a, b) {
  return Math.round((utcAus_(b) - utcAus_(a)) / 86400000);
}

const runde_ = (x, stellen) => {
  const f = Math.pow(10, stellen || 0);
  const r = Math.round(x * f) / f;
  return r === 0 ? 0 : r; // kein −0
};

/** Zelle → Zahl wie zahlLesen, zusätzlich „€“ und Minus-Zeichen (−, –) erlaubt. Leer/unlesbar → null. */
function betragLesen(wert) {
  if (typeof wert === 'string') wert = wert.replace(/€/g, '').replace(/^\s*[−–]/, '-');
  return zahlLesen(wert);
}

// Einstellungen --------------------------------------------------------------------------------------------

/**
 * Tab App-Einstellungen (Zeilen [A, B, C], erste Zeile Kopf) → Einstellungen. Gelesen nach Text in A, nicht nach
 * Zeilennummer. Fehlt eine Zeile oder ist der Wert unlesbar, gilt der Standardwert (mit Hinweis).
 */
function einstellungenLesen(zeilen) {
  const werte = {};
  (zeilen || []).forEach((z) => {
    const a = String((z && z[0]) || '').trim();
    if (a && !Object.prototype.hasOwnProperty.call(werte, a)) werte[a] = z[1];
  });
  const e = { hinweise: [] };
  EINSTELLUNGEN.forEach((d) => {
    const roh = werte[d.text];
    let w = null;
    if (roh !== undefined && roh !== '') {
      if (d.zahl) {
        w = zahlLesen(typeof roh === 'string' ? roh.trim() : roh);
        if (w !== null && (w < (d.min || 0) || (d.ganz && Math.floor(w) !== w))) w = null;
      } else {
        w = String(roh).trim() || null;
      }
    }
    if (w === null) {
      e.hinweise.push('Einstellung „' + d.text + '“ fehlt oder ist unlesbar, nehme ' + d.standard + '.');
      w = d.standard;
    }
    e[d.schluessel] = w;
  });
  e.standorte = String(e.standorte).split(';').map((s) => s.trim()).filter(Boolean)
    .filter((s, i, alle) => alle.indexOf(s) === i);
  ['standortVerkaeufe', 'standortBerlin'].forEach((k) => {
    if (e.standorte.indexOf(e[k]) < 0) e.hinweise.push('Einstellung: Standort „' + e[k] + '“ steht nicht in „Standorte“.');
  });
  e.hauptlager = e.standorte[0] || null;
  return e;
}

// Verkäufe im Lager ----------------------------------------------------------------------------------------

/** Regel 1: Spalte L, sonst Kanal Berlin → „Standort für Kanal Berlin“, sonst „Standort für Verkäufe“. */
function verkaufStandort(v, e) {
  if (v.standort) return v.standort;
  return v.kanal === 'Berlin' ? e.standortBerlin : e.standortVerkaeufe;
}

/**
 * Regel 2: Lagerdatum = Rechnungsdatum (B). Dörflinger-Rechnungen decken den Abverkauf des Vormonats → letzter Tag
 * des Vormonats. Ohne B (Altliste): letzter Tag des Monats aus A. Ohne beides → null.
 */
function verkaufLagerdatum(v) {
  if (v.datum) {
    if (String(v.kunde || '').toLowerCase().indexOf(KUNDE_VORMONAT) >= 0) return monatsletzter(monatPlus(v.datum.slice(0, 7), -1));
    return v.datum;
  }
  return v.monat ? monatsletzter(v.monat) : null;
}

// Lager-Log ------------------------------------------------------------------------------------------------

/** Art aus der Zelle (Groß/klein egal) → Schreibweise aus LAGER_ARTEN oder null. */
function lagerArt(wert) {
  const t = String(wert || '').trim().toLowerCase();
  return Object.keys(LAGER_ARTEN).find((a) => a.toLowerCase() === t) || null;
}

/** Schutz gegen verschobene Spalten: wirft, wenn ein erwarteter Spaltenkopf im Lager-Log fehlt. */
function lagerLogKopfPruefen(zeilen) {
  const kopf = (zeilen && zeilen[0]) || [];
  Object.keys(LL_KOPF).forEach((i) => {
    if (String(kopf[i] || '').trim() !== LL_KOPF[i]) throw new Error('Tab ' + LAGER_LOG_TAB + ': Spaltenkopf ' + LL_KOPF[i] + ' fehlt');
  });
}

/**
 * Tab Lager-Log (Zeilen A–J, erste Zeile Kopf) → gültige Buchungen ohne stornierte Zeilen (Regel 4).
 * Rückgabe { buchungen: [{zeile, datum, standort, art, flaschen, nach, id, erfasst}], hinweise }.
 * Ungültige Zeilen fallen mit Hinweis weg, leere Zeilen still.
 */
function lagerLogLesen(zeilen, formatieren, e) {
  const hinweise = [];
  lagerLogKopfPruefen(zeilen);
  const alle = [];
  const ids = Object.create(null); // ohne Prototyp: IDs wie „constructor“ sind normale Schlüssel
  for (let i = 1; i < zeilen.length; i++) {
    const z = zeilen[i];
    if (!z || z.every((w) => w === '' || w === null || w === undefined)) continue;
    const nr = i + 1;
    const id = String(z[LL.ID] === undefined ? '' : z[LL.ID]).trim();
    const art = lagerArt(z[LL.ART]);
    const b = { zeile: nr, art: art, id: id, stornoVon: String(z[LL.STORNO_VON] === undefined ? '' : z[LL.STORNO_VON]).trim() };
    if (art && art !== 'Storno' && id) ids[id] = true;
    if (!art) { hinweise.push('Lager-Log Zeile ' + nr + ': Art „' + String(z[LL.ART]) + '“ unbekannt, zählt nicht.'); continue; }
    if (art === 'Storno') { alle.push(b); continue; }
    b.datum = zelleDatum(z[LL.DATUM], formatieren);
    b.standort = String(z[LL.STANDORT] || '').trim() || (art === 'Abfüllung' ? e.hauptlager : '');
    b.flaschen = betragLesen(z[LL.FLASCHEN]);
    b.nach = String(z[LL.NACH] || '').trim();
    b.erfasst = zelleZeit(z[LL.ERFASST]);
    // Datumsobjekt = echter Zeitpunkt; Text/Seriennummer = Berliner Ortszeit (als UTC gelesen). Nur Gleichartiges vergleichen.
    b.erfasstEcht = istDatumObjekt(z[LL.ERFASST]);
    let fehler = null;
    if (!b.datum) fehler = 'Datum fehlt oder unlesbar';
    else if (e.standorte.indexOf(b.standort) < 0) fehler = 'Standort „' + b.standort + '“ unbekannt';
    else if (b.flaschen === null || b.flaschen < 0 || (b.flaschen === 0 && art !== 'Inventur')) fehler = 'Flaschen fehlen oder ungültig';
    else if (art === 'Umlagerung' && (e.standorte.indexOf(b.nach) < 0 || b.nach === b.standort)) fehler = 'Nach-Standort „' + b.nach + '“ ungültig';
    if (fehler) { hinweise.push('Lager-Log Zeile ' + nr + ': ' + fehler + ', zählt nicht.'); continue; }
    alle.push(b);
  }
  const storniert = Object.create(null);
  alle.filter((b) => b.art === 'Storno').forEach((s) => {
    if (s.stornoVon && ids[s.stornoVon]) storniert[s.stornoVon] = true;
    else hinweise.push('Lager-Log Zeile ' + s.zeile + ': Storno auf unbekannte ID „' + s.stornoVon + '“, ignoriert.');
  });
  const buchungen = alle.filter((b) => b.art !== 'Storno' && !(b.id && storniert[b.id]));
  return { buchungen: buchungen, hinweise: hinweise };
}

// Bestand --------------------------------------------------------------------------------------------------

/** Später erfasst? Erst „Erfasst am“ (wenn beide da, gleichartig und verschieden), sonst Zeilenreihenfolge. */
function spaeterErfasst_(a, b) {
  if (a.erfasst !== null && b.erfasst !== null && a.erfasstEcht === b.erfasstEcht && a.erfasst !== b.erfasst) return a.erfasst > b.erfasst;
  return a.zeile > b.zeile;
}

/**
 * Regeln 3 und 5: Bestand pro Standort aus der letzten gültigen Inventur plus Bewegungen danach.
 * `verkaeufe`: [{zeile, monat, datum, kanal, kunde, flaschen, standort}] (verkaeufeLesen).
 * Rückgabe { standorte: [{standort, bestand, letzteInventur, gezaehlt, schwund}], hinweise }.
 * bestand/letzteInventur/schwund = null, solange es keine Inventur gibt (Schwund auch bei der ersten Inventur).
 */
function lagerBerechnen(buchungen, verkaeufe, e) {
  const hinweise = [];
  const bewegungen = Object.create(null); // ohne Prototyp, Standortnamen sind frei wählbar
  const inventuren = Object.create(null);
  e.standorte.forEach((s) => { bewegungen[s] = []; inventuren[s] = Object.create(null); });
  buchungen.forEach((b) => {
    if (b.art === 'Inventur') {
      const alt = inventuren[b.standort][b.datum];
      if (!alt || spaeterErfasst_(b, alt)) inventuren[b.standort][b.datum] = b;
      return;
    }
    if (b.art === 'Umlagerung') {
      bewegungen[b.standort].push({ datum: b.datum, menge: -b.flaschen });
      bewegungen[b.nach].push({ datum: b.datum, menge: b.flaschen });
      return;
    }
    bewegungen[b.standort].push({ datum: b.datum, menge: LAGER_ARTEN[b.art] * b.flaschen });
  });
  const unbekannt = Object.create(null);
  verkaeufe.forEach((v) => {
    const s = verkaufStandort(v, e);
    const datum = verkaufLagerdatum(v);
    if (!bewegungen[s]) { unbekannt[s] = (unbekannt[s] || 0) + 1; return; }
    if (datum) bewegungen[s].push({ datum: datum, menge: -v.flaschen });
  });
  Object.keys(unbekannt).forEach((s) => hinweise.push('Verkäufe: Standort „' + s + '“ unbekannt (' + unbekannt[s] +
    ' Zeilen), zählt bei keinem Lager.'));

  const summe = (s, von, bis) => bewegungen[s].reduce((x, w) => x + ((von === null || w.datum > von) && (bis === null || w.datum <= bis) ? w.menge : 0), 0);
  const standorte = e.standorte.map((s) => {
    const tage = Object.keys(inventuren[s]).sort();
    if (!tage.length) return { standort: s, bestand: null, letzteInventur: null, gezaehlt: null, schwund: null };
    const letzte = inventuren[s][tage[tage.length - 1]];
    const vorige = tage.length > 1 ? inventuren[s][tage[tage.length - 2]] : null;
    const schwund = vorige ? runde_(vorige.flaschen + summe(s, vorige.datum, letzte.datum) - letzte.flaschen, 2) : null;
    return {
      standort: s, bestand: runde_(letzte.flaschen + summe(s, letzte.datum, null), 2), letzteInventur: letzte.datum,
      gezaehlt: letzte.flaschen, schwund: schwund,
    };
  });
  return { standorte: standorte, hinweise: hinweise };
}

/**
 * Regel 6: Haben alle Standorte eine Inventur → Summe (Quelle „inventur“). Sonst Summe der bekannten (summeBekannt)
 * und als Gesamtwert `rechnerisch` (Übersicht!B10, Quelle „rechnerisch“).
 */
function gesamtBestand(standorte, rechnerisch) {
  const bekannt = standorte.filter((s) => s.bestand !== null);
  const summeBekannt = runde_(bekannt.reduce((x, s) => x + s.bestand, 0), 2);
  const fehlen = standorte.filter((s) => s.bestand === null).map((s) => s.standort);
  if (!fehlen.length && standorte.length) return { wert: summeBekannt, quelle: 'inventur', summeBekannt: summeBekannt, fehlen: [] };
  return { wert: rechnerisch, quelle: 'rechnerisch', summeBekannt: bekannt.length ? summeBekannt : null, fehlen: fehlen };
}

// Abverkauf und Bestellung ---------------------------------------------------------------------------------

/**
 * Regel 7: Ø Flaschen pro Monat aus den letzten `n` vollen Kalendermonaten vor dem Monat von `heute` (Monat =
 * Rechnungsmonat aus A bzw. B). Rückgabe { wert (gerundet, zum Anzeigen), genau (ungerundet), von, bis, monate }.
 */
function abverkaufProMonat(verkaeufe, heute, n) {
  const bis = monatPlus(heute.slice(0, 7), -1);
  const von = monatPlus(heute.slice(0, 7), -n);
  const summe = verkaeufe.reduce((x, v) => x + (v.monat && v.monat >= von && v.monat <= bis ? v.flaschen : 0), 0);
  return { wert: runde_(summe / n, 1), genau: summe / n, von: von, bis: bis, monate: n };
}

/**
 * Regel 7: Reichweite (Monate) = (Gesamtbestand − Mindestbestand) / Ø; leer am = heute + Reichweite (Monat =
 * 365,25/12 Tage, negativ = schon vorbei); spätestens bestellen = leer am − Vorlaufzeit (Monate) − Puffer (Wochen).
 * Status: Termin vorbei → „jetzt bestellen“, höchstens BALD_TAGE entfernt → „bald“, sonst „ok“.
 * Ohne Bestand oder ohne Abverkauf (Ø ≤ 0) → alles null.
 */
function bestellStatus(gesamt, abverkauf, e, heute) {
  const leer = { reichweite: null, leerAm: null, spaetestensBestellen: null, status: null };
  if (typeof gesamt !== 'number' || !isFinite(gesamt) || !(abverkauf > 0)) return leer;
  const reichweite = (gesamt - e.mindestbestand) / abverkauf;
  const leerAm = tagePlus(heute, Math.floor(reichweite * TAGE_PRO_MONAT));
  const bestellen = tagePlus(monatePlus(leerAm, -e.vorlaufMonate), -Math.round(e.pufferWochen * 7));
  const tage = tageZwischen(heute, bestellen);
  return {
    reichweite: runde_(reichweite, 1), leerAm: leerAm, spaetestensBestellen: bestellen,
    status: tage < 0 ? 'jetzt bestellen' : tage <= BALD_TAGE ? 'bald' : 'ok',
  };
}

// Tab Lager ------------------------------------------------------------------------------------------------

/**
 * Werte für Lager!B2:F5. `namen`: Spalte A2:A5 (Standorte und „Summe“), `standorte` aus lagerBerechnen.
 * Pro Zeile [Bestand, Kisten, Letzte Inventur (`JJJJ-MM-TT` oder „noch keine“), Schwund, jetzt]. Unbekannte Namen
 * bleiben leer. Summe: Summe der bekannten Bestände, ohne vollständige Inventur steht in D der Hinweis.
 * Rückgabe { werte, fehlen } (fehlen = Standorte ohne Zeile im Tab).
 */
function lagerTabWerte(namen, standorte, flaschenProKiste, jetzt) {
  const kisten = (b) => (b === null ? '' : runde_(b / flaschenProKiste, 1));
  const leer = (x) => (x === null ? '' : x);
  const gefunden = {};
  const werte = namen.map((n) => {
    const name = String(n || '').trim();
    if (name === LAGER_SUMME) {
      const bekannt = standorte.filter((s) => s.bestand !== null);
      const summe = bekannt.length ? runde_(bekannt.reduce((x, s) => x + s.bestand, 0), 2) : null;
      const schwund = standorte.filter((s) => s.schwund !== null);
      return [leer(summe), kisten(summe),
        bekannt.length === standorte.length ? '' : bekannt.length + ' von ' + standorte.length + ' gezählt',
        schwund.length ? runde_(schwund.reduce((x, s) => x + s.schwund, 0), 2) : '', jetzt];
    }
    const s = standorte.find((x) => x.standort === name);
    if (!s) return ['', '', '', '', jetzt];
    gefunden[name] = true;
    return [leer(s.bestand), kisten(s.bestand), s.letzteInventur || 'noch keine', leer(s.schwund), jetzt];
  });
  return { werte: werte, fehlen: standorte.map((s) => s.standort).filter((s) => !gefunden[s]) };
}
