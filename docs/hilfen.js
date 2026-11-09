// Reine Hilfsfunktionen der App (ohne DOM), im Browser als window.SATE_HILFEN, unter Node per require (Tests).
(function (wurzel) {
  'use strict';

  const CODE_LAENGE = 12;
  const PLATZHALTER_URL = 'HIER_WEB_APP_URL_EINTRAGEN';
  /** Grenzen wie in der Schnittstelle (api/src/Konfig.js). */
  const MAX_FLASCHEN = 50000;
  const MAX_KOMMENTAR = 200;
  const MAX_TAGE_ZUKUNFT = 0; // höchstens heute (seit 2026-11-08)
  const MAX_TAGE_ZURUECK = 400;
  const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const MONATE_LANG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober',
    'November', 'Dezember'];

  /** Arten zum Eintragen (Reihenfolge der Knöpfe) mit kurzer Erklärung. Storno nur über den Verlauf. */
  const ARTEN = [
    { art: 'Inventur', text: 'Gezählt: so viele Flaschen stehen gerade da. Ab dann rechnet die App von dieser Zahl aus.' },
    { art: 'Umlagerung', text: 'Flaschen von einem Standort zu einem anderen gebracht.' },
    { art: 'Promo', text: 'Verschenkt fürs Marketing, z. B. Proben, Events, Gewinnspiele.' },
    { art: 'Eigenverbrauch', text: 'Vom Team selbst getrunken.' },
    { art: 'Bruch', text: 'Kaputt, abgelaufen oder sonst nicht mehr verkäuflich.' },
    { art: 'Abfüllung', text: 'Neue Flaschen vom Abfüller angekommen (Zugang). Steht danach auch im Tab Abfüllungen.' },
  ];

  /** Eingabe säubern: Großbuchstaben, ohne Leerzeichen und Striche (der Server prüft genauso). */
  function codeBereinigen(eingabe) {
    return String(eingabe || '').toUpperCase().replace(/[\s\-‐-―_.]/g, '');
  }

  /** Kurze Prüfung vor dem Senden. Rückgabe: Fehlermeldung oder ''. */
  function codePruefen(eingabe) {
    const c = codeBereinigen(eingabe);
    if (!c) return 'Bitte gib deinen Zugangscode ein.';
    if (c.length !== CODE_LAENGE) return 'Der Code hat ' + CODE_LAENGE + ' Zeichen (z. B. ABCD-EFGH-JKMN).';
    return '';
  }

  /** Ist eine echte Web-App-URL eingetragen? */
  function apiUrlGueltig(url) {
    return typeof url === 'string' && url !== PLATZHALTER_URL && /^https:\/\/script\.google\.com\/(macros|a\/macros\/[\w.-]+)\/s\/[\w-]+\/exec$/.test(url);
  }

  const istZahl = (z) => typeof z === 'number' && isFinite(z);

  /** Zahl deutsch formatieren (8.041 bzw. 7,3). null/ungültig → „–“. */
  function zahlFormat(z, nachkomma) {
    if (!istZahl(z)) return '–';
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: nachkomma || 0, maximumFractionDigits: nachkomma || 0 }).format(z);
  }

  /** Betrag in Euro ohne Cent (12.345 €). null/ungültig → „–“. */
  function euroFormat(z) {
    return istZahl(z) ? zahlFormat(z, 0) + ' €' : '–';
  }

  /** Volle Kisten und Rest-Flaschen: (3400, 24) → { kisten: 141, rest: 16 }. Ungültig → null. */
  function kistenTeilen(flaschen, proKiste) {
    if (!istZahl(flaschen) || !istZahl(proKiste) || proKiste <= 0 || flaschen < 0) return null;
    const ganz = Math.round(flaschen);
    return { kisten: Math.floor(ganz / proKiste), rest: ganz % proKiste };
  }

  /** Kisten mit höchstens einer Nachkommastelle (12 bzw. 12,5). */
  function kistenFormat(z) {
    if (!istZahl(z)) return '–';
    return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(z);
  }

  /** ISO-Zeit → „8. November 2026, 16:05 Uhr“ (deutsche Zeit). Ungültig → „–“. */
  function zeitFormat(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '–';
    const tag = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }).format(d);
    const uhr = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(d);
    return tag + ', ' + uhr + ' Uhr';
  }

  /** Ist `t` ein echtes Datum `JJJJ-MM-TT`? */
  function datumGueltig(t) {
    if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
    const d = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10))));
    return d.toISOString().slice(0, 10) === t;
  }

  /** `JJJJ-MM-TT` → `TT.MM.JJJJ`. Ungültig → „–“. */
  function datumFormat(t) {
    return datumGueltig(t) ? t.slice(8, 10) + '.' + t.slice(5, 7) + '.' + t.slice(0, 4) : '–';
  }

  /** `JJJJ-MM-TT` → „26. Jan 2027“ (für große Anzeigen). Ungültig → „–“. */
  function datumText(t) {
    return datumGueltig(t) ? Number(t.slice(8, 10)) + '. ' + MONATE_KURZ[Number(t.slice(5, 7)) - 1] + ' ' + t.slice(0, 4) : '–';
  }

  /** `JJJJ-MM-TT` → „26. Jan“ (kurz, ohne Jahr, für Listen). Ungültig → „–“. */
  function datumKurz(t) {
    return datumGueltig(t) ? Number(t.slice(8, 10)) + '. ' + MONATE_KURZ[Number(t.slice(5, 7)) - 1] : '–';
  }

  /** `JJJJ-MM` → „Nov“ bzw. mit `lang` „November 2026“. Ungültig → „–“. */
  function monatFormat(m, lang) {
    if (typeof m !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return '–';
    const i = Number(m.slice(5, 7)) - 1;
    return lang ? MONATE_LANG[i] + ' ' + m.slice(0, 4) : MONATE_KURZ[i];
  }

  const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  /** `JJJJ-MM-TT` → „Montag, 9. November“. Ungültig → ''. */
  function wochentagText(t) {
    if (!datumGueltig(t)) return '';
    const d = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10))));
    return WOCHENTAGE[d.getUTCDay()] + ', ' + Number(t.slice(8, 10)) + '. ' + MONATE_LANG[Number(t.slice(5, 7)) - 1];
  }

  /** Dauer in Tagen in Worten: „1 Tag“, „12 Tage“, „5 Wochen“ (ab 14 Tagen), „2,5 Monate“ (ab 60 Tagen). Ungültig → ''. */
  function dauerText(tage) {
    if (!istZahl(tage) || tage < 0) return '';
    if (tage < 14) return tage === 1 ? '1 Tag' : zahlFormat(tage, 0) + ' Tage';
    if (tage < 60) return zahlFormat(Math.round(tage / 7), 0) + ' Wochen';
    return zahlFormat(Math.round(tage / (365.25 / 12) * 10) / 10, 1).replace(/,0$/, '') + ' Monate';
  }

  /** `JJJJ-MM` → „November“ (ohne Jahr). Ungültig → „–“. */
  function monatName(m) {
    return monatFormat(m) === '–' ? '–' : MONATE_LANG[Number(m.slice(5, 7)) - 1];
  }

  /** Zeitraum `JJJJ-MM` bis `JJJJ-MM` → „Nov 2025 – Okt 2026“ (ein Monat: „Jan 2026“). Ungültig → ''. */
  function zeitraumFormat(von, bis) {
    if (monatFormat(von) === '–' || monatFormat(bis) === '–') return '';
    const m = (x) => monatFormat(x) + ' ' + x.slice(0, 4);
    return von === bis ? m(von) : m(von) + ' – ' + m(bis);
  }

  /** Heutiges Datum in Berlin als `JJJJ-MM-TT`. */
  function heuteBerlin(jetzt) {
    const teile = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(jetzt || new Date());
    const t = (typ) => (teile.find((x) => x.type === typ) || {}).value;
    return t('year') + '-' + t('month') + '-' + t('day');
  }

  /** `JJJJ-MM-TT` plus n Tage (Kalendertage). */
  function tagePlus(datum, n) {
    const d = new Date(Date.UTC(Number(datum.slice(0, 4)), Number(datum.slice(5, 7)) - 1, Number(datum.slice(8, 10)) + n));
    return d.toISOString().slice(0, 10);
  }

  /** Tage von a bis b (beide `JJJJ-MM-TT`). */
  function tageZwischen(a, b) {
    const t = (x) => Date.UTC(Number(x.slice(0, 4)), Number(x.slice(5, 7)) - 1, Number(x.slice(8, 10)));
    return Math.round((t(b) - t(a)) / 86400000);
  }

  /** Bestellstatus der Schnittstelle → { stufe: 'ok' | 'bald' | 'jetzt' | '', text }. */
  function bestellStufe(status) {
    if (status === 'jetzt bestellen') return { stufe: 'jetzt', text: 'Jetzt bestellen' };
    if (status === 'bald') return { stufe: 'bald', text: 'Bald bestellen' };
    if (status === 'ok') return { stufe: 'ok', text: 'Alles gut' };
    return { stufe: '', text: 'Noch nicht berechenbar' };
  }

  /**
   * Balken „Reichweite“ in der Bestell-Karte, Skala 0 bis `skala` Monate (Standard 12): `fuell` = Reichweite,
   * `grenze` = Vorlauf + Puffer (ab da muss bestellt sein), beide in Prozent 0–100. Fehlt die Reichweite: null.
   */
  function reichweiteBalken(reichweite, vorlaufMonate, pufferWochen, skala) {
    if (!istZahl(reichweite)) return null;
    const max = skala > 0 ? skala : 12;
    const pct = (m) => Math.round(Math.max(0, Math.min(m / max, 1)) * 1000) / 10;
    const grenze = (istZahl(vorlaufMonate) ? vorlaufMonate : 0) + (istZahl(pufferWochen) ? pufferWochen * 7 / (365.25 / 12) : 0);
    return { fuell: pct(reichweite), grenze: pct(grenze) };
  }

  // Eingaben ---------------------------------------------------------------------------------------------------

  /** Ganze Zahl ≥ 0 aus einem Eingabefeld („1200“ oder „1.200“, Leerzeichen egal). Leer → 0, ungültig → null. */
  function ganzeZahlEingabe(text) {
    const s = String(text === undefined || text === null ? '' : text).replace(/[\s  ]/g, '');
    if (!s) return 0;
    if (/^\d{1,7}$/.test(s)) return Number(s);
    if (/^\d{1,3}(\.\d{3}){1,2}$/.test(s)) return Number(s.replace(/\./g, ''));
    return null;
  }

  /**
   * Flaschen aus den Feldern „Kisten“ und „einzelne Flaschen“: Kisten × proKiste + einzelne.
   * Rückgabe { flaschen, leer } (leer = beide Felder leer) oder { fehler }.
   */
  function flaschenAusEingabe(kistenEingabe, einzelEingabe, proKiste) {
    const k = ganzeZahlEingabe(kistenEingabe);
    const f = ganzeZahlEingabe(einzelEingabe);
    if (k === null) return { fehler: 'Kisten: bitte eine ganze Zahl eintragen.' };
    if (f === null) return { fehler: 'Flaschen: bitte eine ganze Zahl eintragen.' };
    const leer = !String(kistenEingabe || '').trim() && !String(einzelEingabe || '').trim();
    if (k > 0 && !(proKiste > 0)) return { fehler: 'Flaschen pro Kiste unbekannt, bitte nur Flaschen eintragen.' };
    return { flaschen: (k > 0 ? k * proKiste : 0) + f, leer: leer };
  }

  /** „79 Flaschen = 3 Kisten + 7 Flaschen“ (ohne volle Kiste oder proKiste unbekannt: nur Flaschen). */
  function kistenText(flaschen, proKiste) {
    if (!istZahl(flaschen) || flaschen < 0) return '';
    const fl = (n) => zahlFormat(n, 0) + (n === 1 ? ' Flasche' : ' Flaschen');
    if (!(proKiste > 0) || flaschen < proKiste) return fl(flaschen);
    const k = Math.floor(flaschen / proKiste);
    const rest = flaschen - k * proKiste;
    return fl(flaschen) + ' = ' + zahlFormat(k, 0) + (k === 1 ? ' Kiste' : ' Kisten') + (rest ? ' + ' + fl(rest) : '');
  }

  /**
   * Formular „Eintragen“ prüfen wie die Schnittstelle. `b` = { art, standort, nach, flaschen, datum, kommentar },
   * `standorte` = Namen aus der Antwort, `heute` = `JJJJ-MM-TT`. Rückgabe: Fehlermeldung oder ''.
   */
  function buchungPruefen(b, standorte, heute) {
    if (!ARTEN.some((a) => a.art === b.art)) return 'Bitte wähle aus, was du eintragen willst.';
    if (standorte.indexOf(b.standort) < 0) return 'Bitte einen Standort wählen.';
    if (b.art === 'Umlagerung') {
      if (standorte.indexOf(b.nach) < 0) return 'Bitte wählen, wohin die Flaschen gebracht wurden.';
      if (b.nach === b.standort) return '„Von“ und „nach“ sind gleich.';
    }
    const min = b.art === 'Inventur' ? 0 : 1;
    if (!Number.isInteger(b.flaschen) || b.flaschen < min || b.flaschen > MAX_FLASCHEN) {
      return 'Flaschen: bitte eine ganze Zahl von ' + min + ' bis 50.000.';
    }
    if (!datumGueltig(b.datum)) return 'Bitte ein gültiges Datum wählen.';
    const abstand = tageZwischen(heute, b.datum);
    if (abstand > MAX_TAGE_ZUKUNFT) return 'Das Datum liegt in der Zukunft (höchstens heute).';
    if (abstand < -MAX_TAGE_ZURUECK) return 'Das Datum liegt mehr als 400 Tage zurück.';
    if (Array.from(String(b.kommentar || '')).length > MAX_KOMMENTAR) return 'Kommentar: höchstens 200 Zeichen.';
    return '';
  }

  /** Text für die Bestätigung nach dem Eintragen, z. B. „Umlagerung: 48 Flaschen von Lager Süd nach Lager Nord“. */
  function buchungText(b) {
    const fl = zahlFormat(b.flaschen, 0) + (b.flaschen === 1 ? ' Flasche' : ' Flaschen');
    if (b.art === 'Umlagerung') return 'Umlagerung: ' + fl + ' von ' + b.standort + ' nach ' + b.nach;
    return b.art + ': ' + fl + ' bei ' + b.standort;
  }

  /** Anfrage-ID (Doppelklick-Schutz) aus Zufallsbytes als Hex-Text (16 Bytes → 32 Zeichen). */
  function anfrageIdAus(bytes) {
    return Array.from(bytes, (b) => ((b & 0xff) < 16 ? '0' : '') + (b & 0xff).toString(16)).join('').slice(0, 64);
  }

  // Diagramm ---------------------------------------------------------------------------------------------------

  /** „Schöne“ Achse: Schrittweite 1/2/5 × 10^n, etwa `anzahl` Abschnitte bis zum Maximum oder knapp darüber. */
  function achse(max, anzahl) {
    const n = anzahl || 4;
    if (!(max > 0)) return { max: 1, schritt: 1, striche: [0, 1] };
    const roh = max / n;
    const p = Math.pow(10, Math.floor(Math.log10(roh)));
    const schritt = [1, 2, 5, 10].map((f) => f * p).find((s) => s >= roh * (1 - 1e-9));
    const oben = Math.ceil(max / schritt - 1e-9) * schritt;
    const striche = [];
    for (let i = 0; i * schritt <= oben + schritt / 2; i++) striche.push(Math.round(i * schritt * 1e6) / 1e6);
    return { max: Math.round(oben * 1e6) / 1e6, schritt: schritt, striche: striche };
  }

  function runde(z) { return Math.round(z * 100) / 100; }

  /**
   * Achse für Werte, die auch negativ sein können (Gutschriften): Schrittweite wie achse() aus der Spanne, Striche von
   * `unten` (≤ 0) bis `oben` (> 0) in ganzen Schritten. Ungültige Werte zählen nicht. Rückgabe { unten, oben, schritt, striche }.
   */
  function achseMitMinus(werte, anzahl) {
    const zahlen = (werte || []).filter(istZahl);
    const max = Math.max.apply(null, [0].concat(zahlen));
    const min = Math.min.apply(null, [0].concat(zahlen));
    const schritt = achse(max - min, anzahl || 4).schritt;
    const unten = min < 0 ? -Math.ceil(-min / schritt - 1e-9) * schritt : 0;
    const oben = Math.max(schritt, Math.ceil(max / schritt - 1e-9) * schritt);
    const striche = [];
    for (let i = 0; unten + i * schritt <= oben + schritt / 2; i++) striche.push(Math.round((unten + i * schritt) * 1e6) / 1e6);
    return { unten: Math.round(unten * 1e6) / 1e6, oben: Math.round(oben * 1e6) / 1e6, schritt: schritt, striche: striche };
  }

  /**
   * Maße für ein Balkendiagramm. `werte` = Zahlen (ungültig → 0), `m` = { breite, hoehe, links, unten, oben, luecke }.
   * Rückgabe { balken: [{x, y, b, h, wert}], striche: [{wert, y}], basis, platz } in Einheiten der viewBox.
   * Negative Werte (Gutschriften) zeichnen als 0 hoch.
   */
  function diagrammMasse(werte, m) {
    const zahlen = werte.map((w) => (istZahl(w) ? w : 0));
    const a = achse(Math.max.apply(null, [0].concat(zahlen)), 4);
    const flaeche = m.hoehe - m.oben - m.unten;
    const basis = m.oben + flaeche;
    const platz = (m.breite - m.links) / Math.max(zahlen.length, 1);
    const b = Math.max(platz - m.luecke, 1);
    const y = (w) => basis - (Math.max(w, 0) / a.max) * flaeche;
    return {
      basis: runde(basis),
      platz: runde(platz),
      striche: a.striche.map((w) => ({ wert: w, y: runde(y(w)) })),
      balken: zahlen.map((w, i) => ({
        x: runde(m.links + i * platz + (platz - b) / 2), y: runde(y(w)), b: runde(b), h: runde(basis - y(w)), wert: w,
      })),
    };
  }

  /**
   * Achsenbeschriftung kurz: 1.500 → „1.500“, 12.000 → „12 Tsd.“, 12.500 → „12,5 Tsd.“. Mit `max` ≥ 10.000 (höchster
   * Strich der Achse) alle Striche außer 0 in Tsd., damit eine Achse einheitlich ist (5.000 → „5 Tsd.“).
   */
  function achsenText(w, max) {
    const tsd = w >= 10000 || (max >= 10000 && w > 0);
    return tsd ? zahlFormat(w / 1000, w % 1000 ? 1 : 0) + ' Tsd.' : zahlFormat(w, 0);
  }

  // Antworten --------------------------------------------------------------------------------------------------

  /**
   * Antwort der Schnittstelle deuten. `text` = Antwort-Body.
   * Rückgabe: { art: 'ok', daten } | { art: 'code', meldung } (Code ungültig) |
   * { art: 'bestaetigen', warnung } (Server will ein „trotzdem“) | { art: 'fehler', meldung }.
   */
  function antwortDeuten(status, text) {
    let o = null;
    try { o = JSON.parse(text); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') {
      if (status && status !== 200) return { art: 'fehler', meldung: 'Die Schnittstelle antwortet mit Fehler ' + status + '. Bitte später nochmal versuchen.' };
      return { art: 'fehler', meldung: 'Unverständliche Antwort der Schnittstelle. Ist die Web-App richtig bereitgestellt?' };
    }
    if (o.ok === true && typeof o.name === 'string') return { art: 'ok', daten: o };
    if (o.fehler === 'Code ungültig') return { art: 'code', meldung: 'Dieser Code gilt nicht (falsch getippt oder gesperrt). Neuen Code gibt es bei Mark.' };
    if (o.brauchtBestaetigung === true) {
      return { art: 'bestaetigen', warnung: typeof o.warnung === 'string' && o.warnung ? o.warnung : 'Trotzdem speichern?' };
    }
    return { art: 'fehler', meldung: typeof o.fehler === 'string' && o.fehler ? o.fehler : 'Unbekannter Fehler.' };
  }

  /** Sieht ein Objekt wie die Daten der Aktion `uebersicht` aus (auch aus dem Gerätespeicher)? */
  function uebersichtGueltig(u) {
    return !!u && typeof u === 'object' && typeof u.stand === 'string' && !!u.kennzahlen && typeof u.kennzahlen === 'object' &&
      !!u.bestellung && typeof u.bestellung === 'object' && Array.isArray(u.lager) && !!u.verkaeufe &&
      Array.isArray(u.verkaeufe.monate) && !!u.verkaeufe.jahr && !!u.verkaeufe.vorjahr && !!u.verkaeufe.gesamt && Array.isArray(u.verkaufListe) &&
      Array.isArray(u.hinweise);
  }

  /** Ist Stand `a` (ISO-Zeit) mindestens so neu wie `b`? Fehlt b, ja. */
  function neuer(a, b) {
    const ta = new Date(a).getTime();
    const tb = new Date(b).getTime();
    if (isNaN(ta)) return false;
    return isNaN(tb) || ta >= tb;
  }

  // Relative Zeit („Aktualisiert vor 5 Min.“) ---------------------------------------------------------------

  /**
   * Abstand von `iso` bis `jetzt` in Worten: „gerade eben“ (unter 1 Minute, auch bei leicht vorgehender Uhr),
   * „vor 5 Min.“, „vor 2 Std.“ (unter 24 Stunden), sonst „am 6. Nov 2026, 14:05 Uhr“. Ungültig → ''.
   */
  function relativZeit(iso, jetzt) {
    const t = new Date(iso).getTime();
    if (!iso || isNaN(t)) return '';
    const ms = (jetzt instanceof Date ? jetzt.getTime() : (typeof jetzt === 'number' ? jetzt : Date.now())) - t;
    if (ms < 60000 && ms > -5 * 60000) return 'gerade eben';
    if (ms > 0 && ms < 3600000) return 'vor ' + Math.floor(ms / 60000) + ' Min.';
    if (ms > 0 && ms < 86400000) return 'vor ' + Math.floor(ms / 3600000) + ' Std.';
    const d = new Date(t);
    const tag = heuteBerlin(d);
    const uhr = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(d);
    return 'am ' + datumText(tag) + ', ' + uhr + ' Uhr';
  }

  // Trends (Verkäufe: Vormonat, Vorjahresmonat) ---------------------------------------------------------------

  /** `JJJJ-MM` plus n Monate. Ungültig → ''. */
  function monatPlus(m, n) {
    if (monatFormat(m) === '–') return '';
    const i = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + n;
    const j = Math.floor(i / 12);
    const mo = i - j * 12 + 1;
    return j + '-' + (mo < 10 ? '0' : '') + mo;
  }

  /** Veränderung von `vergleich` zu `wert` in ganzen Prozent. Nur wenn `vergleich` > 0 und `wert` eine Zahl ist, sonst null. */
  function veraenderung(wert, vergleich) {
    if (!istZahl(wert) || !istZahl(vergleich) || vergleich <= 0) return null;
    const p = Math.round(((wert - vergleich) / vergleich) * 100);
    return p === 0 ? 0 : p; // kein -0
  }

  /** Prozent mit Vorzeichen deutsch: 12 → „+12 %“, -5 → „−5 %“ (echtes Minus), 0 → „±0 %“, 1234 → „+1.234 %“. */
  function prozentText(p) {
    if (!istZahl(p)) return '';
    return (p > 0 ? '+' : p < 0 ? '−' : '±') + zahlFormat(Math.abs(p), 0) + ' %';
  }

  /** Richtung für Pfeil und Farbe: 'hoch' | 'runter' | 'gleich' ('' ohne Zahl). */
  function richtung(p) {
    if (!istZahl(p)) return '';
    return p > 0 ? 'hoch' : p < 0 ? 'runter' : 'gleich';
  }

  /**
   * Trends für den Monat an Stelle `i` von `monate` ([{monat, flaschen, umsatz}], der letzte läuft noch).
   * `groesse` = 'flaschen' | 'umsatz'. Rückgabe { monat, wert, laufend, vormonat, vorjahr }; vormonat/vorjahr sind
   * { monat, wert, prozent } oder null (Vergleichsmonat fehlt in den Daten oder ist ≤ 0). Der laufende Monat wird nicht
   * verglichen (er ist erst „bis heute“ gezählt, der Vergleich wäre unfair), dort sind beide null. Ungültig → null.
   */
  function monatsTrend(monate, i, groesse, frueher) {
    if (!Array.isArray(monate) || !(i >= 0 && i < monate.length) || !monate[i]) return null;
    const g = groesse === 'umsatz' ? 'umsatz' : 'flaschen';
    const m = monate[i];
    const laufend = i === monate.length - 1;
    const vergleich = (monat) => {
      if (laufend || !monat) return null;
      const pool = Array.isArray(frueher) ? frueher.concat(monate) : monate;
      const v = pool.find((x) => x && x.monat === monat);
      const p = v ? veraenderung(m[g], v[g]) : null;
      return p === null ? null : { monat: monat, wert: v[g], prozent: p };
    };
    return { monat: m.monat, wert: m[g], laufend: laufend, vormonat: vergleich(monatPlus(m.monat, -1)), vorjahr: vergleich(monatPlus(m.monat, -12)) };
  }

  // Ansichten-Leiste und Ziehen zum Aktualisieren ---------------------------------------------------------

  /**
   * Welche Ansicht zeigt die waagerecht scrollende Leiste? `links` = scrollLeft, `breite` = Breite einer Ansicht,
   * `anzahl` = Zahl der Ansichten. Rückgabe { index, eingerastet } (index = überwiegend sichtbare Ansicht, am Rand
   * begrenzt; eingerastet = steht bis auf 2 px genau auf ihr) oder null, wenn nichts messbar ist (versteckt).
   */
  function reiterPosition(links, breite, anzahl) {
    if (!(breite > 0) || !(anzahl > 0) || !Number.isFinite(links)) return null;
    const index = Math.max(0, Math.min(anzahl - 1, Math.round(links / breite)));
    return { index: index, eingerastet: Math.abs(links - index * breite) <= 2 };
  }

  /** Geste beim Ziehen: erst nach ~10 px entscheiden; „ziehen“ nur klar nach unten (dy > 0 und > 1,5 × |dx|). */
  function ziehRichtung(dx, dy) {
    if (!(Math.max(Math.abs(dx), Math.abs(dy)) >= 10)) return '';
    return dy > 0 && dy > 1.5 * Math.abs(dx) ? 'ziehen' : 'aus';
  }

  /** Gummiband beim Ziehen: folgt erst fast 1:1, dann immer zäher, nie über `max` (Standard 200 px). */
  function gummiband(weg, max) {
    const m = max > 0 ? max : 200;
    if (!(weg > 0)) return 0;
    return Math.round((m * weg / (weg + m)) * 10) / 10;
  }

  // Feinschliff (Task 16): kurze Texte für Kacheln, Hinweise, Verlauf, Stepper -----------------------------------

  /** Anzahl Monate von `von` bis `bis` (beide `JJJJ-MM`, einschließlich). Ungültig oder bis < von → null. */
  function monateAnzahl(von, bis) {
    if (monatFormat(von) === '–' || monatFormat(bis) === '–') return null;
    const n = (Number(bis.slice(0, 4)) - Number(von.slice(0, 4))) * 12 + Number(bis.slice(5, 7)) - Number(von.slice(5, 7)) + 1;
    return n >= 1 ? n : null;
  }

  /** Kurzer Zeitraum für die Kachel „Ø pro Monat“: „letzte 6 Monate“ bzw. „letzter voller Monat“. Ungültig → ''. */
  function zeitraumKurz(von, bis) {
    const n = monateAnzahl(von, bis);
    if (!n) return '';
    return n === 1 ? 'letzter voller Monat' : 'letzte ' + n + ' Monate';
  }

  /** Flaschen des laufenden Monats (`heute` = `JJJJ-MM-TT`) aus `monate` ([{monat, flaschen}]). Fehlt er → null. */
  function monatBisher(monate, heute) {
    if (!Array.isArray(monate) || typeof heute !== 'string') return null;
    const m = monate.find((x) => x && x.monat === heute.slice(0, 7));
    return m && istZahl(m.flaschen) ? { monat: m.monat, flaschen: m.flaschen } : null;
  }

  /**
   * Kisten klein unter dem Bestand: geschätzt „≈ 335 Kisten“ (gerundet), gezählt genau „335 Kisten + 1 Fl.“.
   * Unter einer Kiste, ungültig oder Kistengröße unbekannt → ''.
   */
  function kistenKurz(flaschen, proKiste, geschaetzt) {
    const t = kistenTeilen(flaschen, proKiste);
    if (!t) return '';
    const k = (n) => zahlFormat(n, 0) + (n === 1 ? ' Kiste' : ' Kisten');
    if (geschaetzt) { const r = Math.round(flaschen / proKiste); return r ? '≈ ' + k(r) : ''; }
    return t.kisten ? k(t.kisten) + (t.rest ? ' + ' + zahlFormat(t.rest, 0) + ' Fl.' : '') : '';
  }

  /** Anteils-Balken bei den Standorten nur, wenn mindestens zwei einen Bestand > 0 haben (sonst zeigt einer 100 %). */
  function anteileSinnvoll(lager) {
    return Array.isArray(lager) && lager.filter((l) => l && istZahl(l.bestand) && l.bestand > 0).length >= 2;
  }

  const INVENTUR_FEHLT = /^Noch keine Inventur( bei [^:]+)?: Gesamtbestand ist der rechnerische/;

  /**
   * Hinweise der Schnittstelle ordnen: „Noch keine Inventur …“ wird zu einem freundlichen Satz (`bestand`), alle übrigen
   * bleiben unverändert in `andere`. Rückgabe { bestand: Text oder '', andere: [Texte] }.
   */
  function hinweiseOrdnen(liste) {
    const aus = { bestand: '', andere: [] };
    (Array.isArray(liste) ? liste : []).forEach((t) => {
      const m = INVENTUR_FEHLT.exec(String(t));
      if (!m) return aus.andere.push(String(t));
      aus.bestand = (m[1] ? 'Noch nicht alle Lager gezählt' : 'Noch kein Lager gezählt') +
        ' – der Bestand ist geschätzt (aus Abfüllungen minus Verkäufe). Nach der Inventur zeigt die App den echten Bestand.';
    });
    return aus;
  }

  /** Verlauf ohne Storno-Gegenzeilen (das Original trägt schon „storniert“). */
  function verlaufOhneStorno(eintraege) {
    return (Array.isArray(eintraege) ? eintraege : []).filter((e) => e && e.art !== 'Storno');
  }

  /** Stepper −/+: Feldtext um `schritt` ändern, auf 0 bis `max` begrenzt (unlesbar zählt als 0). Rückgabe: neuer Text. */
  function schrittWert(text, schritt, max) {
    const z = ganzeZahlEingabe(text);
    const grenze = max > 0 ? max : MAX_FLASCHEN;
    return String(Math.max(0, Math.min(grenze, (z === null ? 0 : z) + schritt)));
  }

  // Auswertungen aus den Verkaufszeilen (seit 2026-11-09): Jahresvergleich, Kanäle und Kunden, Kunden-Details --------

  const MONAT_MUSTER = /^\d{4}-(0[1-9]|1[0-2])$/;
  const leerSumme = () => ({ flaschen: 0, umsatz: 0 });
  const summeRunden = (x) => (x ? { flaschen: runde(x.flaschen), umsatz: runde(x.umsatz) } : null);
  function addieren(ziel, x) {
    ziel.flaschen += x.flaschen;
    ziel.umsatz += x.umsatz;
    return ziel;
  }

  /** Wie die Schnittstelle: Kunden gleich, wenn sie bis auf Groß/klein und Leerzeichen gleich heißen. */
  function kundeSchluessel(kunde) {
    return String(kunde || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  /**
   * Verkaufszeilen der Schnittstelle (`verkaeufe.zeilen`, je [Monat, Datum, Kanal, Kunde, Flaschen, Umsatz, Rechnung])
   * → Objekte { monat, datum ('' ohne Rechnungsdatum), kanal, kunde, schluessel, flaschen, umsatz, rechnung }.
   * `rechnung` ohne Zusatz wie „#2“ (zweite Zeile derselben Rechnung), '' ohne Nummer. Unlesbare Zeilen fallen weg, mit
   * `heute` (`JJJJ-MM-TT`) auch Zeilen aus späteren Monaten (wie bei den Monatssummen der Schnittstelle).
   * Ältere Schnittstelle ohne das Feld: null.
   */
  function verkaufZeilen(verkaeufe, heute) {
    if (!verkaeufe || !Array.isArray(verkaeufe.zeilen)) return null;
    const bis = datumGueltig(heute) ? heute.slice(0, 7) : null;
    return verkaeufe.zeilen
      .filter((z) => Array.isArray(z) && typeof z[0] === 'string' && MONAT_MUSTER.test(z[0]) && istZahl(z[4]) && (!bis || z[0] <= bis))
      .map((z) => {
        const kunde = String(z[3] === undefined || z[3] === null ? '' : z[3]).trim();
        const rechnung = String(z[6] === undefined || z[6] === null ? '' : z[6]).split('#')[0].trim();
        return { monat: z[0], datum: datumGueltig(z[1]) ? z[1] : '', kanal: String(z[2] || '').trim() || 'Sonstiges', kunde: kunde,
          schluessel: kundeSchluessel(kunde) || '(ohne name)', flaschen: z[4], umsatz: istZahl(z[5]) ? z[5] : 0, rechnung: rechnung };
      });
  }

  /**
   * Flaschen und Umsatz pro Monat als Funktion `werte(monat)` → { flaschen, umsatz }. Aus den Zeilen (Monate ohne
   * Verkäufe → 0), sonst aus `monate` und `vergleichsmonate` der Schnittstelle (25 Monate; außerhalb → null).
   */
  function monatsWerte(verkaeufe, zeilen) {
    const tab = Object.create(null);
    if (zeilen) {
      zeilen.forEach((z) => addieren(tab[z.monat] = tab[z.monat] || leerSumme(), z));
      return (m) => (tab[m] ? summeRunden(tab[m]) : leerSumme());
    }
    const v = verkaeufe || {};
    [].concat(Array.isArray(v.vergleichsmonate) ? v.vergleichsmonate : [], Array.isArray(v.monate) ? v.monate : []).forEach((x) => {
      if (x && MONAT_MUSTER.test(x.monat)) tab[x.monat] = { flaschen: istZahl(x.flaschen) ? x.flaschen : 0, umsatz: istZahl(x.umsatz) ? x.umsatz : 0 };
    });
    return (m) => (tab[m] ? { flaschen: tab[m].flaschen, umsatz: tab[m].umsatz } : null);
  }

  /**
   * Ein Jahr gegen das Jahr davor, Januar bis Dezember. `heute` = `JJJJ-MM-TT` (Datum der Schnittstelle, damit der
   * Jahreswechsel überall gleich gilt), `werte` aus monatsWerte, `jahrWahl` (Zahl, optional) = gezeigtes Jahr, Standard
   * das Jahr von `heute` („Dieses Jahr“; mit Jahr − 1 das Vorjahr gegen das Jahr davor). Rückgabe:
   * { jahr, monate: 12 × { monat, vorjahrMonat, dieses ({flaschen, umsatz}; null für Monate, die noch kommen), vorjahr (oder
   *   null), laufend, zukunft }, bisher (Januar bis heute bzw. ganzes Jahr), vergleich ({ bis, dieses, vorjahr }: volle
   *   Monate in beiden Jahren; ohne vollen Monat oder bei Lücken null), vorjahrGesamt (Januar bis Dezember; null bei Lücken) }.
   */
  function jahresVergleich(werte, heute, jahrWahl) {
    if (!datumGueltig(heute) || typeof werte !== 'function') return null;
    const jetzt = heute.slice(0, 7);
    const jahr = Number.isInteger(jahrWahl) ? jahrWahl : Number(heute.slice(0, 4));
    const bisher = leerSumme();
    const vgDieses = leerSumme();
    const vgVorjahr = leerSumme();
    const vjGesamt = leerSumme();
    let vjLuecke = false;
    let vgLuecke = false;
    const monate = [];
    for (let i = 1; i <= 12; i++) {
      const mm = (i < 10 ? '0' : '') + i;
      const m = jahr + '-' + mm;
      const vm = (jahr - 1) + '-' + mm;
      const zukunft = m > jetzt;
      const d = zukunft ? null : werte(m);
      const v = werte(vm);
      if (d) addieren(bisher, d);
      if (v) addieren(vjGesamt, v); else vjLuecke = true;
      if (m < jetzt) {
        if (d && v) { addieren(vgDieses, d); addieren(vgVorjahr, v); } else vgLuecke = true;
      }
      monate.push({ monat: m, vorjahrMonat: vm, dieses: summeRunden(d), vorjahr: summeRunden(v), laufend: m === jetzt, zukunft: zukunft });
    }
    const voll = monate.filter((m) => m.monat < jetzt); // volle Monate im gezeigten Jahr
    return {
      jahr: jahr,
      monate: monate,
      bisher: summeRunden(bisher),
      vergleich: voll.length >= 1 && !vgLuecke
        ? { bis: voll[voll.length - 1].monat, dieses: summeRunden(vgDieses), vorjahr: summeRunden(vgVorjahr) } : null,
      vorjahrGesamt: vjLuecke ? null : summeRunden(vjGesamt),
    };
  }

  /**
   * Laufende Summen über die 12 Monate. Ab dem ersten fehlenden Monat (noch nicht da oder unbekannt) bleibt alles null,
   * sonst wäre eine spätere Summe nicht mehr „seit Januar“. `groesse` = 'flaschen' | 'umsatz'.
   */
  function kumuliert(monate, schluessel, groesse) {
    let summe = 0;
    let luecke = false;
    return (monate || []).map((m) => {
      const x = m && m[schluessel];
      if (!x || luecke) { luecke = true; return null; }
      summe += istZahl(x[groesse]) ? x[groesse] : 0;
      return runde(summe);
    });
  }

  /** Häufigste Schreibweise, bei Gleichstand die alphabetisch erste (wie die Schnittstelle). */
  function haeufigsterName(namen) {
    return Object.keys(namen).sort((a, b) => namen[b] - namen[a] || (a < b ? -1 : a > b ? 1 : 0))[0] || '';
  }

  /** Lieferdatum einer Zeile zum Vergleichen: Rechnungsdatum, sonst Monatsende (Altliste kennt nur den Monat). */
  function zeilenTag(z) {
    if (z.datum) return z.datum;
    const j = Number(z.monat.slice(0, 4));
    const m = Number(z.monat.slice(5, 7));
    return new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10);
  }

  /**
   * Bestellungen zählen: Zeilen mit Flaschen > 0. Zeilen derselben Rechnung zählen als eine (eine Rechnung kann mehrere
   * Zeilen haben); ohne Rechnungsnummer Zeilen mit gleichem Rechnungsdatum, Altzeilen ohne beides einzeln.
   */
  function bestellungenZaehlen(zeilen) {
    const schon = Object.create(null);
    let einzeln = 0;
    (zeilen || []).forEach((z) => {
      if (!(z.flaschen > 0)) return;
      if (z.rechnung) schon['r:' + z.rechnung] = true;
      else if (z.datum) schon['d:' + z.datum] = true;
      else einzeln++;
    });
    return Object.keys(schon).length + einzeln;
  }

  /**
   * Kanäle und Kunden in [von, bis] (Monate `JJJJ-MM`, beide inklusive) aus den Zeilen. Rückgabe { von, bis, flaschen,
   * umsatz, kanaele: [{kanal, flaschen, umsatz}], kunden: [{schluessel, kunde, kanal, flaschen, umsatz, erster}] }, beide
   * nach Flaschen absteigend (bei Gleichstand Umsatz, dann Name). `erster` = erster Monat des Kunden überhaupt.
   */
  function zeitraumAuswerten(zeilen, von, bis) {
    const kanaele = Object.create(null);
    const kunden = Object.create(null);
    const erster = Object.create(null);
    const summe = leerSumme();
    (zeilen || []).forEach((z) => {
      if (!erster[z.schluessel] || z.monat < erster[z.schluessel]) erster[z.schluessel] = z.monat;
      if (z.monat < von || z.monat > bis) return;
      addieren(summe, z);
      addieren(kanaele[z.kanal] = kanaele[z.kanal] || { kanal: z.kanal, flaschen: 0, umsatz: 0 }, z);
      const k = kunden[z.schluessel] = kunden[z.schluessel] ||
        { namen: Object.create(null), kanaele: Object.create(null), flaschen: 0, umsatz: 0 };
      addieren(k, z);
      const n = z.kunde || '(ohne Name)';
      k.namen[n] = (k.namen[n] || 0) + 1;
      k.kanaele[z.kanal] = (k.kanaele[z.kanal] || 0) + Math.abs(z.flaschen);
    });
    const ordnen = (a, b, name) => b.flaschen - a.flaschen || b.umsatz - a.umsatz || (a[name] < b[name] ? -1 : a[name] > b[name] ? 1 : 0);
    return {
      von: von, bis: bis, flaschen: runde(summe.flaschen), umsatz: runde(summe.umsatz),
      kanaele: Object.keys(kanaele).map((k) => ({ kanal: k, flaschen: runde(kanaele[k].flaschen), umsatz: runde(kanaele[k].umsatz) }))
        .sort((a, b) => ordnen(a, b, 'kanal')),
      kunden: Object.keys(kunden).map((s) => ({
        schluessel: s, kunde: haeufigsterName(kunden[s].namen), kanal: haeufigsterName(kunden[s].kanaele),
        flaschen: runde(kunden[s].flaschen), umsatz: runde(kunden[s].umsatz), erster: erster[s],
      })).sort((a, b) => ordnen(a, b, 'kunde')),
    };
  }

  /**
   * Alles zu einem Kunden (`schluessel` aus kundeSchluessel). `heute` = `JJJJ-MM-TT`. Rückgabe null, wenn es ihn nicht
   * gibt, sonst { kunde, kanaele (nach Flaschen), jahr, vorjahr, gesamt ({flaschen, umsatz}), bestellungen, proBestellung,
   * erste, letzte ({ monat, datum }), monate (13 Monate bis heute: {monat, flaschen, umsatz}), liste (neueste 12 Zeilen) }.
   */
  function kundeDetails(zeilen, schluessel, heute) {
    const eigene = (zeilen || []).filter((z) => z.schluessel === schluessel);
    if (!eigene.length || !datumGueltig(heute)) return null;
    const jahr = heute.slice(0, 4);
    const vorjahr = String(Number(jahr) - 1);
    const namen = Object.create(null);
    const kanaele = Object.create(null);
    const s = { jahr: leerSumme(), vorjahr: leerSumme(), gesamt: leerSumme() };
    const proMonat = Object.create(null);
    eigene.forEach((z) => {
      const n = z.kunde || '(ohne Name)';
      namen[n] = (namen[n] || 0) + 1;
      kanaele[z.kanal] = (kanaele[z.kanal] || 0) + Math.abs(z.flaschen);
      addieren(s.gesamt, z);
      if (z.monat.slice(0, 4) === jahr) addieren(s.jahr, z);
      if (z.monat.slice(0, 4) === vorjahr) addieren(s.vorjahr, z);
      addieren(proMonat[z.monat] = proMonat[z.monat] || leerSumme(), z);
    });
    const nachTag = (a, b) => (zeilenTag(a) < zeilenTag(b) ? -1 : zeilenTag(a) > zeilenTag(b) ? 1 : 0);
    const positiv = eigene.filter((z) => z.flaschen > 0).sort(nachTag);
    const bestellungen = bestellungenZaehlen(eigene);
    const jetzt = heute.slice(0, 7);
    const monate = [];
    for (let i = 12; i >= 0; i--) {
      const m = monatPlus(jetzt, -i);
      monate.push(Object.assign({ monat: m }, summeRunden(proMonat[m] || leerSumme())));
    }
    const ort = (z) => (z ? { monat: z.monat, datum: z.datum } : null);
    return {
      kunde: haeufigsterName(namen),
      kanaele: Object.keys(kanaele).sort((a, b) => kanaele[b] - kanaele[a] || (a < b ? -1 : 1)),
      jahr: summeRunden(s.jahr), vorjahr: summeRunden(s.vorjahr), gesamt: summeRunden(s.gesamt),
      bestellungen: bestellungen,
      proBestellung: bestellungen ? Math.round(positiv.reduce((x, z) => x + z.flaschen, 0) / bestellungen) : null,
      erste: ort(positiv[0]), letzte: ort(positiv[positiv.length - 1]),
      monate: monate,
      liste: eigene.slice().sort((a, b) => nachTag(b, a)).slice(0, 12)
        .map((z) => ({ monat: z.monat, datum: z.datum, kanal: z.kanal, flaschen: z.flaschen, umsatz: z.umsatz })),
    };
  }

  /**
   * „Lange nichts bestellt“: Kunden mit mindestens `min` Bestellungen (Standard 2), deren letzte Bestellung mehr als
   * `tage` Tage (Standard 90) und höchstens 18 Monate zurückliegt. Bei Altzeilen ohne Datum zählt das Monatsende.
   * Rückgabe [{ schluessel, kunde, letzte ({monat, datum}), tage, bestellungen, flaschen (gesamt) }], nach Flaschen absteigend.
   */
  function nachfassen(zeilen, heute, tage, min) {
    if (!datumGueltig(heute)) return [];
    const grenze = tage > 0 ? tage : 90;
    const mindestens = min > 0 ? min : 2;
    const nachKunde = Object.create(null);
    (zeilen || []).forEach((z) => { (nachKunde[z.schluessel] = nachKunde[z.schluessel] || []).push(z); });
    const aus = [];
    Object.keys(nachKunde).forEach((s) => {
      const eigene = nachKunde[s];
      const n = bestellungenZaehlen(eigene);
      if (n < mindestens) return;
      const letzte = eigene.filter((z) => z.flaschen > 0).reduce((a, z) => (!a || zeilenTag(z) > zeilenTag(a) ? z : a), null);
      const her = tageZwischen(zeilenTag(letzte), heute);
      if (her <= grenze || her > 548) return;
      const namen = Object.create(null);
      eigene.forEach((z) => { const k = z.kunde || '(ohne Name)'; namen[k] = (namen[k] || 0) + 1; });
      aus.push({ schluessel: s, kunde: haeufigsterName(namen), letzte: { monat: letzte.monat, datum: letzte.datum }, tage: her,
        bestellungen: n, flaschen: runde(eigene.reduce((x, z) => x + z.flaschen, 0)) });
    });
    return aus.sort((a, b) => b.flaschen - a.flaschen || a.tage - b.tage || (a.kunde < b.kunde ? -1 : 1));
  }

  /** Tag oder Monat kurz: mit Datum „6. Nov 2026“, sonst „Nov 2026“. Ungültig → „–“. */
  function wannText(x) {
    if (!x) return '–';
    if (datumGueltig(x.datum)) return datumText(x.datum);
    return monatFormat(x.monat) === '–' ? '–' : monatFormat(x.monat) + ' ' + x.monat.slice(0, 4);
  }

  /** Abstand in Worten: „vor 3 Tagen“, „vor 5 Wochen“ (unter 60 Tagen), sonst „vor 4 Monaten“. Ungültig → ''. */
  function abstandText(tage) {
    if (!istZahl(tage) || tage < 0) return '';
    if (tage === 0) return 'heute';
    if (tage < 14) return tage === 1 ? 'gestern' : 'vor ' + tage + ' Tagen';
    if (tage < 60) return 'vor ' + Math.round(tage / 7) + ' Wochen';
    return 'vor ' + Math.round(tage / (365.25 / 12)) + ' Monaten';
  }

  const hilfen = {
    CODE_LAENGE, ARTEN, MAX_KOMMENTAR, codeBereinigen, codePruefen, apiUrlGueltig, zahlFormat, euroFormat, kistenFormat,
    zeitFormat, datumGueltig, datumFormat, datumText, monatFormat, zeitraumFormat, heuteBerlin, tagePlus, tageZwischen, bestellStufe,
    reichweiteBalken,
    ganzeZahlEingabe, flaschenAusEingabe, kistenText, kistenTeilen, buchungPruefen, buchungText, anfrageIdAus, achse, diagrammMasse,
    achsenText, achseMitMinus, antwortDeuten, uebersichtGueltig, neuer,
    relativZeit, monatPlus, veraenderung, prozentText, richtung, monatsTrend, reiterPosition, ziehRichtung, gummiband,
    MAX_FLASCHEN, datumKurz, monateAnzahl, zeitraumKurz, monatBisher, kistenKurz, anteileSinnvoll, hinweiseOrdnen, verlaufOhneStorno, schrittWert,
    kundeSchluessel, verkaufZeilen, monatsWerte, jahresVergleich, kumuliert, zeitraumAuswerten, kundeDetails, nachfassen,
    bestellungenZaehlen, wannText, abstandText, monatName, wochentagText, dauerText,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = hilfen;
  else wurzel.SATE_HILFEN = hilfen;
})(typeof window !== 'undefined' ? window : globalThis);
