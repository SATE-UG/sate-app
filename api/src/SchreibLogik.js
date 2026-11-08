/**
 * Schreib-Logik (Task 5) ohne Google-Dienste (unter Node testbar, siehe test/schreiben.test.js):
 * Eingaben prüfen, Zeilen für Lager-Log, Abfüllungen und Verkäufe!L bauen, Storno, Verlauf, Doppelklick-Schutz.
 * Geschrieben wird nur über die Funktionen der `umgebung` (Adapter in Api.js), immer unter der Skript-Sperre.
 */

// Texte und Zahlen -----------------------------------------------------------------------------------------

/**
 * Text sicher für eine Zelle: beginnt er mit = + - @ Tab/CR/LF (Formel) oder einer Ziffer (Sheets würde ihn als
 * Zahl/Datum lesen), kommt ein ' davor. Sheets speichert ihn dann als reinen Text (das ' sieht man nicht).
 */
function textSicher(wert) {
  const s = String(wert === null || wert === undefined ? '' : wert);
  return /^[=+\-@\t\r\n0-9]/.test(s) ? "'" + s : s;
}

/** Zellen einer Zeile: Texte über textSicher(), Zahlen und Datumswerte unverändert. */
function zellenSicher(werte) {
  return werte.map((w) => (typeof w === 'string' ? (w === '' ? '' : textSicher(w)) : w));
}

/** Steuerzeichen (auch Zeilenumbrüche) → Leerzeichen, Leerraum zusammenfassen, trimmen. Kein Text → null. */
function textBereinigen(wert) {
  if (wert === undefined || wert === null) return '';
  if (typeof wert !== 'string') return null;
  return wert.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Ganze Zahl ≥ 0 aus Zahl oder Ziffern-Text, sonst null. */
function ganzeZahl(wert) {
  if (typeof wert === 'number') return Number.isInteger(wert) && wert >= 0 ? wert : null;
  if (typeof wert === 'string' && /^\s*\d{1,9}\s*$/.test(wert)) return Number(wert.trim());
  return null;
}

/** `JJJJ-MM-TT` → `TT.MM.JJJJ`. */
function datumDeutsch(d) {
  return d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : '';
}

const leerZelle_ = (w) => w === '' || w === null || w === undefined || (typeof w === 'string' && !w.trim());

/**
 * Nächste freie Zeile (1 = erste Zeile) nach der letzten Zeile mit Inhalt in irgendeiner Spalte. `zeilen` =
 * getDataRange().getValues(); Zeilen mit nur Auswahllisten oder Leerzeichen zählen als leer, Lücken werden nicht
 * gefüllt (so überschreibt die App nie etwas, auch wenn getLastRow danebenliegt).
 */
function naechsteZeile(zeilen) {
  let i = (zeilen || []).length - 1;
  while (i >= 0 && (!zeilen[i] || zeilen[i].every(leerZelle_))) i--;
  return Math.max(i + 2, 2);
}

/** Zeile `nr` (1-basiert) in einem 2D-Array setzen, fehlende Zeilen dazwischen leer auffüllen. */
function zeileSetzen_(zeilen, nr, werte) {
  while (zeilen.length < nr - 1) zeilen.push([]);
  zeilen[nr - 1] = werte.slice();
}

/** ID für das Lager-Log: „L“ + Zeitstempel (Basis 36) + 4 Zufallszeichen, z. B. „LMH6ZK3QW-7F2A“. */
function idErzeugen(ms, zufall) {
  const z = String(zufall || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return 'L' + ms.toString(36).toUpperCase() + '-' + (z + '0000').slice(0, 4);
}

/**
 * Feste ID aus einer anfrageId (Doppelklick-Schutz ohne Cache): `hex` = SHA-256 (Hex) über Aktion, Name und
 * anfrageId, z. B. „LA-3F9C0A…“ (20 Hex-Zeichen). Dieselbe Anfrage ergibt immer dieselbe ID.
 */
function idAusAnfrage(hex) {
  return ANFRAGE_ID_PRAEFIX + String(hex).slice(0, ANFRAGE_ID_HEX).toUpperCase();
}

/** Zeile (0-basiert) im Lager-Log mit genau dieser ID (Spalte I), sonst -1. */
function lagerLogZeileZuId(zeilen, id) {
  for (let i = 1; i < (zeilen || []).length; i++) {
    const z = zeilen[i];
    if (z && String(z[LL.ID] === undefined || z[LL.ID] === null ? '' : z[LL.ID]).trim() === id) return i;
  }
  return -1;
}

/** Neue ID, die im Lager-Log noch nicht vorkommt. `zufall()` → Text (Utilities.getUuid). */
function neueId_(lagerLog, ms, zufall) {
  const vorhanden = Object.create(null);
  (lagerLog || []).forEach((z) => { if (z && z[LL.ID] !== undefined) vorhanden[String(z[LL.ID]).trim()] = true; });
  for (let i = 0; i < 20; i++) {
    const id = idErzeugen(ms, zufall());
    if (!vorhanden[id]) return id;
  }
  throw new Error('Keine freie ID gefunden');
}

// Buchen ---------------------------------------------------------------------------------------------------

/**
 * Prüft `{art, standort, nachStandort, flaschen, datum, kommentar}` gegen die Einstellungen `e` und `heute`.
 * Rückgabe { buchung: {art, standort, nach, flaschen, datum, kommentar} } oder { fehler }.
 */
function buchungPruefen(d, e, heute) {
  const art = typeof d.art === 'string' ? BUCHBARE_ARTEN.find((a) => a === d.art.trim()) : undefined;
  if (!art) return { fehler: FEHLER_ART };
  let standort = typeof d.standort === 'string' ? d.standort.trim() : '';
  if (!standort && art === 'Abfüllung') standort = e.hauptlager || '';
  if (e.standorte.indexOf(standort) < 0) return { fehler: FEHLER_STANDORT };
  let nach = '';
  if (art === 'Umlagerung') {
    nach = typeof d.nachStandort === 'string' ? d.nachStandort.trim() : '';
    if (e.standorte.indexOf(nach) < 0 || nach === standort) return { fehler: FEHLER_NACH };
  }
  const flaschen = ganzeZahl(d.flaschen);
  const min = art === 'Inventur' ? 0 : 1;
  if (flaschen === null || flaschen < min || flaschen > MAX_FLASCHEN) {
    return { fehler: art === 'Inventur' ? FEHLER_FLASCHEN_INVENTUR : FEHLER_FLASCHEN };
  }
  const datum = typeof d.datum === 'string' ? d.datum.trim() : '';
  if (!datumGueltig(datum)) return { fehler: FEHLER_DATUM };
  const abstand = tageZwischen(heute, datum);
  if (abstand > MAX_TAGE_ZUKUNFT) return { fehler: FEHLER_DATUM_ZUKUNFT };
  if (abstand < -MAX_TAGE_ZURUECK) return { fehler: FEHLER_DATUM_ALT };
  const kommentar = textBereinigen(d.kommentar);
  if (kommentar === null || Array.from(kommentar).length > MAX_KOMMENTAR) return { fehler: FEHLER_KOMMENTAR };
  return { buchung: { art: art, standort: standort, nach: nach, flaschen: flaschen, datum: datum, kommentar: kommentar } };
}

/**
 * Bestand pro Standort (lagerBerechnen) aus den Tabs, optional mit zusätzlichen Lager-Log-Zeilen. Wie in der
 * Übersicht zählt nichts mit Datum nach `heute`.
 */
function bestandProStandort(t, e, formatieren, zusatz, heute) {
  const vk = verkaeufeLesen(t.verkaeufe, formatieren);
  const log = lagerLogLesen(zusatz ? t.lagerLog.concat(zusatz) : t.lagerLog, formatieren, e, heute);
  return lagerBerechnen(log.buchungen, vk.verkaeufe, e, heute).standorte;
}

/**
 * Warnung, wenn ein betroffener Standort (mit Inventur) durch die Buchung ins Minus rutscht oder weiter fällt.
 * `vorher`/`nachher` aus bestandProStandort. Kein Problem → null.
 */
function negativWarnung(vorher, nachher, betroffen) {
  const teile = [];
  betroffen.forEach((s) => {
    const a = vorher.find((x) => x.standort === s);
    const n = nachher.find((x) => x.standort === s);
    if (!n || n.bestand === null || n.bestand >= 0) return;
    if (a && a.bestand !== null && n.bestand >= a.bestand) return;
    teile.push(s + ' ' + n.bestand + ' Flaschen');
  });
  return teile.length ? 'Danach wäre der Bestand negativ: ' + teile.join(', ') + '. Trotzdem eintragen?' : null;
}

/** Tab Abfüllungen: Kopf prüfen (Schutz gegen verschobene Spalten). */
function abfuellungenKopfPruefen(zeilen) {
  const kopf = (zeilen && zeilen[0]) || [];
  Object.keys(AB_KOPF).forEach((i) => {
    if (String(kopf[i] || '').trim() !== AB_KOPF[i]) throw new Error('Tab ' + ABFUELLUNGEN_TAB + ': Spaltenkopf ' + AB_KOPF[i] + ' fehlt');
  });
}

/**
 * Nächste Abfüllungsnummer: höchste Nummer aus „N. Abfüllung“ in Spalte A, die nicht durch eine Zeile
 * „Storno N. Abfüllung“ aufgehoben ist, plus 1 (ohne Abfüllungen: 1). So bekommt eine stornierte und neu
 * eingetragene Abfüllung wieder dieselbe Nummer.
 */
function abfuellungNummer(zeilen) {
  const zahl = Object.create(null);
  (zeilen || []).slice(1).forEach((z) => {
    const a = String((z && z[AB.NAME]) || '').trim();
    let m = /^(\d+)\.\s*Abfüllung$/i.exec(a);
    if (m) { zahl[m[1]] = (zahl[m[1]] || 0) + 1; return; }
    m = /^Storno\s+(\d+)\.\s*Abfüllung$/i.exec(a);
    if (m) zahl[m[1]] = (zahl[m[1]] || 0) - 1;
  });
  const aktiv = Object.keys(zahl).filter((n) => zahl[n] > 0).map(Number);
  return (aktiv.length ? Math.max.apply(null, aktiv) : 0) + 1;
}

/** Quelle (Spalte D) einer App-Abfüllung; die ID am Ende verbindet sie mit der Lager-Log-Zeile (für Storno). */
function abfuellungQuelle(wer, datum, id) {
  return 'SATE-App, ' + wer + ', ' + datum + ', ID ' + id;
}

/** Erste Zeile „N. Abfüllung“ im Tab Abfüllungen, deren Quelle auf „, ID <id>“ endet, sonst null. */
function abfuellungZeileZuId(zeilen, id) {
  const rest = (zeilen || []).slice(1);
  for (let i = 0; i < rest.length; i++) {
    const z = rest[i];
    const m = /, ID ([A-Za-z0-9_-]+)$/.exec(String((z && z[AB.QUELLE]) || '').trim());
    if (m && m[1] === id && /^\d+\.\s*Abfüllung$/i.test(String(z[AB.NAME] || '').trim())) return z;
  }
  return null;
}

// Storno ---------------------------------------------------------------------------------------------------

/**
 * Prüft, ob die Lager-Log-Zeile mit `id` storniert werden darf. Rückgabe { id, nr, zeile } (nr 1-basiert) oder
 * { fehler }. Nicht erlaubt: unbekannte ID, Storno-Zeile, schon storniert, ID mehrfach.
 */
function stornoPruefen(zeilen, idRoh) {
  const id = typeof idRoh === 'string' ? idRoh.trim() : '';
  if (!id || id.length > 64) return { fehler: FEHLER_STORNO_FEHLT };
  const treffer = [];
  let istStorno = false;
  let storniert = false;
  for (let i = 1; i < (zeilen || []).length; i++) {
    const z = zeilen[i] || [];
    const art = lagerArt(z[LL.ART]);
    if (art === 'Storno' && String(z[LL.STORNO_VON] === undefined ? '' : z[LL.STORNO_VON]).trim() === id) storniert = true;
    if (String(z[LL.ID] === undefined ? '' : z[LL.ID]).trim() !== id) continue;
    if (art === 'Storno') istStorno = true;
    else treffer.push(i);
  }
  if (!treffer.length) return { fehler: istStorno ? FEHLER_STORNO_STORNO : FEHLER_STORNO_FEHLT };
  if (treffer.length > 1) return { fehler: FEHLER_STORNO_MEHRFACH };
  if (storniert) return { fehler: FEHLER_STORNO_DOPPELT };
  return { id: id, nr: treffer[0] + 1, zeile: zeilen[treffer[0]] };
}

/** Kommentar der Storno-Zeile aus dem Original, z. B. „Storno: Umlagerung 50 Fl. Lager Süd → Lager Nord vom 02.11.2026“. */
function stornoKommentar(orig, formatieren) {
  const art = lagerArt(orig[LL.ART]) || String(orig[LL.ART] || '').trim();
  const fl = betragLesen(orig[LL.FLASCHEN]);
  const nach = String(orig[LL.NACH] || '').trim();
  const datum = zelleDatum(orig[LL.DATUM], formatieren);
  return textBereinigen('Storno: ' + art + (fl === null ? '' : ' ' + fl + ' Fl.') + ' ' + String(orig[LL.STANDORT] || '').trim() +
    (nach ? ' → ' + nach : '') + (datum ? ' vom ' + datumDeutsch(datum) : '')).slice(0, 300);
}

/**
 * Gegenzeile im Tab Abfüllungen für die stornierte Abfüllung `id` (Entscheidung Task 5: nichts löschen, sondern
 * „Storno N. Abfüllung“ mit negativen Flaschen anhängen; Übersicht!B8 summiert C2:C und stimmt damit wieder).
 * Rückgabe { werte } oder { hinweis } (keine passende Zeile, schon storniert, unlesbar → Mark korrigiert von Hand).
 */
function abfuellungStorno(zeilen, id, wer, heute) {
  const orig = abfuellungZeileZuId(zeilen, id);
  const schon = abfuellungGegenzeileDa(zeilen, id);
  const fl = orig ? betragLesen(orig[AB.FLASCHEN]) : null;
  if (!orig || schon || fl === null) {
    return { hinweis: 'Im Tab Abfüllungen gibt es keine passende App-Zeile zu dieser Abfüllung. Mark muss sie dort von Hand korrigieren.' };
  }
  return {
    werte: ['Storno ' + String(orig[AB.NAME]).trim(), orig[AB.MONAT], -fl, 'SATE-App, Storno von ID ' + id + ', ' + wer + ', ' + heute],
  };
}

/** Gibt es im Tab Abfüllungen schon die Gegenzeile zum Storno der Abfüllung `id`? */
function abfuellungGegenzeileDa(zeilen, id) {
  return (zeilen || []).slice(1).some((z) => String((z && z[AB.QUELLE]) || '').indexOf('Storno von ID ' + id + ',') >= 0);
}

// Verlauf --------------------------------------------------------------------------------------------------

/**
 * Letzte `n` Lager-Log-Einträge, neueste (unterste) zuerst. Pro Eintrag u. a. `storniert` und `stornierbar`
 * (hat ID, gültige Art, ist kein Storno und noch nicht storniert).
 */
function verlaufBauen(zeilen, formatieren, n) {
  lagerLogKopfPruefen(zeilen);
  const text = (w) => String(w === undefined || w === null ? '' : w).trim();
  const storniert = Object.create(null);
  const zaehler = Object.create(null);
  zeilen.slice(1).forEach((z) => {
    if (!z) return;
    if (lagerArt(z[LL.ART]) === 'Storno') { if (text(z[LL.STORNO_VON])) storniert[text(z[LL.STORNO_VON])] = true; return; }
    if (text(z[LL.ID])) zaehler[text(z[LL.ID])] = (zaehler[text(z[LL.ID])] || 0) + 1;
  });
  const aus = [];
  for (let i = zeilen.length - 1; i >= 1 && aus.length < n; i--) {
    const z = zeilen[i];
    if (!z || z.every(leerZelle_)) continue;
    const art = lagerArt(z[LL.ART]);
    const id = text(z[LL.ID]);
    const erfasst = z[LL.ERFASST];
    const st = art !== 'Storno' && !!id && storniert[id] === true;
    aus.push({
      zeile: i + 1, id: id, datum: zelleDatum(z[LL.DATUM], formatieren), standort: text(z[LL.STANDORT]),
      art: art || text(z[LL.ART]), flaschen: betragLesen(z[LL.FLASCHEN]), nach: text(z[LL.NACH]), wer: text(z[LL.WER]),
      kommentar: text(z[LL.KOMMENTAR]),
      erfasst: istDatumObjekt(erfasst) ? (isNaN(erfasst.getTime()) ? null : erfasst.toISOString()) : text(erfasst) || null,
      stornoVon: text(z[LL.STORNO_VON]), storniert: st,
      stornierbar: !!art && art !== 'Storno' && !!id && !st && zaehler[id] === 1,
    });
  }
  return aus;
}

// Verkäufe: Standort -----------------------------------------------------------------------------------------

/**
 * Für die App: Rechnungen mit Rechnungsdatum in den letzten VERKAUF_LISTE_TAGE Tagen, neueste zuerst, je
 * {rechnung, datum, kunde, kanal, flaschen, standort (effektiv), standortGesetzt (Spalte L belegt), gemischt}.
 */
function verkaufListeBauen(verkaeufe, e, heute) {
  const grenze = tagePlus(heute, -VERKAUF_LISTE_TAGE);
  const nach = Object.create(null);
  const liste = [];
  verkaeufe.forEach((v) => {
    if (!v.rechnung || !v.datum || v.datum < grenze) return;
    let r = nach[v.rechnung];
    if (!r) {
      r = nach[v.rechnung] = {
        rechnung: v.rechnung, datum: v.datum, kunde: v.kunde, kanal: v.kanal, flaschen: 0,
        standort: verkaufStandort(v, e), standortGesetzt: !!v.standort, gemischt: false,
      };
      liste.push(r);
    } else if (verkaufStandort(v, e) !== r.standort || !!v.standort !== r.standortGesetzt) {
      r.gemischt = true;
    }
    r.flaschen = runde_(r.flaschen + v.flaschen, 2);
  });
  return liste.sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : a.rechnung < b.rechnung ? 1 : -1))
    .slice(0, MAX_VERKAUF_LISTE);
}

/**
 * Prüft `{rechnung, standort}`: Standort aus den Einstellungen oder leer (= zurück auf Standard), Rechnung muss in
 * Spalte J stehen. Rückgabe { rechnung, standort, zeilen: [Zeilennummern 1-basiert] } oder { fehler }.
 */
function verkaufStandortPruefen(d, e, zeilen) {
  const rechnung = typeof d.rechnung === 'string' || typeof d.rechnung === 'number' ? String(d.rechnung).trim() : '';
  if (!rechnung || rechnung.length > 60) return { fehler: FEHLER_RECHNUNG };
  if (d.standort !== undefined && d.standort !== null && typeof d.standort !== 'string') return { fehler: FEHLER_STANDORT };
  const standort = (d.standort || '').trim();
  if (standort && e.standorte.indexOf(standort) < 0) return { fehler: FEHLER_STANDORT };
  const nr = [];
  for (let i = 1; i < (zeilen || []).length; i++) {
    const j = zeilen[i] && zeilen[i][VK.RECHNUNG];
    if (j !== undefined && j !== null && String(j).trim() === rechnung) nr.push(i + 1);
  }
  if (!nr.length) return { fehler: FEHLER_RECHNUNG };
  return { rechnung: rechnung, standort: standort, zeilen: nr };
}

// Ablauf ---------------------------------------------------------------------------------------------------

/**
 * Schreib-Aktionen `buchen`, `stornieren`, `verkaufStandort` (nur nach gültigem Code, `name` aus dem Code).
 * `u` (umgebung) liefert zusätzlich zu bearbeiten():
 *   mitSperre(fn) → { wert } oder { gesperrt: true }, cacheLesen(k) / cacheSchreiben(k, text),
 *   uebersichtLesen() → Übersicht!B8:B13 frisch (nach flush), datumZelle(`JJJJ-MM-TT`) → Date (Mitternacht Berlin),
 *   zufall() → Text, zeileSchreiben(tab, nr, zellen, formate), zelleSchreiben(tab, nr, spalte, wert),
 *   lagerTabSchreiben(uebersicht, jetzt).
 * Antwort { ok: true, id?, geaendert?, hinweise, uebersicht } bzw. { ok: false, fehler } oder
 * { ok: false, brauchtBestaetigung: true, warnung }.
 */
function schreibAktion(aktion, daten, name, u) {
  let schluessel = null;
  let festeId = null;
  if (daten.anfrageId !== undefined && daten.anfrageId !== null) {
    if (typeof daten.anfrageId !== 'string' || !ANFRAGE_ID_MUSTER.test(daten.anfrageId)) return { ok: false, fehler: FEHLER_ANFRAGE };
    schluessel = 'anfrage:' + u.sha256Hex(aktion + '\n' + name + '\n' + daten.anfrageId);
    // buchen/stornieren: feste Lager-Log-ID, damit eine Wiederholung auch ohne Cache auffällt (verkaufStandort
    // setzt nur Spalte L auf einen Wert und schadet doppelt nicht)
    if (aktion !== 'verkaufStandort') festeId = idAusAnfrage(u.sha256Hex('lager-log-id\n' + aktion + '\n' + name + '\n' + daten.anfrageId));
  }
  const r = u.mitSperre(() => {
    const jetzt = u.jetzt();
    const t = u.tabellen();
    if (schluessel) {
      const alt = cacheLesen_(u, schluessel);
      if (alt) return mitUebersicht_(Object.assign(alt, { wiederholt: true }), t, u, jetzt, false);
    }
    const e = einstellungenLesen(t.einstellungen);
    const heute = u.datumText(jetzt);
    if (festeId) {
      // Langsamer, sicherer Weg: steht die feste ID schon im (eben unter der Sperre gelesenen) Lager-Log?
      const schon = wiederholungImLog_(aktion, festeId, t);
      if (schon) {
        cacheSchreiben_(u, schluessel, schon);
        return mitUebersicht_(Object.assign({}, schon, { wiederholt: true }), t, u, jetzt, false);
      }
    }
    const erg = aktion === 'buchen' ? buchen_(daten, name, t, e, heute, jetzt, u, festeId)
      : aktion === 'stornieren' ? stornieren_(daten, name, t, e, heute, jetzt, u, festeId)
        : verkaufStandortSetzen_(daten, t, e, u, heute);
    if (!erg.ok) return erg;
    if (schluessel) cacheSchreiben_(u, schluessel, erg);
    return mitUebersicht_(erg, t, u, jetzt, true);
  });
  if (r.gesperrt) return { ok: false, fehler: FEHLER_BESCHAEFTIGT };
  return r.wert;
}

/**
 * Steht die Zeile mit der festen ID `id` schon im Lager-Log, wurde diese Anfrage schon geschrieben: Antwort wie beim
 * ersten Mal (ohne Übersicht), Hinweis, falls die Zeile in Abfüllungen fehlt. Sonst null.
 */
function wiederholungImLog_(aktion, id, t) {
  lagerLogKopfPruefen(t.lagerLog);
  const i = lagerLogZeileZuId(t.lagerLog, id);
  if (i < 0) return null;
  const z = t.lagerLog[i];
  const hinweise = [];
  if (aktion === 'buchen' && lagerArt(z[LL.ART]) === 'Abfüllung') {
    const ab = abfuellungZeileZuId(t.abfuellungen, id);
    hinweise.push(ab ? 'Im Tab Abfüllungen als „' + String(ab[AB.NAME]).trim() + '“ eingetragen.'
      : 'Im Lager-Log eingetragen, aber die Zeile im Tab Abfüllungen fehlt. Bitte Mark Bescheid geben.');
  } else if (aktion === 'stornieren') {
    const von = String(z[LL.STORNO_VON] === undefined || z[LL.STORNO_VON] === null ? '' : z[LL.STORNO_VON]).trim();
    const o = von ? lagerLogZeileZuId(t.lagerLog, von) : -1;
    if (o >= 0 && lagerArt(t.lagerLog[o][LL.ART]) === 'Abfüllung' && !abfuellungGegenzeileDa(t.abfuellungen, von)) {
      hinweise.push('Storniert, aber die Gegenzeile im Tab Abfüllungen fehlt. Mark muss sie dort von Hand korrigieren.');
    }
  }
  return { ok: true, id: id, hinweise: hinweise };
}

function cacheLesen_(u, k) {
  try {
    const t = u.cacheLesen(k);
    const o = t ? JSON.parse(t) : null;
    return o && o.ok === true ? o : null;
  } catch (err) {
    return null;
  }
}

function cacheSchreiben_(u, k, erg) {
  try { u.cacheSchreiben(k, JSON.stringify(erg)); } catch (err) { /* ohne Cache nur kein Doppelklick-Schutz */ }
}

/** Frische Übersicht dazu (aus den Tabs im Speicher plus Übersicht!B8:B13 neu), optional Tab Lager schreiben. */
function mitUebersicht_(erg, t, u, jetzt, lagerTab) {
  const hinweise = (erg.hinweise || []).slice();
  let ueb = null;
  try {
    t.uebersicht = u.uebersichtLesen();
    ueb = uebersichtBauen(t, u.datumText, jetzt);
  } catch (err) {
    hinweise.push('Eingetragen. Die Übersicht ließ sich gerade nicht berechnen, bitte neu laden.');
  }
  if (ueb && lagerTab) {
    try {
      u.lagerTabSchreiben(ueb, jetzt);
    } catch (err) {
      hinweise.push('Eingetragen. Der Tab Lager wurde nicht aktualisiert, das holt der tägliche Lauf nach.');
    }
  }
  return Object.assign({}, erg, { hinweise: hinweise, uebersicht: ueb });
}

function buchen_(daten, name, t, e, heute, jetzt, u, festeId) {
  const p = buchungPruefen(daten, e, heute);
  if (p.fehler) return { ok: false, fehler: p.fehler };
  const b = p.buchung;
  const vorher = bestandProStandort(t, e, u.datumText, null, heute); // prüft auch die Spaltenköpfe, bevor etwas geschrieben wird
  if (b.art === 'Abfüllung') abfuellungenKopfPruefen(t.abfuellungen);
  const id = festeId || neueId_(t.lagerLog, jetzt.getTime(), u.zufall);
  const zeile = [u.datumZelle(b.datum), b.standort, b.art, b.flaschen, b.nach, name, b.kommentar, jetzt, id, ''];
  const nachher = bestandProStandort(t, e, u.datumText, [zeile], heute);
  const warnung = negativWarnung(vorher, nachher, b.art === 'Umlagerung' ? [b.standort, b.nach] : [b.standort]);
  if (warnung && daten.bestaetigt !== true) return { ok: false, brauchtBestaetigung: true, warnung: warnung };

  const nr = naechsteZeile(t.lagerLog);
  u.zeileSchreiben(LAGER_LOG_TAB, nr, zellenSicher(zeile), LL_FORMATE);
  zeileSetzen_(t.lagerLog, nr, zeile);
  const hinweise = [];
  const schonDa = b.art === 'Abfüllung' ? abfuellungZeileZuId(t.abfuellungen, id) : null;
  if (schonDa) {
    // nicht doppelt anhängen (z. B. Lager-Log-Zeile von Hand gelöscht und Anfrage wiederholt)
    hinweise.push('Im Tab Abfüllungen stand diese Abfüllung schon als „' + String(schonDa[AB.NAME]).trim() + '“.');
  } else if (b.art === 'Abfüllung') {
    const nummer = abfuellungNummer(t.abfuellungen) + '. Abfüllung';
    const abf = [nummer, u.datumZelle(b.datum.slice(0, 7) + '-01'), b.flaschen, abfuellungQuelle(name, b.datum, id)];
    try {
      const anr = naechsteZeile(t.abfuellungen);
      u.zeileSchreiben(ABFUELLUNGEN_TAB, anr, zellenSicher(abf), AB_FORMATE);
      zeileSetzen_(t.abfuellungen, anr, abf);
      hinweise.push('Im Tab Abfüllungen als „' + nummer + '“ eingetragen.');
    } catch (err) {
      hinweise.push('Im Lager-Log eingetragen, aber die Zeile im Tab Abfüllungen fehlt. Bitte Mark Bescheid geben.');
    }
  }
  return { ok: true, id: id, hinweise: hinweise };
}

function stornieren_(daten, name, t, e, heute, jetzt, u, festeId) {
  lagerLogKopfPruefen(t.lagerLog);
  const p = stornoPruefen(t.lagerLog, daten.id);
  if (p.fehler) return { ok: false, fehler: p.fehler };
  const vorher = bestandProStandort(t, e, u.datumText, null, heute); // prüft auch die Spaltenköpfe, bevor etwas geschrieben wird
  const id = festeId || neueId_(t.lagerLog, jetzt.getTime(), u.zufall);
  const orig = p.zeile;
  const zeile = [u.datumZelle(heute), String(orig[LL.STANDORT] || '').trim(), 'Storno', '', '', name,
    stornoKommentar(orig, u.datumText), jetzt, id, p.id];
  // Storno einer Abfüllung oder Umlagerung kann einen Standort ins Minus bringen
  const warnung = negativWarnung(vorher, bestandProStandort(t, e, u.datumText, [zeile], heute), e.standorte);
  if (warnung && daten.bestaetigt !== true) return { ok: false, brauchtBestaetigung: true, warnung: warnung };
  const hinweise = [];
  let abf = null;
  if (lagerArt(orig[LL.ART]) === 'Abfüllung') {
    try {
      abfuellungenKopfPruefen(t.abfuellungen);
      abf = abfuellungStorno(t.abfuellungen, p.id, name, heute);
    } catch (err) {
      abf = { hinweis: 'Tab Abfüllungen unlesbar. Mark muss die Abfüllung dort von Hand korrigieren.' };
    }
  }
  const nr = naechsteZeile(t.lagerLog);
  u.zeileSchreiben(LAGER_LOG_TAB, nr, zellenSicher(zeile), LL_FORMATE);
  zeileSetzen_(t.lagerLog, nr, zeile);
  if (abf && abf.werte) {
    try {
      const anr = naechsteZeile(t.abfuellungen);
      u.zeileSchreiben(ABFUELLUNGEN_TAB, anr, zellenSicher(abf.werte), AB_FORMATE);
      zeileSetzen_(t.abfuellungen, anr, abf.werte);
      hinweise.push('Im Tab Abfüllungen als Gegenzeile „' + abf.werte[0] + '“ eingetragen.');
    } catch (err) {
      hinweise.push('Storniert, aber die Gegenzeile im Tab Abfüllungen fehlt. Mark muss sie dort von Hand korrigieren.');
    }
  } else if (abf) {
    hinweise.push(abf.hinweis);
  }
  return { ok: true, id: id, hinweise: hinweise };
}

function verkaufStandortSetzen_(daten, t, e, u, heute) {
  const vorher = bestandProStandort(t, e, u.datumText, null, heute); // prüft auch die Spaltenköpfe, bevor etwas geschrieben wird
  const p = verkaufStandortPruefen(daten, e, t.verkaeufe);
  if (p.fehler) return { ok: false, fehler: p.fehler };
  // Umhängen kann den neuen Standort ins Minus bringen: erst im Speicher durchrechnen
  const neu = t.verkaeufe.map((z, i) => {
    if (p.zeilen.indexOf(i + 1) < 0) return z;
    const kopie = z.slice();
    while (kopie.length <= VK.STANDORT) kopie.push('');
    kopie[VK.STANDORT] = p.standort;
    return kopie;
  });
  const warnung = negativWarnung(vorher, bestandProStandort(Object.assign({}, t, { verkaeufe: neu }), e, u.datumText, null, heute), e.standorte);
  if (warnung && daten.bestaetigt !== true) return { ok: false, brauchtBestaetigung: true, warnung: warnung };
  // Zeile für Zeile, nur Spalte L. Scheitert eine, kommen die schon geschriebenen auf den alten Wert zurück.
  const geschrieben = [];
  try {
    p.zeilen.forEach((nr) => {
      const z = t.verkaeufe[nr - 1];
      const alt = z.length > VK.STANDORT ? z[VK.STANDORT] : '';
      u.zelleSchreiben(VERKAEUFE_TAB, nr, VK.STANDORT + 1, p.standort ? textSicher(p.standort) : '');
      geschrieben.push({ nr: nr, alt: alt });
    });
  } catch (err) {
    let offen = false;
    geschrieben.reverse().forEach((g) => {
      try {
        u.zelleSchreiben(VERKAEUFE_TAB, g.nr, VK.STANDORT + 1, zelleZurueck_(g.alt));
      } catch (err2) {
        offen = true;
      }
    });
    return { ok: false, fehler: offen ? FEHLER_ZUORDNEN_TEILWEISE + ' (Rechnung ' + p.rechnung + ')' : FEHLER_ZUORDNEN };
  }
  p.zeilen.forEach((nr) => {
    const z = t.verkaeufe[nr - 1];
    while (z.length <= VK.STANDORT) z.push('');
    z[VK.STANDORT] = p.standort;
  });
  return {
    ok: true, geaendert: p.zeilen.length,
    hinweise: p.standort ? [] : ['Rechnung ' + p.rechnung + ' zählt wieder beim Standard-Standort.'],
  };
}

/** Alter Zellwert zum Zurückschreiben: Texte wieder gegen Formel-Injektion geschützt, leer bleibt leer. */
function zelleZurueck_(alt) {
  if (alt === null || alt === undefined) return '';
  return typeof alt === 'string' ? (alt === '' ? '' : textSicher(alt)) : alt;
}
