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

  /** `JJJJ-MM` → „Nov“ bzw. mit `lang` „November 2026“. Ungültig → „–“. */
  function monatFormat(m, lang) {
    if (typeof m !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return '–';
    const i = Number(m.slice(5, 7)) - 1;
    return lang ? MONATE_LANG[i] + ' ' + m.slice(0, 4) : MONATE_KURZ[i];
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

  /** Achsenbeschriftung kurz: 1.500 → „1.500“, 12.000 → „12 Tsd.“, 12.500 → „12,5 Tsd.“. */
  function achsenText(w) {
    return w >= 10000 ? zahlFormat(w / 1000, w % 1000 ? 1 : 0) + ' Tsd.' : zahlFormat(w, 0);
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

  const hilfen = {
    CODE_LAENGE, ARTEN, MAX_KOMMENTAR, codeBereinigen, codePruefen, apiUrlGueltig, zahlFormat, euroFormat, kistenFormat,
    zeitFormat, datumGueltig, datumFormat, datumText, monatFormat, zeitraumFormat, heuteBerlin, tagePlus, tageZwischen, bestellStufe,
    reichweiteBalken,
    ganzeZahlEingabe, flaschenAusEingabe, kistenText, kistenTeilen, buchungPruefen, buchungText, anfrageIdAus, achse, diagrammMasse,
    achsenText, antwortDeuten, uebersichtGueltig, neuer,
    relativZeit, monatPlus, veraenderung, prozentText, richtung, monatsTrend, reiterPosition, ziehRichtung, gummiband,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = hilfen;
  else wurzel.SATE_HILFEN = hilfen;
})(typeof window !== 'undefined' ? window : globalThis);
