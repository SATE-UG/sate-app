/**
 * Aufgaben fürs Team ohne Google-Dienste (unter Node testbar, siehe test/aufgaben.test.js): Tab „Aufgaben“ lesen,
 * Eingaben prüfen, Aufgaben anlegen und ändern. Eine Zeile je Aufgabe, Änderungen in derselben Zeile, nichts wird
 * gelöscht. Geschrieben wird nur über die Funktionen der `umgebung` (Adapter in Api.js), immer unter der
 * Skript-Sperre und nur im Tab Aufgaben.
 */

// Lesen ----------------------------------------------------------------------------------------------------

/** Namen aller nicht gesperrten Zugangscodes (aus eintraegeLesen, dort schon nach Name sortiert): das Team. */
function teamNamen(eintraege) {
  return (eintraege || []).filter((e) => e && !e.gesperrt).map((e) => e.name);
}

/** Zelle → getrimmter Text (Zahlen als Text, leer → ''). */
const zellText_ = (w) => (w === undefined || w === null ? '' : String(w)).trim();

/** Passt die Kopfzeile des Tabs Aufgaben (A–L genau wie AUFGABEN_KOPF)? */
function aufgabenKopfPasst(zeilen) {
  const kopf = (zeilen && zeilen[0]) || [];
  return AUFGABEN_KOPF.every((t, i) => zellText_(kopf[i]) === t);
}

/**
 * Zelle der Spalte Uhrzeit → `HH:MM` oder ''. Die App schreibt Text; von Hand eingetragen geht auch „9:30“ oder
 * „09:30:00“. Alles andere (auch eine Zeitzelle, die Sheets als Datum liefert) → ''.
 */
function uhrzeitLesen(wert) {
  if (typeof wert !== 'string') return '';
  const m = /^'?(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(wert.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return '';
  return zwei_(Number(m[1])) + ':' + m[2];
}

/**
 * Eine Zeile des Tabs Aufgaben → { id, titel, fuer, von, faellig, uhrzeit, notiz, status, erstellt, erledigtAm,
 * erledigtVon }: alles Texte, Datum als `JJJJ-MM-TT`, Uhrzeit als `HH:MM`, leer = ''. `status` ist hier auch
 * `entfernt`. Nicht lesbar (ohne ID, ohne Text oder unbekannter Status) → null. Eine Uhrzeit gibt es nur mit
 * Fälligkeitsdatum, „Erledigt am“ und „Erledigt von“ nur bei Status `erledigt`.
 */
function aufgabeAusZeile(z, formatieren) {
  const id = zellText_(z[AU.ID]);
  const titel = zellText_(z[AU.TITEL]);
  const statusText = zellText_(z[AU.STATUS]).toLowerCase();
  const status = AUFGABE_STATUS.find((s) => s === statusText);
  if (!id || !titel || !status) return null;
  const faellig = zelleDatum(z[AU.FAELLIG], formatieren) || '';
  const erledigt = status === 'erledigt';
  return {
    id: id, titel: titel, fuer: zellText_(z[AU.FUER]), von: zellText_(z[AU.VON]), faellig: faellig,
    uhrzeit: faellig ? uhrzeitLesen(z[AU.UHRZEIT]) : '', notiz: zellText_(z[AU.NOTIZ]), status: status,
    erstellt: zelleDatum(z[AU.ERSTELLT], formatieren) || '',
    erledigtAm: erledigt ? zelleDatum(z[AU.ERLEDIGT_AM], formatieren) || '' : '',
    erledigtVon: erledigt ? zellText_(z[AU.ERLEDIGT_VON]) : '',
  };
}

/** Zeile (0-basiert) im Tab Aufgaben mit genau dieser ID (Spalte A), die oberste zählt. Sonst -1. */
function aufgabeZeileZuId(zeilen, id) {
  for (let i = 1; i < (zeilen || []).length; i++) {
    if (zeilen[i] && zellText_(zeilen[i][AU.ID]) === id) return i;
  }
  return -1;
}

/**
 * Tab Aufgaben (getValues, erste Zeile Kopf) → { team, liste, fehler } für die App. `team` = Namen für „Für“
 * (teamNamen), `liste` = die Aufgaben in der Reihenfolge des Tabs (Form wie aufgabeAusZeile, `status` nur `offen`
 * oder `erledigt`): Zeilen mit Status `entfernt` fehlen, ebenso erledigte, deren „Erledigt am“ mehr als
 * AUFGABE_ERLEDIGT_TAGE Tage vor `heute` (`JJJJ-MM-TT`) liegt. `fehler` = Zahl der Zeilen, die nicht lesbar sind (ohne
 * ID, ohne Text, unbekannter Status oder eine ID, die weiter oben schon steht); sie fehlen in der Liste. Je ID zählt
 * nur die oberste Zeile, auch wenn sie unlesbar ist (dieselbe Regel wie beim Ändern, aufgabeZeileZuId). Leere Zeilen
 * fallen still weg. Fehlt der Tab (`zeilen` kein Array): null. Passt die Kopfzeile nicht: null mit Hinweis.
 */
function aufgabenLesen(zeilen, team, formatieren, hinweise, heute) {
  if (!Array.isArray(zeilen)) return null;
  if (!aufgabenKopfPasst(zeilen)) {
    hinweise.push('Tab ' + AUFGABEN_TAB + ': Kopfzeile passt nicht, die Aufgaben fehlen in der App.');
    return null;
  }
  const liste = [];
  const gesehen = Object.create(null);
  let fehler = 0;
  for (let i = 1; i < zeilen.length; i++) {
    const z = zeilen[i] || [];
    if (z.slice(0, AUFGABEN_KOPF.length).every(leerZelle_)) continue;
    const id = zellText_(z[AU.ID]);
    const doppelt = !!id && gesehen[id] === true;
    if (id) gesehen[id] = true;
    const a = doppelt ? null : aufgabeAusZeile(z, formatieren);
    if (!a) { fehler++; continue; }
    if (a.status === 'entfernt') continue;
    if (a.status === 'erledigt' && a.erledigtAm && heute && tageZwischen(a.erledigtAm, heute) > AUFGABE_ERLEDIGT_TAGE) continue;
    liste.push(a);
  }
  return { team: (team || []).slice(), liste: liste, fehler: fehler };
}

// Prüfen ---------------------------------------------------------------------------------------------------

/**
 * Notiz bereinigen: Zeilenumbrüche bleiben (höchstens eine Leerzeile am Stück), jede Zeile wie textBereinigen()
 * (Steuerzeichen → Leerzeichen, Leerraum zusammengefasst). Nichts → '', kein Text → null.
 */
function notizBereinigen(wert) {
  if (wert === undefined || wert === null) return '';
  if (typeof wert !== 'string') return null;
  return wert.replace(/\r\n?|[\u2028\u2029]/g, '\n').split('\n').map(textBereinigen).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Text der Aufgabe: bereinigt (textBereinigen) 1 bis MAX_AUFGABE_TITEL Zeichen. Rückgabe { wert } oder { fehler }. */
function aufgabeTitelPruefen(w) {
  const s = typeof w === 'string' ? textBereinigen(w) : '';
  return s && Array.from(s).length <= MAX_AUFGABE_TITEL ? { wert: s } : { fehler: FEHLER_AUFGABE_TITEL };
}

/** „Für“: genau ein Name aus dem `team`. Rückgabe { wert } oder { fehler }. */
function aufgabeFuerPruefen(w, team) {
  const s = typeof w === 'string' ? w.trim() : '';
  return s && (team || []).indexOf(s) >= 0 ? { wert: s } : { fehler: FEHLER_AUFGABE_FUER };
}

/**
 * Fälligkeit: leer (auch null) oder ein echter Kalendertag `JJJJ-MM-TT`, dessen Jahr von dem Jahr von `heute` minus
 * AUFGABE_JAHRE_ZURUECK bis plus AUFGABE_JAHRE_VOR reicht. Rückgabe { wert } ('' = ohne Fälligkeit) oder { fehler }.
 */
function aufgabeFaelligPruefen(w, heute) {
  if (w === undefined || w === null) return { wert: '' };
  if (typeof w !== 'string') return { fehler: FEHLER_AUFGABE_FAELLIG };
  const s = w.trim();
  if (!s) return { wert: '' };
  if (!datumGueltig(s)) return { fehler: FEHLER_AUFGABE_FAELLIG };
  const von = Number(heute.slice(0, 4)) - AUFGABE_JAHRE_ZURUECK;
  const bis = Number(heute.slice(0, 4)) + AUFGABE_JAHRE_VOR;
  const jahr = Number(s.slice(0, 4));
  return jahr >= von && jahr <= bis ? { wert: s } : { fehler: FEHLER_AUFGABE_FAELLIG_JAHR + von + ' bis ' + bis };
}

/** Uhrzeit: leer (auch null) oder `HH:MM` von 00:00 bis 23:59. Rückgabe { wert } ('' = ohne Uhrzeit) oder { fehler }. */
function aufgabeUhrzeitPruefen(w) {
  if (w === undefined || w === null) return { wert: '' };
  if (typeof w !== 'string') return { fehler: FEHLER_AUFGABE_UHRZEIT };
  const s = w.trim();
  return !s || UHRZEIT_MUSTER.test(s) ? { wert: s } : { fehler: FEHLER_AUFGABE_UHRZEIT };
}

/** Notiz: bereinigt (notizBereinigen) höchstens MAX_AUFGABE_NOTIZ Zeichen. Rückgabe { wert } oder { fehler }. */
function aufgabeNotizPruefen(w) {
  const s = notizBereinigen(w);
  return s !== null && Array.from(s).length <= MAX_AUFGABE_NOTIZ ? { wert: s } : { fehler: FEHLER_AUFGABE_NOTIZ };
}

/**
 * Prüft `{titel, fuer, faellig, uhrzeit, notiz}` für eine neue Aufgabe gegen das `team` und `heute`. Eine Uhrzeit geht
 * nur zusammen mit einer Fälligkeit. Rückgabe { aufgabe: {titel, fuer, faellig, uhrzeit, notiz} } oder { fehler }.
 */
function aufgabePruefen(d, team, heute) {
  const titel = aufgabeTitelPruefen(d.titel);
  if (titel.fehler) return titel;
  const fuer = aufgabeFuerPruefen(d.fuer, team);
  if (fuer.fehler) return fuer;
  const faellig = aufgabeFaelligPruefen(d.faellig, heute);
  if (faellig.fehler) return faellig;
  const uhrzeit = aufgabeUhrzeitPruefen(d.uhrzeit);
  if (uhrzeit.fehler) return uhrzeit;
  if (uhrzeit.wert && !faellig.wert) return { fehler: FEHLER_AUFGABE_UHRZEIT_OHNE_DATUM };
  const notiz = aufgabeNotizPruefen(d.notiz);
  if (notiz.fehler) return notiz;
  return { aufgabe: { titel: titel.wert, fuer: fuer.wert, faellig: faellig.wert, uhrzeit: uhrzeit.wert, notiz: notiz.wert } };
}

/**
 * Prüft eine Änderung `{status, titel, fuer, faellig, uhrzeit, notiz}` an der Aufgabe `alt` (aufgabeAusZeile). Es zählen
 * nur Felder, die da sind (nicht `undefined`); leer oder null leert Fälligkeit, Uhrzeit bzw. Notiz. Gleiche Prüfungen
 * wie beim Anlegen, aber Text, „Für“, „Fällig“ und Notiz mit dem bisherigen Wert werden nicht neu geprüft (so scheitert
 * ein Formular, das alle Felder schickt, nicht an einer alten Fälligkeit, einer inzwischen gesperrten Person oder einem
 * von Hand eingetragenen, zu langen Text). Eine Uhrzeit braucht eine Fälligkeit in der Anfrage oder in der Zeile; ohne
 * Fälligkeit fällt auch die Uhrzeit weg.
 * Rückgabe { neu } mit nur den Feldern, die sich wirklich ändern (leer: alles ist schon so), oder { fehler }.
 */
function aufgabeAenderungPruefen(d, alt, team, heute) {
  const da = (k) => d[k] !== undefined;
  const gleich = (k) => typeof d[k] === 'string' && d[k].trim() === alt[k];
  if (!['status', 'titel', 'fuer', 'faellig', 'uhrzeit', 'notiz'].some(da)) return { fehler: FEHLER_AUFGABE_NICHTS };
  const neu = {};
  if (da('status')) {
    if (typeof d.status !== 'string' || AUFGABE_STATUS.indexOf(d.status) < 0) return { fehler: FEHLER_AUFGABE_STATUS };
    if (d.status !== alt.status) neu.status = d.status;
  }
  if (da('titel') && !gleich('titel')) {
    const p = aufgabeTitelPruefen(d.titel);
    if (p.fehler) return p;
    if (p.wert !== alt.titel) neu.titel = p.wert;
  }
  if (da('fuer') && !gleich('fuer')) {
    const p = aufgabeFuerPruefen(d.fuer, team);
    if (p.fehler) return p;
    neu.fuer = p.wert;
  }
  let faellig = alt.faellig;
  if (da('faellig') && !gleich('faellig')) {
    const p = aufgabeFaelligPruefen(d.faellig, heute);
    if (p.fehler) return p;
    faellig = p.wert;
    if (faellig !== alt.faellig) neu.faellig = faellig;
  }
  let uhrzeit = alt.uhrzeit;
  if (da('uhrzeit')) {
    const p = aufgabeUhrzeitPruefen(d.uhrzeit);
    if (p.fehler) return p;
    if (p.wert && !faellig) return { fehler: FEHLER_AUFGABE_UHRZEIT_OHNE_DATUM };
    uhrzeit = p.wert;
  }
  if (!faellig) uhrzeit = '';
  if (uhrzeit !== alt.uhrzeit) neu.uhrzeit = uhrzeit;
  if (da('notiz') && !gleich('notiz')) {
    const p = aufgabeNotizPruefen(d.notiz);
    if (p.fehler) return p;
    if (p.wert !== alt.notiz) neu.notiz = p.wert;
  }
  return { neu: neu };
}

// Zellen ---------------------------------------------------------------------------------------------------

/**
 * Text für eine Zelle im Tab Aufgaben: immer mit ' davor (strenger als textSicher(), das nur vor = + - @ und Ziffern
 * schützt). Sheets speichert ihn dann als reinen Text, das ' sieht man in der Zelle nicht. So wird nichts umgedeutet,
 * weder zur Formel noch zu Zahl, Datum („Mai 2027“) oder Wahrheitswert („WAHR“), und ein Text, der selbst mit '
 * beginnt, behält es: Beim Lesen kommt genau der Text heraus, den die Person eingegeben hat. Leer bleibt leer.
 */
function textGenau(wert) {
  const s = String(wert === null || wert === undefined ? '' : wert);
  return s === '' ? '' : "'" + s;
}

/** Zellen einer Zeile: Texte über textGenau(), Zahlen und Datumswerte unverändert. */
function zellenGenau(werte) {
  return werte.map((w) => (typeof w === 'string' ? textGenau(w) : w));
}

/**
 * Geprüfte Änderung `neu` (aufgabeAenderungPruefen) → neue Zellwerte der Zeile als Liste mit einem Platz je Spalte
 * (Rohwerte wie von getValues; `undefined` = Zelle bleibt, wie sie ist). „Geändert“ (`jetzt`) kommt immer dazu.
 * Status `erledigt` setzt „Erledigt am“ (`heute` als Datum) und „Erledigt von“ (`name`), zurück auf `offen` leert
 * beide. Wird die Fälligkeit geleert, auch die Uhrzeit. `datumZelle(JJJJ-MM-TT)` → Date.
 */
function aufgabeZellen(neu, name, heute, jetzt, datumZelle) {
  const z = new Array(AUFGABEN_KOPF.length).fill(undefined);
  if (neu.fuer !== undefined) z[AU.FUER] = neu.fuer;
  if (neu.titel !== undefined) z[AU.TITEL] = neu.titel;
  if (neu.faellig !== undefined) {
    z[AU.FAELLIG] = neu.faellig ? datumZelle(neu.faellig) : '';
    if (!neu.faellig) z[AU.UHRZEIT] = '';
  }
  if (neu.uhrzeit !== undefined) z[AU.UHRZEIT] = neu.uhrzeit;
  if (neu.notiz !== undefined) z[AU.NOTIZ] = neu.notiz;
  if (neu.status !== undefined) {
    z[AU.STATUS] = neu.status;
    if (neu.status === 'erledigt') {
      z[AU.ERLEDIGT_AM] = datumZelle(heute);
      z[AU.ERLEDIGT_VON] = name;
    } else if (neu.status === 'offen') {
      z[AU.ERLEDIGT_AM] = '';
      z[AU.ERLEDIGT_VON] = '';
    }
  }
  z[AU.GEAENDERT] = jetzt;
  return z;
}

/**
 * Zeile mit Lücken (`undefined`) → zusammenhängende Stücke [{ spalte (1-basiert), werte }], von links nach rechts.
 * Jedes Stück geht mit einem setValues ins Sheet.
 */
function zellenStuecke(zeile) {
  const aus = [];
  let stueck = null;
  for (let i = 0; i < zeile.length; i++) {
    if (zeile[i] === undefined) {
      stueck = null;
      continue;
    }
    if (!stueck) aus.push(stueck = { spalte: i + 1, werte: [] });
    stueck.werte.push(zeile[i]);
  }
  return aus;
}

/** Neue Zufalls-ID, die im Tab Aufgaben noch nicht vorkommt. `zufall()` → Text (Utilities.getUuid). */
function aufgabeNeueId_(zeilen, ms, zufall) {
  for (let i = 0; i < 20; i++) {
    const id = idErzeugen(ms, zufall(), AUFGABE_ID_PRAEFIX);
    if (aufgabeZeileZuId(zeilen, id) < 0) return id;
  }
  throw new Error('Keine freie ID gefunden');
}

// Ablauf ---------------------------------------------------------------------------------------------------

/**
 * Aktionen `aufgabeAnlegen` und `aufgabeAendern` (nur nach gültigem Code, `name` aus dem Code). Beide laufen unter der
 * Sperre und lesen und schreiben nur den Tab Aufgaben. `u` (umgebung) liefert zusätzlich zu bearbeiten():
 *   mitSperre(fn) → { wert } oder { gesperrt: true }, tabWerteFreiwillig(tab) → 2D-Array oder null (Tab fehlt),
 *   datumZelle(`JJJJ-MM-TT`) → Date (Mitternacht Berlin), zufall() → Text,
 *   zeileSchreiben(tab, nr, zellen, formate) für die neue Zeile,
 *   zellenSchreiben(tab, nr, spalte, zellen, formate) für Zellen nebeneinander in einer bestehenden Zeile,
 *   schreibenAbschliessen() bringt alles Geschriebene ins Sheet (flush), bevor die Sperre frei wird.
 * `aufgabeAnlegen`: Daten { titel, fuer, faellig?, uhrzeit?, notiz?, anfrageId? }, Antwort { ok: true, id, aufgaben }.
 * Mit anfrageId ist die ID fest daraus abgeleitet: Steht sie schon im Tab, wird nichts geschrieben und die Antwort
 * ist dieselbe (dazu `wiederholt: true`).
 * `aufgabeAendern`: Daten { id, status?, titel?, fuer?, faellig?, uhrzeit?, notiz? }, Antwort { ok: true, aufgaben }.
 * Jede Person mit gültigem Code darf jede Aufgabe ändern. Ist alles schon so, wird nichts geschrieben.
 * `aufgaben` = die frische Liste wie in der Übersicht (aufgabenLesen). Fehler: { ok: false, fehler }.
 */
function aufgabenAktion(aktion, daten, name, u) {
  const anlegen = aktion === 'aufgabeAnlegen';
  let festeId = null;
  if (anlegen && daten.anfrageId !== undefined && daten.anfrageId !== null) {
    if (typeof daten.anfrageId !== 'string' || !ANFRAGE_ID_MUSTER.test(daten.anfrageId)) return { ok: false, fehler: FEHLER_ANFRAGE };
    festeId = idAusAnfrage(u.sha256Hex('aufgabe-id\n' + name + '\n' + daten.anfrageId), AUFGABE_ANFRAGE_ID_PRAEFIX);
  }
  const team = teamNamen(u.eintraege());
  const r = u.mitSperre(() => {
    const jetzt = u.jetzt();
    const heute = u.datumText(jetzt);
    const zeilen = u.tabWerteFreiwillig(AUFGABEN_TAB);
    if (!Array.isArray(zeilen)) return { ok: false, fehler: FEHLER_AUFGABEN_TAB };
    // Schutz gegen verschobene Spalten: mit falscher Kopfzeile wird nichts geschrieben
    if (!aufgabenKopfPasst(zeilen)) return { ok: false, fehler: FEHLER_AUFGABEN_KOPF };
    let erg;
    try {
      erg = anlegen ? aufgabeAnlegen_(daten, name, zeilen, team, heute, jetzt, u, festeId)
        : aufgabeAendern_(daten, name, zeilen, team, heute, jetzt, u);
    } finally {
      // Noch unter der Sperre ins Sheet bringen, auch nach einem Fehler mitten im Schreiben: Die nächste Anfrage liest
      // sonst vielleicht den alten Stand (gleiche freie Zeile, feste ID noch nicht da) und überschreibt oder verdoppelt
      u.schreibenAbschliessen();
    }
    if (!erg.ok) return erg;
    // Frische Liste aus den Zeilen im Speicher (die Schreibfunktionen halten sie auf dem Stand des Tabs)
    return Object.assign(erg, { aufgaben: aufgabenLesen(zeilen, team, u.datumText, [], heute) });
  });
  if (r.gesperrt) return { ok: false, fehler: FEHLER_BESCHAEFTIGT };
  return r.wert;
}

/** Neue Aufgabe als Zeile A–L unten anhängen (Status `offen`, „Geändert“ leer). Rückgabe { ok, id } oder { ok: false, fehler }. */
function aufgabeAnlegen_(daten, name, zeilen, team, heute, jetzt, u, festeId) {
  // Wiederholung derselben Anfrage: Die Zeile mit der festen ID steht schon da (auch wenn sie inzwischen geändert ist)
  if (festeId && aufgabeZeileZuId(zeilen, festeId) >= 0) return { ok: true, id: festeId, wiederholt: true };
  const p = aufgabePruefen(daten, team, heute);
  if (p.fehler) return { ok: false, fehler: p.fehler };
  const a = p.aufgabe;
  const id = festeId || aufgabeNeueId_(zeilen, jetzt.getTime(), u.zufall);
  const zeile = [id, jetzt, name, a.fuer, a.titel, a.faellig ? u.datumZelle(a.faellig) : '', a.uhrzeit, a.notiz, 'offen', '', '', ''];
  const nr = naechsteZeile(zeilen);
  u.zeileSchreiben(AUFGABEN_TAB, nr, zellenGenau(zeile), AU_FORMATE);
  zeileSetzen_(zeilen, nr, zeile);
  return { ok: true, id: id };
}

/**
 * Aufgabe `daten.id` in ihrer Zeile ändern: nur die Zellen, die sich ändern, und „Geändert“. Unbekannte ID, unlesbare
 * Zeile oder Status `entfernt` → FEHLER_AUFGABE_FEHLT. Rückgabe { ok } oder { ok: false, fehler }.
 */
function aufgabeAendern_(daten, name, zeilen, team, heute, jetzt, u) {
  const id = typeof daten.id === 'string' ? daten.id.trim() : '';
  const i = id && id.length <= 64 ? aufgabeZeileZuId(zeilen, id) : -1;
  const alt = i >= 0 ? aufgabeAusZeile(zeilen[i], u.datumText) : null;
  if (!alt || alt.status === 'entfernt') return { ok: false, fehler: FEHLER_AUFGABE_FEHLT };
  const p = aufgabeAenderungPruefen(daten, alt, team, heute);
  if (p.fehler) return { ok: false, fehler: p.fehler };
  if (!Object.keys(p.neu).length) return { ok: true }; // alles ist schon so (z. B. doppelt getippt): nichts schreiben
  const neu = aufgabeZellen(p.neu, name, heute, jetzt, u.datumZelle);
  // Reihenfolge, damit eine Wiederholung derselben Anfrage nach einem Fehler mitten im Schreiben alles nachholt: erst
  // die Stücke ohne Status von rechts nach links („Geändert“ zuerst: Die Felder sind dann noch anders als gewünscht),
  // zuletzt das Stück mit dem Status (solange er nicht steht, ist die Aufgabe nicht entfernt und noch zu ändern).
  const mitStatus = (s) => s.spalte <= AU.STATUS + 1 && AU.STATUS + 1 < s.spalte + s.werte.length;
  const stuecke = zellenStuecke(neu).reverse();
  stuecke.filter((s) => !mitStatus(s)).concat(stuecke.filter(mitStatus)).forEach((s) => {
    const formate = {};
    s.werte.forEach((w, k) => { if (AU_FORMATE[s.spalte + k]) formate[s.spalte + k] = AU_FORMATE[s.spalte + k]; });
    u.zellenSchreiben(AUFGABEN_TAB, i + 1, s.spalte, zellenGenau(s.werte), formate);
  });
  const zeile = zeilen[i];
  neu.forEach((w, k) => {
    if (w === undefined) return;
    while (zeile.length <= k) zeile.push('');
    zeile[k] = w;
  });
  return { ok: true };
}
