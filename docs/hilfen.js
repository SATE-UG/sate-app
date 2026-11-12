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
    { art: 'Inventur', kurz: 'Bestand gezählt', text: 'Gezählt: so viele Flaschen stehen gerade da. Ab dann rechnet die App von dieser Zahl aus.' },
    { art: 'Umlagerung', kurz: 'Von A nach B', text: 'Flaschen von einem Standort zu einem anderen gebracht.' },
    { art: 'Promo', kurz: 'Verschenkt', text: 'Verschenkt fürs Marketing, z. B. Proben, Events, Gewinnspiele.' },
    { art: 'Eigenverbrauch', kurz: 'Selbst getrunken', text: 'Vom Team selbst getrunken.' },
    { art: 'Bruch', kurz: 'Kaputt, abgelaufen', text: 'Kaputt, abgelaufen oder sonst nicht mehr verkäuflich.' },
    { art: 'Abfüllung', kurz: 'Neue Flaschen da', text: 'Neue Flaschen vom Abfüller angekommen (Zugang). Steht danach auch im Tab Abfüllungen.' },
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
    const text = new Intl.NumberFormat('de-DE', { minimumFractionDigits: nachkomma || 0, maximumFractionDigits: nachkomma || 0 }).format(z);
    // −0,04 ist gerundet 0, nicht „-0“
    return /^-[0.,]+$/.test(text) ? text.slice(1) : text;
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

  /** Herstellkosten pro Flasche beim Eintragen einer Abfüllung: über 0 bis so viele Euro (wie die Schnittstelle). */
  const MAX_KOSTEN_PRO_FLASCHE = 100;

  /**
   * Herstellkosten pro Flasche aus dem Eingabefeld (nur bei einer Abfüllung, freiwillig): '' → { leer: true },
   * „0,85“, „0.8765“ oder „0,85 €“ → { wert } (auf vier Nachkommastellen), sonst { fehler }.
   */
  function kostenAusEingabe(text) {
    const t = String(text === undefined || text === null ? '' : text).trim().replace(/\s*€$/, '');
    if (!t) return { leer: true, wert: null, fehler: '' };
    const z = /^\d{1,3}([.,]\d{1,4})?$/.test(t) ? Number(t.replace(',', '.')) : NaN;
    if (!(z > 0) || z > MAX_KOSTEN_PRO_FLASCHE) return { leer: false, wert: null, fehler: 'Herstellkosten: bitte einen Betrag pro Flasche wie 0,85 eintragen (höchstens 100 €).' };
    return { leer: false, wert: Math.round(z * 10000) / 10000, fehler: '' };
  }

  /**
   * Formular „Eintragen“ prüfen wie die Schnittstelle. `b` = { art, standort, nach, flaschen, datum, kommentar, kosten },
   * `standorte` = Namen aus der Antwort, `heute` = `JJJJ-MM-TT`. `kosten` (nur Abfüllung, freiwillig) = Herstellkosten
   * pro Flasche als Zahl oder null. Rückgabe: Fehlermeldung oder ''.
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
    if (b.art === 'Abfüllung' && b.kosten !== undefined && b.kosten !== null && (!istZahl(b.kosten) || b.kosten <= 0 || b.kosten > MAX_KOSTEN_PRO_FLASCHE)) {
      return 'Herstellkosten: bitte einen Betrag pro Flasche wie 0,85 eintragen (höchstens 100 €).';
    }
    return '';
  }

  /**
   * Abkürzungen fürs Datum beim Eintragen: Heute, Gestern und in den ersten 10 Tagen eines Monats das Ende des Vormonats
   * (Stichtag z. B. für Dörflinger und die Jahresinventur am 31.12.). `heute` = `JJJJ-MM-TT`. Rückgabe [{ text, datum }].
   */
  function datumAbkuerzungen(heute) {
    if (!datumGueltig(heute)) return [];
    const liste = [{ text: 'Heute', datum: heute }, { text: 'Gestern', datum: tagePlus(heute, -1) }];
    const tag = Number(heute.slice(8, 10));
    const ende = tagePlus(heute.slice(0, 8) + '01', -1);
    if (tag <= 10 && ende !== tagePlus(heute, -1)) liste.push({ text: datumKurz(ende), datum: ende });
    return liste;
  }

  /**
   * Bestand vorher/nachher für die Vorschau beim Eintragen. `bestand` = Bestand laut App am Standort `von` (oder null),
   * `nachBestand` = am Ziel `nach` einer Umlagerung. Rückgabe Text oder ''. Inventur: Abweichung zur App.
   */
  function buchungVorschau(art, flaschen, bestand, nachBestand, nach, von) {
    const fl = (n) => zahlFormat(n, 0) + (Math.abs(n) === 1 ? ' Flasche' : ' Flaschen');
    if (!istZahl(flaschen)) return '';
    if (art === 'Umlagerung') {
      const teile = [];
      if (istZahl(bestand)) teile.push((von ? von + ': ' : 'hier: ') + fl(bestand - flaschen));
      if (istZahl(nachBestand) && nach) teile.push(nach + ': ' + fl(nachBestand + flaschen));
      return teile.length ? 'Danach ' + teile.join(', ') + '.' : '';
    }
    if (!istZahl(bestand)) return '';
    if (art === 'Inventur') {
      const d = flaschen - bestand;
      return d === 0 ? 'Passt genau zum Bestand laut App.' : 'Abweichung zur App: ' + (d > 0 ? '+' : '−') + fl(Math.abs(d)) + '.';
    }
    if (art === 'Abfüllung') return 'Danach: ' + fl(bestand + flaschen) + '.';
    if (ARTEN.some((a) => a.art === art)) return 'Danach: ' + fl(bestand - flaschen) + '.';
    return '';
  }

  /**
   * Text einer Rückfrage teilen: die Frage vorn (bis zum ersten „?“, höchstens 60 Zeichen, eine Zeile) als Titel, der
   * Rest als Erklärung. Ohne so eine Frage vorn bleibt alles Text. Rückgabe { titel, text }.
   */
  function frageTeilen(text) {
    const s = String(text === null || text === undefined ? '' : text).trim();
    const m = /^([^\n?]{1,59}\?)\s*([\s\S]*)$/.exec(s);
    return m ? { titel: m[1], text: m[2].trim() } : { titel: '', text: s };
  }

  /**
   * Update zum Teilen (z. B. in die WhatsApp-Gruppe), seit v27 mit dem Kurzfristigen zuerst: letzter voller Monat
   * (Flaschen, Vergleich, Bestellungen, neue Kunden), laufender Monat bisher, dann Jahr, Bestand und Bestelltermin.
   * `u` = Antwort `uebersicht`, `jv` = jahresVergleich, `heute` = `JJJJ-MM-TT`, `prognose` = bestellPrognose (sonst
   * die einfache Rechnung aus `u.bestellung`), `mehr` (optional) = { zeilen (verkaufZeilen), jvVorjahr (für den
   * Dezember im Januar und das abgelaufene Jahr) }. Nur Zahlen, keine Kundennamen.
   */
  function standText(u, jv, heute, prognose, mehr) {
    const fl = (n) => zahlFormat(n, 0) + (Math.abs(n) === 1 ? ' Flasche' : ' Flaschen');
    const pz = (p) => prozentText(p).replace(/\s/g, ' ');
    const zeilen = mehr && Array.isArray(mehr.zeilen) ? mehr.zeilen : null;
    const jvAlt = mehr && mehr.jvVorjahr ? mehr.jvVorjahr : null;
    const ok = datumGueltig(heute);
    const bloecke = [['📊 SATE Update' + (ok ? ' vom ' + datumKurz(heute) : '')]];
    // „6 Bestellungen, 2 neue Kunden“ eines Monats (nur mit Verkaufszeilen), sonst ''
    const kurz = (monat) => {
      if (!zeilen) return '';
      const n = bestellungenZaehlen(zeilen.filter((z) => z.monat === monat));
      const neu = zeitraumAuswerten(zeilen, monat, monat).kunden.filter((k) => k.erster === monat && k.flaschen > 0).length;
      return [n ? zahlFormat(n, 0) + (n === 1 ? ' Bestellung' : ' Bestellungen') : '',
        neu ? zahlFormat(neu, 0) + (neu === 1 ? ' neuer Kunde' : ' neue Kunden') : ''].filter(Boolean).join(', ');
    };
    const jetzt = ok ? heute.slice(0, 7) : '';
    const monate = [].concat(jvAlt && Array.isArray(jvAlt.monate) ? jvAlt.monate : [], jv && Array.isArray(jv.monate) ? jv.monate : []);
    // Letzter voller Monat (im Januar der Dezember aus dem Vorjahr)
    const lm = jetzt ? monate.find((m) => m.monat === monatPlus(jetzt, -1) && m.dieses) : null;
    if (lm) {
      const p = lm.vorjahr ? veraenderung(lm.dieses.flaschen, lm.vorjahr.flaschen) : null;
      const b = [(p > 0 ? '📈 ' : p < 0 ? '📉 ' : '📆 ') + monatName(lm.monat) + ': ' + fl(lm.dieses.flaschen) + (p !== null ? ', ' + pz(p) + ' zum Vorjahr' : '')];
      if (kurz(lm.monat)) b.push(kurz(lm.monat));
      bloecke.push(b);
    }
    // Laufender Monat bisher, dazu der ganze Monat im Vorjahr
    const lauf = jv && Array.isArray(jv.monate) ? jv.monate.find((m) => m.laufend && m.dieses) : null;
    if (lauf) {
      const vj = lauf.vorjahr && istZahl(lauf.vorjahr.flaschen) ? lauf.vorjahr.flaschen : null;
      const b = [(vj !== null && vj > 0 && lauf.dieses.flaschen >= vj ? '🚀 ' : '⏳ ') + monatName(lauf.monat) + ' bisher: ' + fl(lauf.dieses.flaschen)];
      if (kurz(lauf.monat)) b.push(kurz(lauf.monat));
      if (vj !== null) b.push('Ganzer ' + monatFormat(lauf.vorjahrMonat, true) + ': ' + fl(vj));
      bloecke.push(b);
    }
    const lage = [];
    // Jahr: im Januar das abgelaufene Jahr (der Januar steht schon oben), sonst dieses Jahr bisher
    const januar = jetzt.slice(5) === '01';
    const jahr = januar ? jvAlt : jv;
    if (jahr && jahr.bisher) {
      const p = jahr.vergleich ? veraenderung(jahr.vergleich.dieses.flaschen, jahr.vergleich.vorjahr.flaschen) : null;
      // Der Vergleich läuft nur über die vollen Monate: das steht dabei („bis Oktober +32 %“), außer das Jahr ist ganz um
      const bis = p !== null && jahr.vergleich.bis.slice(5) !== '12' ? 'bis ' + monatName(jahr.vergleich.bis) + ' ' : '';
      lage.push('📅 ' + (januar ? jahr.jahr + ' gesamt' : 'Dieses Jahr') + ': ' + fl(jahr.bisher.flaschen) + (p !== null ? ', ' + bis + pz(p) + ' zum Vorjahr' : ''));
    }
    const k = u && u.kennzahlen ? u.kennzahlen : {};
    if (istZahl(k.gesamtbestand)) lage.push('📦 Bestand: ' + fl(k.gesamtbestand) + (k.gesamtQuelle === 'inventur' ? ' (gezählt)' : ' (geschätzt)'));
    const b = prognose || (u && u.bestellung ? u.bestellung : {});
    if (ok && datumGueltig(b.spaetestensBestellen)) {
      const t = tageZwischen(heute, b.spaetestensBestellen);
      lage.push(t > 0 ? '🛒 Abfüllung bestellen bis ' + datumText(b.spaetestensBestellen)
        : t === 0 ? '⚠️ Abfüllung heute bestellen' : '⚠️ Abfüllung bestellen: überfällig seit ' + datumText(b.spaetestensBestellen));
    }
    if (lage.length) bloecke.push(lage);
    bloecke.push(['Trink SATE! 🤍']);
    return bloecke.map((x) => x.join('\n')).join('\n\n');
  }

  /**
   * Inventur eines Standorts genau am Tag `tag` (`JJJJ-MM-TT`) → { datum, flaschen } oder null. Aus `inventuren` der
   * Schnittstelle (die letzten Zählungen); ältere Antworten ohne das Feld: nur die letzte Inventur.
   */
  function inventurAm(lager, tag) {
    if (!lager || !datumGueltig(tag)) return null;
    if (Array.isArray(lager.inventuren)) {
      const x = lager.inventuren.find((i) => i && i.datum === tag && istZahl(i.flaschen));
      return x ? { datum: x.datum, flaschen: x.flaschen } : null;
    }
    return lager.letzteInventur === tag && istZahl(lager.gezaehlt) ? { datum: tag, flaschen: lager.gezaehlt } : null;
  }

  /** Stichtag der Jahresinventur, wenn `heute` im Dezember oder Januar liegt (31.12. des endenden Jahres), sonst ''. */
  function jahresStichtag(heute) {
    if (!datumGueltig(heute)) return '';
    const monat = Number(heute.slice(5, 7));
    if (monat !== 12 && monat !== 1) return '';
    return (Number(heute.slice(0, 4)) - (monat === 1 ? 1 : 0)) + '-12-31';
  }

  /**
   * Letzte Bestellung je Kunde (Zeilen mit Flaschen > 0; ohne Rechnungsdatum zählt das Monatsende) → Objekt
   * schluessel → { monat, datum, tage (seit heute; ohne gültiges `heute` null) }.
   */
  function letzteBestellungen(zeilen, heute) {
    const aus = Object.create(null);
    (zeilen || []).forEach((z) => {
      if (!(z.flaschen > 0)) return;
      const tag = zeilenTag(z);
      const alt = aus[z.schluessel];
      if (!alt || tag > alt.tag) aus[z.schluessel] = { monat: z.monat, datum: z.datum, tag: tag };
    });
    Object.keys(aus).forEach((k) => {
      aus[k].tage = datumGueltig(heute) ? tageZwischen(aus[k].tag, heute) : null;
      delete aus[k].tag;
    });
    return aus;
  }

  /** Tage eines Monats (`JJJJ-MM`). */
  function monatsTage(m) {
    return new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
  }

  /** `JJJJ-MM-TT` plus n Monate; der Tag bleibt, am Monatsende gekappt (31.3. − 1 Monat = 28.2.), wie in der Schnittstelle. */
  function datumMonatePlus(t, n) {
    const m = monatPlus(t.slice(0, 7), n);
    const tag = Math.min(Number(t.slice(8, 10)), monatsTage(m));
    return m + '-' + (tag < 10 ? '0' : '') + tag;
  }

  /**
   * Bestandsverlauf nach Saison, Tag für Tag: Ab `heute` (`JJJJ-MM-TT`) mit `bestand` Flaschen geht in jedem Monat so
   * viel weg wie im gleichen Monat ein Jahr vorher (`werte` aus monatsWerte) mal `o.faktor` (Standard 1); ab 12 Monaten
   * voraus zählt der gleiche Monat zwei Jahre vorher usw., so wiederholt sich das zuletzt bekannte Saisonprofil. Fehlt
   * ein Monat: `o.proMonat`; negative Monate (Gutschriften) zählen als 0.
   * Schon geschriebene Rechnungen (Codex v24): `o.geschrieben` = { 'JJJJ-MM': Flaschen je Rechnungsmonat } (Standard:
   * `o.bisher` im laufenden Monat) mindert, was in diesem Monat noch erwartet wird; die mit Lagerdatum nach heute
   * (`o.abgaenge` = { 'JJJJ-MM-TT': Flaschen }, im Bestand noch nicht abgezogen) gehen an genau diesem Tag weg. Der Rest
   * verteilt sich gleichmäßig auf die Tage, im laufenden Monat auf die Resttage und höchstens im Monatstempo (am
   * Monatsletzten nichts mehr, sonst spränge die Prognose von einem Tag zum nächsten um einen Monat).
   * „Leer“ = Bestand erreicht `o.mindest` (Standard 0). Höchstens `o.max` Monate (Standard 24). Rückgabe { punkte:
   * [{datum, bestand}] (heute, dann Monatsenden, zuletzt der Tag „leer“), leer (`JJJJ-MM-TT` oder null) } oder null.
   */
  function prognoseSaison(bestand, heute, werte, o) {
    const opt = o || {};
    if (!istZahl(bestand) || !datumGueltig(heute) || typeof werte !== 'function') return null;
    const faktor = istZahl(opt.faktor) && opt.faktor >= 0 ? opt.faktor : 1;
    const ersatz = istZahl(opt.proMonat) && opt.proMonat > 0 ? opt.proMonat : 0;
    const mindest = istZahl(opt.mindest) && opt.mindest > 0 ? opt.mindest : 0;
    const max = opt.max > 0 ? opt.max : 24;
    const jetzt = heute.slice(0, 7);
    const geschrieben = opt.geschrieben || { [jetzt]: istZahl(opt.bisher) ? opt.bisher : 0 };
    const abgaenge = opt.abgaenge || {};
    const zwei = (n) => (n < 10 ? '0' : '') + n;
    const erwartet = (m) => {
      let r = monatPlus(m, -12);
      while (r >= jetzt) r = monatPlus(r, -12);
      const v = werte(r);
      return v && istZahl(v.flaschen) ? Math.max(0, v.flaschen) * faktor : ersatz;
    };
    const punkte = [{ datum: heute, bestand: runde(bestand) }];
    if (bestand <= mindest) return { punkte: punkte, leer: heute };
    let rest = bestand - mindest;
    let m = jetzt;
    for (let i = 0; i <= max; i++) {
      const tage = monatsTage(m);
      const ab = i === 0 ? Number(heute.slice(8, 10)) : 0; // im laufenden Monat ab morgen
      const e = erwartet(m);
      const offen = Math.max(0, e - (istZahl(geschrieben[m]) ? geschrieben[m] : 0));
      const verteilt = i === 0 ? Math.min(offen, e * ((tage - ab) / tage)) : offen;
      const proTag = tage > ab ? verteilt / (tage - ab) : 0;
      for (let t = ab + 1; t <= tage; t++) {
        const datum = m + '-' + zwei(t);
        const weg = proTag + (istZahl(abgaenge[datum]) ? abgaenge[datum] : 0);
        rest -= weg;
        if (weg > 0 && rest <= 1e-9) {
          punkte.push({ datum: datum, bestand: runde(mindest) });
          return { punkte: punkte, leer: datum };
        }
      }
      const monatsende = m + '-' + zwei(tage);
      if (monatsende !== heute) punkte.push({ datum: monatsende, bestand: runde(rest + mindest) });
      m = monatPlus(m, 1);
    }
    return { punkte: punkte, leer: null };
  }

  /** Erster Monat mit verkauften Flaschen (`JJJJ-MM`): aus den Verkaufszeilen, sonst aus den Monatswerten der Schnittstelle. */
  function ersterVerkaufsmonat(verkaeufe, zeilen) {
    let erster = null;
    const nehmen = (m, fl) => { if (MONAT_MUSTER.test(m) && istZahl(fl) && fl > 0 && (!erster || m < erster)) erster = m; };
    if (Array.isArray(zeilen)) zeilen.forEach((z) => nehmen(z.monat, z.flaschen));
    else {
      const v = verkaeufe || {};
      [].concat(Array.isArray(v.vergleichsmonate) ? v.vergleichsmonate : [], Array.isArray(v.monate) ? v.monate : [])
        .forEach((x) => { if (x) nehmen(x.monat, x.flaschen); });
    }
    return erster;
  }

  const BALD_TAGE = 30; // wie BALD_TAGE der Schnittstelle (api/src/Konfig.js)
  const PROGNOSE_MONATE = 24;
  const KUNDE_VORMONAT = 'dörflinger'; // wie KUNDE_VORMONAT der Schnittstelle (api/src/Konfig.js)

  /**
   * Schon geschriebene Rechnungen für die Prognose (aus `verkaeufe.zeilen` der Schnittstelle, auch spätere Monate):
   * `geschrieben` = { 'JJJJ-MM': Flaschen } ab dem laufenden Rechnungsmonat, `abgaenge` = { 'JJJJ-MM-TT': Flaschen } mit
   * Lagerdatum nach `heute`, die der Bestand noch nicht abzieht. Lagerdatum wie in der Schnittstelle
   * (`verkaufLagerdatum`): Rechnungsdatum, Dörflinger am letzten Tag des Vormonats, Altzeilen ohne Datum am Monatsende
   * (im laufenden Monat schon abgezogen). Ohne Zeilen null.
   */
  function bekannteRechnungen(verkaeufe, heute) {
    if (!verkaeufe || !Array.isArray(verkaeufe.zeilen) || !datumGueltig(heute)) return null;
    const jetzt = heute.slice(0, 7);
    const geschrieben = {}; // Schlüssel nur `JJJJ-MM` bzw. `JJJJ-MM-TT` (geprüft), also keine Kollision mit Object-Eigenschaften
    const abgaenge = {};
    const ende = (m) => m + '-' + monatsTage(m);
    verkaeufe.zeilen.forEach((z) => {
      if (!Array.isArray(z) || typeof z[0] !== 'string' || !MONAT_MUSTER.test(z[0]) || !istZahl(z[4])) return;
      const fl = z[4];
      if (z[0] >= jetzt) geschrieben[z[0]] = runde((geschrieben[z[0]] || 0) + fl);
      const datum = datumGueltig(z[1]) ? z[1] : '';
      let lager;
      if (!datum) lager = z[0] > jetzt ? ende(z[0]) : '';
      else lager = String(z[3] || '').toLowerCase().indexOf(KUNDE_VORMONAT) >= 0 ? ende(monatPlus(datum.slice(0, 7), -1)) : datum;
      if (lager && lager > heute) abgaenge[lager] = runde((abgaenge[lager] || 0) + fl);
    });
    return { geschrieben: geschrieben, abgaenge: abgaenge };
  }

  /**
   * Bestellprognose (seit v24 die eine Rechnung für Start-Karte und Teilen). Erwartete Verkäufe: jeder Monat wie im
   * Vorjahr mal Wachstum. Wachstum = Verkäufe im Ø-Zeitraum der Schnittstelle (`kennzahlen.abverkaufVon`–`abverkaufBis`,
   * Einstellung „Zeitraum für Ø-Abverkauf“, seit 2026-11-09 die letzten 12 vollen Monate) ÷ dieselben Monate ein Jahr früher. So läuft der Bestand im Winter langsam und
   * im Sommer schnell ab, statt mit einem Sommer-Ø gerade nach unten. Spätestens bestellen = leer − Vorlauf − Puffer,
   * Status wie in der Schnittstelle (vorbei → „jetzt bestellen“, höchstens 30 Tage → „bald“, sonst „ok“).
   * Ohne genug Vorjahr (höchstens die Hälfte der Vergleichsmonate nach `erster` = erster Monat mit Verkäufen, Monate
   * fehlen, dort oder zuletzt nichts verkauft) gilt die einfache Rechnung der Schnittstelle (`u.bestellung`: Bestand ÷ Ø,
   * gerade Linie). Vergleichsmonate vor `erster` zählen als 0.
   * `bekannt` = bekannteRechnungen (mit Verkaufszeilen), sonst zählt der Monatswert des laufenden Monats als geschrieben.
   * Die Vorschau reicht 24 Monate plus Vorlauf und Puffer weit, damit „reicht länger“ nie einen fälligen Termin verdeckt.
   * Rückgabe null ohne Bestand, sonst { art: 'saison' | 'schnitt', bestand, mindest, wachstum, von, bis, proMonat,
   *   punkte [{datum, bestand}], leerAm, reichtUeber (`JJJJ-MM`, wenn es länger reicht als die Vorschau),
   *   spaetestensBestellen, tage (bis dahin), status, ankunft (neue Flaschen da, wenn spätestens bzw. heute bestellt),
   *   luecke (Tage ohne Flaschen zwischen „leer“ und Ankunft), vorlaufMonate, pufferWochen }.
   */
  function bestellPrognose(u, werte, heute, erster, bekannt) {
    const k = u && u.kennzahlen ? u.kennzahlen : {};
    const b = u && u.bestellung ? u.bestellung : {};
    if (!istZahl(k.gesamtbestand) || !datumGueltig(heute)) return null;
    const bestand = k.gesamtbestand;
    const mindest = istZahl(k.mindestbestand) && k.mindestbestand > 0 ? k.mindestbestand : 0;
    const vorlauf = istZahl(b.vorlaufMonate) && b.vorlaufMonate >= 0 ? Math.round(b.vorlaufMonate) : null;
    const puffer = istZahl(b.pufferWochen) && b.pufferWochen >= 0 ? b.pufferWochen : null;
    const jetzt = heute.slice(0, 7);
    const bis = MONAT_MUSTER.test(k.abverkaufBis || '') && k.abverkaufBis < jetzt ? k.abverkaufBis : monatPlus(jetzt, -1);
    const von = MONAT_MUSTER.test(k.abverkaufVon || '') && k.abverkaufVon <= bis ? k.abverkaufVon : monatPlus(bis, -5);
    const fl = (m) => {
      const v = typeof werte === 'function' ? werte(m) : null;
      return v && istZahl(v.flaschen) ? v.flaschen : null;
    };
    // Wachstum: Ø-Zeitraum gegen dieselben Monate ein Jahr früher (Mark 2026-11-09: die letzten 12 Monate, Einstellung
    // „Zeitraum für Ø-Abverkauf“ = 12). Monate vor dem ersten Verkauf zählen im Vorjahr als 0 (Startphase); mehr als die
    // Hälfte der Vorjahresmonate muss aber danach liegen, sonst wäre das Wachstum im ersten Jahr beliebig groß
    let wachstum = null;
    const n = monateAnzahl(von, bis);
    if (vorlauf !== null && puffer !== null && MONAT_MUSTER.test(erster || '') && n) {
      let jetztSumme = 0;
      let vorSumme = 0;
      let mitVerkauf = 0;
      let fehlt = false;
      for (let m = von; m <= bis; m = monatPlus(m, 1)) {
        const vm = monatPlus(m, -12);
        const a = fl(m);
        const v = vm >= erster ? fl(vm) : 0;
        if (vm >= erster) mitVerkauf++;
        if (a === null || v === null) fehlt = true;
        else {
          jetztSumme += a;
          vorSumme += v;
        }
      }
      if (!fehlt && mitVerkauf * 2 > n && vorSumme > 0 && jetztSumme > 0) wachstum = jetztSumme / vorSumme;
    }
    const proMonat = istZahl(k.abverkaufProMonat) ? k.abverkaufProMonat : null;
    let art;
    let punkte;
    let leerAm;
    let reichtUeber = null;
    let spaetestens;
    let status;
    if (wachstum !== null) {
      const p = prognoseSaison(bestand, heute, werte, { faktor: wachstum, proMonat: proMonat, mindest: mindest,
        geschrieben: bekannt ? bekannt.geschrieben : { [jetzt]: fl(jetzt) || 0 }, abgaenge: bekannt ? bekannt.abgaenge : {},
        max: PROGNOSE_MONATE + vorlauf + Math.ceil(puffer / 4) });
      art = 'saison';
      punkte = p.punkte;
      leerAm = p.leer;
      if (!leerAm) reichtUeber = punkte[punkte.length - 1].datum.slice(0, 7);
      spaetestens = leerAm ? tagePlus(datumMonatePlus(leerAm, -vorlauf), -Math.round(puffer * 7)) : null;
      const t = spaetestens ? tageZwischen(heute, spaetestens) : null;
      status = t === null ? 'ok' : t < 0 ? 'jetzt bestellen' : t <= BALD_TAGE ? 'bald' : 'ok';
    } else {
      // Einfache Rechnung der Schnittstelle: Bestand ÷ Ø bis „leer“, gerade Linie
      art = 'schnitt';
      leerAm = datumGueltig(b.leerAm) ? b.leerAm : null;
      punkte = [{ datum: heute, bestand: runde(bestand) }];
      if (leerAm && leerAm > heute) punkte.push({ datum: leerAm, bestand: runde(mindest) });
      spaetestens = datumGueltig(b.spaetestensBestellen) ? b.spaetestensBestellen : null;
      status = typeof b.status === 'string' ? b.status : null;
    }
    const tage = spaetestens ? tageZwischen(heute, spaetestens) : null;
    const ab = spaetestens ? (spaetestens < heute ? heute : spaetestens) : null;
    const ankunft = ab && vorlauf !== null ? datumMonatePlus(ab, vorlauf) : null;
    return {
      art: art, bestand: bestand, mindest: mindest, wachstum: wachstum, von: von, bis: bis, proMonat: proMonat,
      punkte: punkte, leerAm: leerAm, reichtUeber: reichtUeber, spaetestensBestellen: spaetestens, tage: tage, status: status,
      ankunft: ankunft, luecke: ankunft && leerAm && ankunft > leerAm ? tageZwischen(leerAm, ankunft) : 0,
      vorlaufMonate: vorlauf, pufferWochen: puffer,
    };
  }

  /**
   * „Was ist passiert“ (Start): Rechnungen (`verkaufListe` der Schnittstelle) und Buchungen (Verlauf, ohne Storno-
   * Gegenzeilen) gemischt, neueste zuerst; am gleichen Tag erst Buchungen, dann Rechnungen; mit `heute` nichts aus der
   * Zukunft. Rückgabe höchstens `n` (Standard 5) Einträge { typ: 'rechnung' | 'buchung', datum, ... das Original }.
   */
  function aktivitaet(rechnungen, eintraege, n, heute) {
    const bisHeute = (x) => x && datumGueltig(x.datum) && (!datumGueltig(heute) || x.datum <= heute);
    const r = (Array.isArray(rechnungen) ? rechnungen : []).filter(bisHeute).map((x) => Object.assign({ typ: 'rechnung' }, x));
    const b = verlaufOhneStorno(eintraege).filter(bisHeute).map((x, i) => Object.assign({ typ: 'buchung', reihe: i }, x));
    return b.concat(r).sort((x, y) => (x.datum < y.datum ? 1 : x.datum > y.datum ? -1 : 0) ||
      (x.typ === y.typ ? (x.reihe || 0) - (y.reihe || 0) : x.typ === 'buchung' ? -1 : 1)).slice(0, n > 0 ? n : 5);
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

  /**
   * Tempo eines Fingers beim Loslassen in px/ms (nach unten positiv): Weg der Punkte aus den letzten `fensterMs`
   * (Standard 110) vor `jetzt`, geteilt durch die Zeit vom ersten dieser Punkte bis zum Loslassen. Lag der Finger
   * zuletzt still, zählt der Stillstand also mit und das Tempo fällt. `spur` = [{ t, y }] in Reihenfolge.
   */
  function ziehTempo(spur, jetzt, fensterMs) {
    const fenster = fensterMs > 0 ? fensterMs : 110;
    const frisch = (spur || []).filter((p) => p && istZahl(p.t) && istZahl(p.y) && jetzt - p.t <= fenster && p.t <= jetzt);
    if (!frisch.length) return 0;
    const a = frisch[0];
    const b = frisch[frisch.length - 1];
    const dauer = jetzt - a.t;
    return dauer > 0 ? (b.y - a.y) / dauer : 0;
  }

  /** Blatt nach dem Ziehen schließen? Weit genug (über 110 px) oder mit Schwung (über 0,5 px/ms ab 24 px Weg). */
  function blattSchliesst(weg, tempo) {
    if (!istZahl(weg) || !(weg > 0)) return false;
    return weg > 110 || (weg > 24 && istZahl(tempo) && tempo > 0.5);
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
        '. Der Bestand ist geschätzt (aus Abfüllungen minus Verkäufe). Nach der Inventur zeigt die App den echten Bestand.';
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
  // Seit v36 läuft der Rohertrag mit, wenn die Quelle ihn mitbringt (Verkäufe mit Herstellkosten, siehe auswerten →
  // werte); null heißt: Herstellkosten unbekannt. Ohne das Feld bleibt alles wie bisher bei Flaschen und Umsatz.
  const summeRunden = (x) => (!x ? null : x.rohertrag === undefined ? { flaschen: runde(x.flaschen), umsatz: runde(x.umsatz) }
    : { flaschen: runde(x.flaschen), umsatz: runde(x.umsatz), rohertrag: x.rohertrag === null ? null : runde(x.rohertrag) });
  function addieren(ziel, x) {
    ziel.flaschen += x.flaschen;
    ziel.umsatz += x.umsatz;
    if (x.rohertrag !== undefined) ziel.rohertrag = x.rohertrag === null || ziel.rohertrag === null ? null : (ziel.rohertrag || 0) + x.rohertrag;
    return ziel;
  }

  /** Wie die Schnittstelle: Kunden gleich, wenn sie bis auf Groß/klein und Leerzeichen gleich heißen. */
  function kundeSchluessel(kunde) {
    return String(kunde || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  /**
   * Rechnungsnummer ohne den Positions-Zusatz: weitere Flaschenzeilen derselben Rechnung stehen im Sheet als „RE… #2“,
   * „RE… #3“. „RE760175 #2“ → „RE760175“. Bliebe nichts übrig, gilt der Text wie er ist. Dieselbe Regel wie in der
   * Schnittstelle (api/src/VerkaufLogik.js), ein Test hält beide gleich.
   */
  function rechnungOhnePosition(text) {
    const t = String(text === undefined || text === null ? '' : text).trim();
    return t.replace(/(\s*#\s*\d+)+$/, '') || t;
  }

  /** Wert der gesperrten Zeile „Verschieden“ in der Standort-Auswahl (kein Standort heißt so). */
  const STANDORT_VERSCHIEDEN = '__verschieden__';

  /**
   * Auswahl „Standort einer Rechnung“ (Verkäufe zuordnen) für einen Eintrag `r` der `verkaufListe` und die Standorte
   * `orte`: { wert (vorgewählt), gesetzt (eigene Zuordnung, weiß statt grau), optionen: [{ wert, text, gesperrt }] }.
   * Wert '' = Standard. Ohne eigene Zuordnung steht der Standard-Standort oben und fehlt in der Liste darunter, mit
   * Zuordnung heißt die erste Zeile „Standard (zurücksetzen)“. Zählen die Positionen der Rechnung bei verschiedenen
   * Standorten (`gemischt`), ist die gesperrte Zeile „Verschieden“ vorgewählt: So ist jede Wahl, auch der Standard oder
   * der Standort der ersten Position, eine Änderung und setzt alle Positionen gleich.
   */
  function standortAuswahl(r, orte) {
    const liste = (Array.isArray(orte) ? orte : []).filter((o) => typeof o === 'string' && o);
    const zeile = (o) => ({ wert: o, text: o, gesperrt: false });
    if (r && r.gemischt) {
      return { wert: STANDORT_VERSCHIEDEN, gesetzt: true, optionen: [{ wert: STANDORT_VERSCHIEDEN, text: 'Verschieden', gesperrt: true },
        { wert: '', text: 'Standard (zurücksetzen)', gesperrt: false }].concat(liste.map(zeile)) };
    }
    const standort = r && typeof r.standort === 'string' ? r.standort : '';
    const eigen = !!(r && r.standortGesetzt);
    const gesetzt = eigen ? standort : '';
    const rest = liste.concat(gesetzt && liste.indexOf(gesetzt) < 0 ? [gesetzt] : [])
      .filter((o) => eigen || o !== standort); // ohne eigene Zuordnung steht der Standard schon oben
    return { wert: gesetzt, gesetzt: !!gesetzt,
      optionen: [{ wert: '', text: eigen ? 'Standard (zurücksetzen)' : standort, gesperrt: false }].concat(rest.map(zeile)) };
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
        const rechnung = rechnungOhnePosition(z[6]);
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
   * Laufende Summen über die 12 Monate. Ab dem ersten fehlenden Monat (noch nicht da, unbekannt oder Wert null) bleibt alles null,
   * sonst wäre eine spätere Summe nicht mehr „seit Januar“. `groesse` = 'flaschen' | 'umsatz'.
   */
  function kumuliert(monate, schluessel, groesse) {
    let summe = 0;
    let luecke = false;
    return (monate || []).map((m) => {
      const x = m && m[schluessel];
      // null in der gewählten Größe heißt unbekannt (Rohertrag ohne Herstellkosten, Codex v36): ab dort keine Summe mehr
      if (!x || luecke || x[groesse] === null) { luecke = true; return null; }
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
   * Zeilen haben); ohne Rechnungsnummer Zeilen desselben Kunden mit gleichem Rechnungsdatum, Altzeilen ohne beides einzeln.
   */
  function bestellungenZaehlen(zeilen) {
    const schon = Object.create(null);
    let einzeln = 0;
    (zeilen || []).forEach((z) => {
      if (!(z.flaschen > 0)) return;
      if (z.rechnung) schon['r:' + z.rechnung] = true;
      else if (z.datum) schon['d:' + z.datum + '|' + (z.schluessel || '')] = true;
      else einzeln++;
    });
    return Object.keys(schon).length + einzeln;
  }

  /**
   * Kanäle und Kunden in [von, bis] (Monate `JJJJ-MM`, beide inklusive) aus den Zeilen. Rückgabe { von, bis, flaschen,
   * umsatz, kanaele: [{kanal, flaschen, umsatz}], kunden: [{schluessel, kunde, kanal, flaschen, umsatz, erster}] }, beide
   * nach Flaschen absteigend (bei Gleichstand Umsatz, dann Name). `erster` = erster Monat des Kunden überhaupt mit einem Kauf (Flaschen > 0; hat er nie gekauft, die erste Zeile).
   */
  function zeitraumAuswerten(zeilen, von, bis) {
    const kanaele = Object.create(null);
    const kunden = Object.create(null);
    const erster = Object.create(null);
    const ersteZeile = Object.create(null);
    const summe = leerSumme();
    (zeilen || []).forEach((z) => {
      // „Kunde seit“ und „neu“ richten sich nach dem ersten Kauf: Eine frühere Gutschrift macht niemanden zum Bestandskunden
      if (z.flaschen > 0 && (!erster[z.schluessel] || z.monat < erster[z.schluessel])) erster[z.schluessel] = z.monat;
      if (!ersteZeile[z.schluessel] || z.monat < ersteZeile[z.schluessel]) ersteZeile[z.schluessel] = z.monat;
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
        flaschen: runde(kunden[s].flaschen), umsatz: runde(kunden[s].umsatz), erster: erster[s] || ersteZeile[s],
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

  function zehntel(z) { return Math.round(z * 10) / 10; }

  /**
   * Bestellungen aus den Verkaufszeilen: Zeilen einer Rechnung desselben Kunden zusammengezählt, ohne Rechnungsnummer
   * Zeilen desselben Kunden am selben Tag, Altzeilen ohne Nummer und Datum jede für sich. In der Reihenfolge der Zeilen,
   * je { monat, datum ('' ohne Rechnungsdatum, sonst das späteste der Zeilen), kunde, schluessel, kanal, flaschen,
   * umsatz, reihe (Stelle der ersten Zeile), zeilenNr (Stellen aller Zeilen) }. Gutschriften sind dabei (Summe ≤ 0),
   * der Aufrufer filtert.
   */
  function bestellListe(zeilen) {
    const nach = Object.create(null);
    const liste = [];
    (Array.isArray(zeilen) ? zeilen : []).forEach((z, i) => {
      if (!z || !istZahl(z.flaschen)) return;
      const datum = datumGueltig(z.datum) ? z.datum : '';
      // Rechnung und Kunde: Stünde dieselbe Nummer einmal bei zwei Kunden, blieben es zwei Bestellungen
      const k = z.rechnung ? 'r\n' + z.rechnung + '\n' + z.schluessel : datum ? 'k\n' + z.schluessel + '\n' + datum : 'a\n' + i;
      let b = nach[k];
      if (!b) {
        b = nach[k] = { monat: z.monat, datum: datum, kunde: z.kunde || '', schluessel: z.schluessel, kanal: z.kanal || '', flaschen: 0, umsatz: 0, reihe: i, zeilenNr: [] };
        liste.push(b);
      }
      b.zeilenNr.push(i);
      if (datum > b.datum) b.datum = datum;
      b.flaschen = runde(b.flaschen + z.flaschen);
      b.umsatz = runde(b.umsatz + (istZahl(z.umsatz) ? z.umsatz : 0));
    });
    return liste;
  }

  /**
   * Zahlen fürs Dashboard (seit v30): alles Wichtige klein auf einem Bildschirm, gerechnet aus den schon geladenen
   * Verkäufen. `zeilen` aus verkaufZeilen (null bei einer älteren Schnittstelle), `werte` aus monatsWerte, `jv` aus
   * jahresVergleich, `heute` = `JJJJ-MM-TT`. Rückgabe (ohne gültiges `heute` oder `werte` null):
   * { heute,
   *   monate: die letzten `anzahlMonate` (Standard 6) Monate, neuester zuerst, je { monat, laufend, flaschen, umsatz
   *     (null, wenn der Monat in den Daten fehlt), pFlaschen, pUmsatz (Veränderung zum Vormonat in Prozent; null beim
   *     laufenden Monat, der erst „bis heute“ zählt, und wenn der Vormonat fehlt oder ≤ 0 ist), anteil (Flaschen in
   *     Prozent des stärksten gezeigten Monats, für den Balken) },
   *   laufend, letzter: der laufende und der letzte volle Monat (dieselben Objekte wie in `monate`),
   *   jahr: { jahr, flaschen, umsatz, pFlaschen, pUmsatz (zum Vorjahr über die vollen Monate beider Jahre) } oder null,
   *   bestellungen: die letzten `anzahlBestellungen` (Standard 5) Bestellungen mit Rechnungsdatum bis heute, neueste
   *     zuerst (am selben Tag die spätere Zeile im Sheet zuerst), je { datum, kunde, kanal, flaschen, umsatz }; Zeilen
   *     einer Rechnung desselben Kunden sind zusammengezählt, ohne Rechnungsnummer Zeilen desselben Kunden am selben Tag;
   *     Gutschriften (Summe ≤ 0) fehlen,
   *   kanaele: Kanäle des laufenden Jahres nach Flaschen, höchstens vier Teile (ab fünf Kanälen die drei größten und
   *     „Weitere“; Kanäle ohne Flaschen im Plus fehlen), je { kanal, flaschen, umsatz, anteil (Prozent der gezeigten
   *     Flaschen), anteilUmsatz (Prozent des gezeigten Umsatzes) } }.
   */
  function dashboardDaten(zeilen, werte, jv, heute, anzahlMonate, anzahlBestellungen) {
    if (!datumGueltig(heute) || typeof werte !== 'function') return null;
    const jetzt = heute.slice(0, 7);
    const wert = (m) => {
      const x = werte(m);
      return x && istZahl(x.flaschen) ? { flaschen: x.flaschen, umsatz: istZahl(x.umsatz) ? x.umsatz : 0 } : null;
    };
    const nMonate = anzahlMonate > 0 ? Math.floor(anzahlMonate) : 6;
    const monate = [];
    for (let i = 0; i < nMonate; i++) {
      const m = monatPlus(jetzt, -i);
      const x = wert(m);
      const vor = i === 0 || !x ? null : wert(monatPlus(m, -1));
      monate.push({ monat: m, laufend: i === 0, flaschen: x ? x.flaschen : null, umsatz: x ? x.umsatz : null,
        pFlaschen: vor ? veraenderung(x.flaschen, vor.flaschen) : null, pUmsatz: vor ? veraenderung(x.umsatz, vor.umsatz) : null, anteil: 0 });
    }
    const hoch = Math.max.apply(null, monate.map((m) => (m.flaschen > 0 ? m.flaschen : 0)).concat([0]));
    if (hoch > 0) monate.forEach((m) => { m.anteil = m.flaschen > 0 ? Math.round((m.flaschen / hoch) * 1000) / 10 : 0; });

    const vg = jv && jv.vergleich;
    const jahr = jv && jv.bisher && istZahl(jv.bisher.flaschen)
      ? { jahr: jv.jahr, flaschen: jv.bisher.flaschen, umsatz: istZahl(jv.bisher.umsatz) ? jv.bisher.umsatz : 0,
        pFlaschen: vg ? veraenderung(vg.dieses.flaschen, vg.vorjahr.flaschen) : null,
        pUmsatz: vg ? veraenderung(vg.dieses.umsatz, vg.vorjahr.umsatz) : null }
      : null;

    const nBest = anzahlBestellungen > 0 ? Math.floor(anzahlBestellungen) : 5;
    const bestellungen = bestellListe(zeilen).filter((b) => b.datum && b.datum <= heute && b.flaschen > 0)
      .sort((x, y) => (x.datum < y.datum ? 1 : x.datum > y.datum ? -1 : y.reihe - x.reihe)).slice(0, nBest)
      .map((b) => ({ datum: b.datum, kunde: b.kunde, kanal: b.kanal, flaschen: b.flaschen, umsatz: b.umsatz }));

    let kanaele = [];
    if (Array.isArray(zeilen)) {
      const alle = zeitraumAuswerten(zeilen, jetzt.slice(0, 4) + '-01', jetzt).kanaele.filter((k) => k.flaschen > 0);
      // Umsatz je Kanal erst bei 0 kappen (Gutschriften), dann zusammenfassen: so stimmen die Anteile mit der Tabelle
      // aller Kanäle (dashboardMehr) überein
      const mit = alle.map((k) => ({ kanal: k.kanal, flaschen: k.flaschen, umsatz: k.umsatz, plus: Math.max(0, k.umsatz) }));
      const teile = mit.length > 4 ? mit.slice(0, 3).concat([mit.slice(3).reduce((x, k) => ({ kanal: 'Weitere',
        flaschen: runde(x.flaschen + k.flaschen), umsatz: runde(x.umsatz + k.umsatz), plus: x.plus + k.plus }), { kanal: 'Weitere', flaschen: 0, umsatz: 0, plus: 0 })]) : mit;
      const summe = teile.reduce((x, k) => x + k.flaschen, 0);
      const euro = teile.reduce((x, k) => x + k.plus, 0);
      kanaele = teile.map((k) => ({ kanal: k.kanal, flaschen: k.flaschen, umsatz: k.umsatz, anteil: zehntel((k.flaschen / summe) * 100),
        anteilUmsatz: euro > 0 ? zehntel((k.plus / euro) * 100) : 0 }));
    }
    return { heute: heute, monate: monate, laufend: monate[0], letzter: monate[1] || null, jahr: jahr, bestellungen: bestellungen, kanaele: kanaele };
  }

  /**
   * Schichten für First in, First out aus den Abfüllungen der Schnittstelle ([{ abfuellung, monat, flaschen,
   * kostenProFlasche }]): eine Schicht je Abfüllung in zeitlicher Reihenfolge (Monat, bei Gleichstand wie im Sheet).
   * Storno-Zeilen („Storno N. Abfüllung“ mit negativen Flaschen) heben ihre Abfüllung auf, egal wo sie stehen; eine
   * Abfüllung ohne lesbaren Monat bleibt an ihrer Stelle im Sheet. Je { name, monat, flaschen, kosten (Herstellkosten
   * pro Flasche oder null) }. Liefert die Schnittstelle keine Kosten (Feld fehlt überall, weil
   * der Tab Abfüllungen die Kosten-Spalte nicht hat oder die Schnittstelle älter ist): null.
   */
  function fifoSchichten(abfuellungen) {
    const liste = Array.isArray(abfuellungen) ? abfuellungen : [];
    if (!liste.some((a) => a && a.kostenProFlasche !== undefined)) return null;
    const name = (a) => String(a.abfuellung || '').trim();
    const schichten = [];
    let monat = ''; // Abfüllung ohne lesbaren Monat: steht zeitlich dort, wo sie im Sheet steht (Monat der Zeile davor)
    liste.forEach((a, i) => {
      if (!a || !istZahl(a.flaschen) || !(a.flaschen > 0)) return;
      if (typeof a.monat === 'string' && MONAT_MUSTER.test(a.monat)) monat = a.monat;
      schichten.push({ name: name(a), monat: typeof a.monat === 'string' && MONAT_MUSTER.test(a.monat) ? a.monat : '', ordnung: monat, flaschen: a.flaschen,
        kosten: istZahl(a.kostenProFlasche) && a.kostenProFlasche > 0 ? a.kostenProFlasche : null, reihe: i });
    });
    // Gegenzeilen eines Stornos (zweiter Durchgang): Die Abfüllung dieses Namens, die im Sheet zuletzt VOR der
    // Gegenzeile steht und noch Flaschen hat, verliert sie. Eine danach neu eingetragene Abfüllung mit derselben
    // Nummer bleibt also stehen (die App vergibt die Nummer nach einem Storno wieder). Steht keine davor, die erste
    // danach. Was zu keiner Abfüllung passt, bleibt stehen (dashboardMehr meldet die Abweichung).
    liste.forEach((a, i) => {
      if (!a || !istZahl(a.flaschen) || !(a.flaschen < 0)) return;
      const ziel = name(a).replace(/^Storno\s+/i, '');
      let rest = -a.flaschen;
      const passend = schichten.filter((x) => x.name === ziel);
      passend.filter((x) => x.reihe < i).reverse().concat(passend.filter((x) => x.reihe > i)).forEach((x) => {
        const weg = Math.min(rest, x.flaschen);
        x.flaschen = runde(x.flaschen - weg);
        rest -= weg;
      });
    });
    return schichten.filter((x) => x.flaschen > 0).sort((x, y) => (x.ordnung < y.ordnung ? -1 : x.ordnung > y.ordnung ? 1 : x.reihe - y.reihe))
      .map((x) => ({ name: x.name, monat: x.monat, flaschen: x.flaschen, kosten: x.kosten }));
  }

  /**
   * Herstellkosten jeder Verkaufszeile nach First in, First out. Die Abfüllungen sind eine Warteschlange: Was weggeht,
   * kommt immer aus der ältesten Abfüllung, die noch Flaschen hat; ist sie aufgebraucht, gelten die Kosten der nächsten.
   * Ereignisse in zeitlicher Reihenfolge: Verkaufszeilen (an ihrem Rechnungsdatum; ohne Datum am letzten Tag ihres
   * Monats) und `abgaenge` (optional, [{ datum, flaschen, art }]): Flaschen, die ohne Verkauf weggehen (Promo, Bruch,
   * Eigenverbrauch, Schwund laut Inventur). Am selben Tag erst die Verkäufe, sonst wie eingegangen.
   * - Abgänge brauchen die Abfüllungen genauso auf, damit die Mengen überall stimmen und sich in den alten Abfüllungen
   *   nichts aufstaut. Ihre Herstellkosten stehen bei keinem Verkauf, sondern für sich (`abgang`): Die Flaschen sind
   *   bezahlt und weg, das ist verlorenes bzw. ausgegebenes Geld (dashboardMehr führt es als eigene Statistik).
   * - Eine Gutschrift (negative Flaschen) legt die zuletzt VERKAUFTEN Flaschen in ihre Abfüllung zurück und bekommt
   *   deren Kosten mit Minus. Ein negativer Abgang (bei einer Zählung war mehr da als gerechnet) legt entsprechend die
   *   zuletzt ohne Verkauf abgegangenen zurück. Kommt mehr zurück, als auf diesem Weg je wegging, liegen die Flaschen als
   *   Mehrbestand vor der ersten Abfüllung (`mehr`, Kosten der ersten Abfüllung) und gehen als Nächste weg.
   * - Geht mehr weg, als abgefüllt im Sheet steht, rechnet der Überhang mit den Kosten der letzten Abfüllung (`ueber`).
   * Rückgabe { kosten: je Verkaufszeile Euro (ungerundet) oder null, wenn eine berührte Abfüllung keine Kosten hat,
   *   abgang: je Abgang dasselbe, schichten: je { name, monat, flaschen, kosten, verbraucht, rest }, ueber, mehr,
   *   uebrig (Reste + mehr − ueber), fehlt: Namen berührter Abfüllungen ohne Kosten,
   *   teile: je Verkaufszeile, aus welchen Abfüllungen ihre Flaschen kamen, als [[Schicht, Flaschen], …] (Schicht −1 =
   *   Mehrbestand vor der ersten, n = Überhang nach der letzten; Flaschen mit Minus, wenn sie zurückkamen; eine Zeile
   *   ohne Flaschen bekommt [[Schicht, 0]] mit der Abfüllung, die an ihrem Tag dran war), abgangTeile: je Abgang
   *   dasselbe (ohne gültiges Datum leer) }. Immer gilt: uebrig = abgefüllt − verkauft − Abgänge.
   */
  function fifoKosten(zeilen, schichten, abgaenge) {
    const liste = Array.isArray(zeilen) ? zeilen : [];
    const ab = Array.isArray(abgaenge) ? abgaenge : [];
    const n = schichten.length;
    const glatt = (z) => Math.round(z * 1e6) / 1e6; // Gleitkomma glatt halten: 0,05 + 7,98 + 1,97 sind genau 10
    const KLEIN = 1e-9;
    const rest = schichten.map((x) => x.flaschen);
    let ueber = 0;
    let mehr = 0;
    const fehlt = Object.create(null);
    // Kosten von `menge` Flaschen der Schicht i (−1 = Mehrbestand vor der ersten, n = Überhang nach der letzten)
    const wert = (i, menge, merker) => {
      const x = schichten[Math.max(0, Math.min(n - 1, i))];
      if (x.kosten === null) { merker.offen = true; fehlt[x.name] = true; return 0; }
      return menge * x.kosten;
    };
    // q > 0 Flaschen gehen weg: erst der Mehrbestand, dann die älteste Abfüllung mit Rest, zuletzt der Überhang.
    // `stapel` merkt sich, woher sie kamen (zuletzt Genommenes oben), getrennt für Verkäufe und Abgänge.
    const nehmen = (q, stapel, teile) => {
      const merker = { offen: false };
      let k = 0;
      const teil = (i, weg) => { stapel.push([i, weg]); teile.push([i, weg]); k += wert(i, weg, merker); q = glatt(q - weg); };
      if (mehr > KLEIN && q > KLEIN) { const weg = Math.min(q, mehr); mehr = glatt(mehr - weg); teil(-1, weg); }
      for (let i = 0; i < n && q > KLEIN; i++) {
        const weg = Math.min(q, rest[i]);
        if (weg > KLEIN) { rest[i] = glatt(rest[i] - weg); teil(i, weg); }
      }
      if (q > KLEIN) { ueber = glatt(ueber + q); teil(n, q); }
      return merker.offen ? null : k;
    };
    // q > 0 Flaschen kommen zurück: die zuletzt über diesen Stapel weggegangenen zuerst, der Rest wird Mehrbestand
    const zurueck = (q, stapel, teile) => {
      const merker = { offen: false };
      let k = 0;
      while (q > KLEIN && stapel.length) {
        const oben = stapel[stapel.length - 1];
        const m = Math.min(q, oben[1]);
        oben[1] = glatt(oben[1] - m);
        if (oben[1] <= KLEIN) stapel.pop();
        if (oben[0] < 0) mehr = glatt(mehr + m); else if (oben[0] >= n) ueber = glatt(ueber - m); else rest[oben[0]] = glatt(rest[oben[0]] + m);
        teile.push([oben[0], -m]);
        k += wert(oben[0], m, merker);
        q = glatt(q - m);
      }
      if (q > KLEIN) { mehr = glatt(mehr + q); teile.push([-1, -q]); k += wert(-1, q, merker); }
      return merker.offen ? null : k;
    };
    // Woraus die nächste Flasche käme: Mehrbestand (−1), die älteste Abfüllung mit Rest oder der Überhang (n)
    const dran = () => {
      if (mehr > KLEIN) return -1;
      for (let i = 0; i < n; i++) if (rest[i] > KLEIN) return i;
      return n;
    };
    const monatsende = (m) => tagePlus(monatPlus(m, 1) + '-01', -1);
    // Reihenfolge rein nach dem Tag: Weicht der Monat einer Rechnung von ihrem Datum ab, zählt das Datum
    const ereignisse = liste.map((z, i) => ({ wann: datumGueltig(z.datum) ? z.datum : MONAT_MUSTER.test(z.monat || '') ? monatsende(z.monat) : '9999-99-99',
      art: 0, nr: i, menge: z.flaschen }))
      .concat(ab.map((x, i) => ({ wann: datumGueltig(x && x.datum) ? x.datum : '', art: 1, nr: i, menge: x ? x.flaschen : null }))
        .filter((x) => x.wann))
      .sort((x, y) => (x.wann < y.wann ? -1 : x.wann > y.wann ? 1 : x.art - y.art || x.nr - y.nr));
    const kosten = liste.map(() => 0);
    const abgang = ab.map(() => 0);
    const teile = [liste.map(() => []), ab.map(() => [])]; // Verkäufe, Abgänge: woher die Flaschen jedes Ereignisses kamen
    const stapel = [[], []]; // Verkäufe, Abgänge
    ereignisse.forEach((x) => {
      const q = x.menge;
      if (!istZahl(q) || q === 0 || !n) {
        if (!n && istZahl(q) && q !== 0) (x.art ? abgang : kosten)[x.nr] = null;
        // Verkaufszeile ohne Flaschen (nur Geld): gehört zu der Abfüllung, die an ihrem Tag dran war
        else if (n && !x.art) teile[0][x.nr].push([dran(), 0]);
        return;
      }
      const k = q > 0 ? nehmen(q, stapel[x.art], teile[x.art][x.nr]) : zurueck(-q, stapel[x.art], teile[x.art][x.nr]);
      (x.art ? abgang : kosten)[x.nr] = k === null ? null : q > 0 ? k : -k;
    });
    return {
      kosten: kosten, abgang: abgang, teile: teile[0], abgangTeile: teile[1],
      schichten: schichten.map((x, i) => ({ name: x.name, monat: x.monat, flaschen: x.flaschen, kosten: x.kosten,
        verbraucht: runde(x.flaschen - rest[i]), rest: runde(rest[i]) })),
      ueber: runde(ueber), mehr: runde(mehr), fehlt: Object.keys(fehlt),
      // was noch da ist, einmal gerundet (nicht die Summe gerundeter Reste)
      uebrig: runde(rest.reduce((x, y) => x + y, 0) + mehr - ueber),
    };
  }

  /** Liter pro Flasche (0,33-l-Longneck), nur für die Spielerei „Liter seit dem Start“. */
  const FLASCHE_LITER = 0.33;

  /**
   * Mehr Zahlen fürs Dashboard (seit v31, „zahlennerdig“ zum Runterscrollen). Eingaben wie dashboardDaten, dazu
   * `flaschenProKiste` (Standard 24) für die Bestellgrößen. Ohne gültiges `heute` oder `werte` null. Rückgabe:
   * { jahr, letzterMonat,
   *   trend: volle Monate gegen dieselben Monate ein Jahr früher, je { art: 'monate' | 'jahr', monate, von, bis, flaschen,
   *     umsatz, vjFlaschen, vjUmsatz, pFlaschen, pUmsatz } für 1, 3, 6 und 12 Monate und (außer im Januar) das Jahr
   *     bis zum letzten vollen Monat. Fehlt ein Monat in den Daten: Zahlen null. Vorjahr ≤ 0: Prozent null,
   *   vorjahrMonate: die letzten 12 vollen Monate, neuester zuerst, wie trend je Monat, dazu `monat` und `anteil`
   *     (Flaschen in Prozent des stärksten der zwölf),
   *   quartale: Quartale des laufenden Jahres bis heute, je { quartal, von, bis, laufend, flaschen, umsatz, pFlaschen,
   *     pUmsatz (zum Vorjahresquartal; beim laufenden Quartal null) },
   *   tempo: Januar bis heute { tage, flaschenProTag, umsatzProTag } (null, wenn ein Monat fehlt),
   *   und nur mit Verkaufszeilen (sonst null bzw. leere Listen):
   *   kanaele: alle Kanäle des laufenden Jahres mit Flaschen im Plus (Reihenfolge wie in dashboardDaten), je { kanal,
   *     flaschen, umsatz, anteilFlaschen, anteilUmsatz (Prozent der Summe dieser Kanäle), proFlasche },
   *   jahre: je Kalenderjahr (neuestes zuerst) { jahr, flaschen, umsatz, proFlasche, bestellungen, kunden }, `gesamt` dasselbe
   *     über alles, dazu { erster (Monat), monate (seit dem Start, einschließlich laufendem), proMonat ({flaschen, umsatz}
   *     über die vollen Monate oder null), liter, mehrfach (Kunden mit mindestens zwei Bestellungen) },
   *   preise: Umsatz pro Flasche im laufenden Jahr und im ganzen Vorjahr, je { name ('' = alle Kanäle), proFlasche,
   *     vorjahr, p } für alle zusammen und je Kanal mit Flaschen im Plus,
   *   bestellungen: laufendes Jahr { anzahl, flaschen (Ø), median, umsatz (Ø), proMonat, groesste ({flaschen, umsatz,
   *     kunde, datum, monat} oder null) }, `groessen`: fünf Klassen in Kisten, je { abKisten, bisKisten (null = offen),
   *     anzahl, flaschen, anteil (Prozent der Flaschen) },
   *   kunden: laufendes Jahr { aktiv (Flaschen im Jahr unter dem Strich im Plus), neu (erster Kauf überhaupt in diesem
   *     Jahr, Gutschriften zählen dafür nicht), wieder (auch im Vorjahr gekauft),
   *     nichtMehr (im Vorjahr gekauft, dieses Jahr noch nicht), flaschen, umsatz, bestellungen (jeweils Ø je Kunde) },
   *   top: die zehn größten Kunden des Jahres, je { rang, kunde, flaschen, umsatz, anteil, kumuliert (Prozent der
   *     Flaschen aller Kunden mit Flaschen im Plus) },
   *   rekorde: { monatFlaschen ({monat, flaschen}), monatUmsatz ({monat, umsatz}), bestellung, kunde ({kunde, flaschen,
   *     umsatz}), treu ({kunde, anzahl}) }, jeweils null, wenn es nichts gibt,
   *   marge: nur wenn `abfuellungen` (aus der Schnittstelle) Herstellkosten je Abfüllung mitbringt, sonst null. Die
   *     Kosten jeder Verkaufszeile kommen nach First in, First out aus den Abfüllungen (fifoSchichten, fifoKosten).
   *     Rohertrag = Umsatz (netto mit Pfand) − Herstellkosten; jeder Posten ist { flaschen, umsatz, kosten, rohertrag,
   *     marge (Rohertrag in Prozent vom Umsatz), aufschlag (in Prozent der Kosten), proFlasche, kostenProFlasche },
   *     ohne Kosten einer berührten Abfüllung bis auf Flaschen und Umsatz null: `jahr` (Januar bis heute),
   *     `vorjahr` (ganzes Jahr; ohne Verkäufe null), `gesamt`, `monate` (die zwölf vollen Monate, dazu `balken` in
   *     Prozent des stärksten), `kanaele` und `top` (zehn Kunden nach Rohertrag; beide über alle Kanäle bzw. Kunden des
   *     Jahres, auch mit Gutschriften, damit die Zeilen zusammen den Jahreswert ergeben) mit `anteil` am Rohertrag im Plus, `unterKosten`
   *     ({ anzahl, flaschen, anteil }: Bestellungen des Jahres, deren Umsatz die Herstellkosten nicht deckt), dazu
   *     `schichten` (Abfüllungen mit `verbraucht` und `rest`), `aktuell` ({ name, kosten, rest, mehr }: woraus als
   *     Nächstes verkauft wird; `mehr` = true für den Mehrbestand vor der ersten Abfüllung),
   *     `verluste`: was ohne Verkauf wegging, mit den Herstellkosten dieser Flaschen (bezahlt und weg). Aus
   *     `lager.abgaenge` = [[Datum, Flaschen, Art]] (Promo, Eigenverbrauch, Bruch) und `lager.schwund` = [[Datum,
   *     Flaschen, Standort]] (jede Nachzählung an ihrem Tag, mit leerem Standort die Lücke vom Anfang; negativ, wenn
   *     mehr da war). { anzahl (Ereignisse), jahr, vorjahr, gesamt (je { flaschen, kosten }), arten: je Art dasselbe,
   *     luecke, monate: die letzten zwölf Monate mit Abgängen }; null, wenn die Schnittstelle die Felder noch nicht kennt.
   *     `luecke` ({ datum, flaschen, kosten } oder null) ist die alte Lücke (seit v34 für sich): Flaschen, die schon
   *     fehlten, als zum ersten Mal alle Lager gezählt waren. Niemand weiß, wann und aus welcher Abfüllung sie
   *     weggingen. Sie zählt nur in `gesamt`, nicht in `jahr`, `vorjahr`, `arten` oder `monate`.
   *     `nach`: je Zeitraum { rohertrag, abgaenge (Kosten), flaschen, bleibt (Rohertrag − Abgänge, nur in Euro: die
   *     Marge bezieht sich immer nur auf verkaufte Flaschen), proFlasche (Abgänge je verkaufter Flasche) } oder null
   *     wie `verluste`.
   *     `flaschen`: der Abgleich { abgefuellt, verkauft, abgaenge, schwund, luecke, uebrig }, es gilt immer abgefuellt −
   *     verkauft − abgaenge − schwund − luecke = uebrig. `mehr` (Flaschen, die zurückkamen oder gefunden wurden, ohne
   *     dass eine Abfüllung sie zurücknehmen konnte),
   *     `abfuellungen` (seit v34): je Abfüllung { name, monat, abgefuellt, rest } und der Posten ihrer verkauften
   *     Flaschen (flaschen, umsatz, kosten, rohertrag, marge, … wie oben; Umsatz einer Zeile aus zwei Abfüllungen
   *     anteilig nach Flaschen; Umsatz und Kosten so auf den Cent gerundet, dass die Abfüllungen zusammen genau
   *     `gesamt` ergeben, jede höchstens einen Cent neben ihrem genauen Wert), dazu `weg` ({ flaschen,
   *     kosten }: was aus ihr ohne Verkauf wegging, ohne die alte Lücke), `luecke` (Flaschen der alten Lücke aus ihr)
   *     und `bleibt` (Rohertrag − weg.kosten). Es gilt abgefuellt = flaschen + weg.flaschen + luecke + rest, solange
   *     nichts über die Abfüllungen hinaus oder am Mehrbestand vorbei lief.
   *     `ueber` (mehr verkauft als abgefüllt), `fehlt` (berührte Abfüllungen ohne Kosten), `abweichung` (Flaschen, um
   *     die die Schichten über der Summe im Tab Abfüllungen liegen, weil eine Minus-Zeile zu keiner Abfüllung passt)
   *     und `kostenJeZeile` (seit v35: Herstellkosten jeder Verkaufszeile in Euro, ungerundet, in der Reihenfolge von
   *     `zeilen`; null, wo eine berührte Abfüllung keine Kosten hat. Daraus rechnet `auswerten` den Rohertrag) }.
   */
  function dashboardMehr(zeilen, werte, heute, flaschenProKiste, abfuellungen, lager) {
    if (!datumGueltig(heute) || typeof werte !== 'function') return null;
    const jetzt = heute.slice(0, 7);
    const jahr = Number(jetzt.slice(0, 4));
    const lfm = monatPlus(jetzt, -1);
    const zwei = (n) => (n < 10 ? '0' : '') + n;
    const wert = (m) => {
      const x = werte(m);
      return x && istZahl(x.flaschen) ? { flaschen: x.flaschen, umsatz: istZahl(x.umsatz) ? x.umsatz : 0 } : null;
    };
    const summe = (von, bis) => {
      let f = 0;
      let u = 0;
      for (let m = von; m <= bis; m = monatPlus(m, 1)) {
        const x = wert(m);
        if (!x) return null;
        f += x.flaschen;
        u += x.umsatz;
      }
      return { flaschen: runde(f), umsatz: runde(u) };
    };
    // Zeitraum gegen dieselben Monate ein Jahr früher (`bisVoll`: nur bis hier mit dem Vorjahr vergleichen)
    const vergleich = (von, bis, ohneVorjahr) => {
      const d = summe(von, bis);
      const v = ohneVorjahr ? null : summe(monatPlus(von, -12), monatPlus(bis, -12));
      return { von: von, bis: bis, flaschen: d ? d.flaschen : null, umsatz: d ? d.umsatz : null,
        vjFlaschen: v ? v.flaschen : null, vjUmsatz: v ? v.umsatz : null,
        pFlaschen: d && v ? veraenderung(d.flaschen, v.flaschen) : null, pUmsatz: d && v ? veraenderung(d.umsatz, v.umsatz) : null };
    };

    const trend = [1, 3, 6, 12].map((n) => Object.assign({ art: 'monate', monate: n }, vergleich(monatPlus(lfm, -(n - 1)), lfm)));
    if (lfm.slice(0, 4) === String(jahr)) trend.push(Object.assign({ art: 'jahr', monate: Number(lfm.slice(5, 7)) }, vergleich(jahr + '-01', lfm)));

    const vorjahrMonate = [];
    for (let i = 0; i < 12; i++) {
      const m = monatPlus(lfm, -i);
      vorjahrMonate.push(Object.assign({ monat: m, anteil: 0 }, vergleich(m, m)));
    }
    const hoch = Math.max.apply(null, vorjahrMonate.map((m) => (m.flaschen > 0 ? m.flaschen : 0)).concat([0]));
    if (hoch > 0) vorjahrMonate.forEach((m) => { m.anteil = m.flaschen > 0 ? zehntel((m.flaschen / hoch) * 100) : 0; });

    const quartale = [];
    for (let q = 1; q <= 4; q++) {
      const von = jahr + '-' + zwei(3 * q - 2);
      const bis = jahr + '-' + zwei(3 * q);
      if (von > jetzt) break;
      const laufend = bis >= jetzt;
      const v = vergleich(von, laufend ? jetzt : bis, laufend);
      quartale.push({ quartal: q, von: von, bis: bis, laufend: laufend, flaschen: v.flaschen, umsatz: v.umsatz, pFlaschen: v.pFlaschen, pUmsatz: v.pUmsatz });
    }

    // Tempo: Januar bis heute auf den Tag gerechnet
    const bisher = summe(jahr + '-01', jetzt);
    const tage = tageZwischen(jahr + '-01-01', heute) + 1;
    const tempo = bisher ? { tage: tage, flaschenProTag: runde(bisher.flaschen / tage), umsatzProTag: runde(bisher.umsatz / tage) } : null;

    const aus = { jahr: jahr, letzterMonat: lfm, trend: trend, vorjahrMonate: vorjahrMonate, quartale: quartale, tempo: tempo,
      kanaele: [], jahre: [], gesamt: null, preise: [], bestellungen: null, groessen: [], kunden: null, top: [], rekorde: null, marge: null };
    if (!Array.isArray(zeilen)) return aus;

    const proFlasche = (x) => (x && x.flaschen > 0 ? runde(x.umsatz / x.flaschen) : null);
    const anfang = jahr + '-01';
    const zj = zeitraumAuswerten(zeilen, anfang, jetzt);
    const zv = zeitraumAuswerten(zeilen, (jahr - 1) + '-01', (jahr - 1) + '-12');
    const za = zeitraumAuswerten(zeilen, '0000-00', jetzt);
    const best = bestellListe(zeilen).filter((b) => b.flaschen > 0 && b.monat <= jetzt);

    // Kanäle des Jahres mit beiden Anteilen
    const kan = zj.kanaele.filter((k) => k.flaschen > 0); // dieselben Kanäle und dieselbe Reihenfolge wie die Balken (dashboardDaten)
    const kanFl = kan.reduce((x, k) => x + Math.max(0, k.flaschen), 0);
    const kanEuro = kan.reduce((x, k) => x + Math.max(0, k.umsatz), 0);
    aus.kanaele = kan.map((k) => ({ kanal: k.kanal, flaschen: k.flaschen, umsatz: k.umsatz,
      anteilFlaschen: kanFl > 0 ? zehntel((Math.max(0, k.flaschen) / kanFl) * 100) : 0,
      anteilUmsatz: kanEuro > 0 ? zehntel((Math.max(0, k.umsatz) / kanEuro) * 100) : 0, proFlasche: proFlasche(k) }));

    // Jahre und Gesamt
    // Ein Kunde zählt in einem Jahr (und insgesamt), wenn unter dem Strich Flaschen bei ihm bleiben: Wer kauft und
    // alles gutgeschrieben bekommt, zählt nicht. So passen „Kunden“ hier, bei den Jahren und im Abschnitt Kunden zusammen.
    const proJahr = Object.create(null);
    zeilen.forEach((z) => {
      if (z.monat > jetzt) return;
      const j = z.monat.slice(0, 4);
      const x = proJahr[j] = proJahr[j] || { flaschen: 0, umsatz: 0, kunden: Object.create(null) };
      x.flaschen += z.flaschen;
      x.umsatz += z.umsatz;
      x.kunden[z.schluessel] = (x.kunden[z.schluessel] || 0) + z.flaschen;
    });
    aus.jahre = Object.keys(proJahr).sort().reverse().map((j) => {
      const x = { flaschen: runde(proJahr[j].flaschen), umsatz: runde(proJahr[j].umsatz) };
      return { jahr: Number(j), flaschen: x.flaschen, umsatz: x.umsatz, proFlasche: proFlasche(x),
        bestellungen: best.filter((b) => b.monat.slice(0, 4) === j).length,
        kunden: Object.keys(proJahr[j].kunden).filter((s2) => proJahr[j].kunden[s2] > 0).length };
    });
    const monListe = [];
    const proMonat = Object.create(null);
    zeilen.forEach((z) => {
      if (z.monat > jetzt) return;
      let x = proMonat[z.monat];
      if (!x) { x = proMonat[z.monat] = { monat: z.monat, flaschen: 0, umsatz: 0 }; monListe.push(x); }
      x.flaschen = runde(x.flaschen + z.flaschen);
      x.umsatz = runde(x.umsatz + z.umsatz);
    });
    monListe.sort((x, y) => (x.monat < y.monat ? -1 : 1));
    const erster = monListe.length ? monListe[0].monat : null;
    const voll = erster && erster <= lfm ? summe(erster, lfm) : null;
    const nVoll = voll ? monateAnzahl(erster, lfm) : 0;
    aus.gesamt = { flaschen: za.flaschen, umsatz: za.umsatz, proFlasche: proFlasche(za), bestellungen: best.length,
      kunden: za.kunden.filter((x) => x.flaschen > 0).length, erster: erster, monate: erster ? monateAnzahl(erster, jetzt) : 0,
      proMonat: nVoll > 0 ? { flaschen: runde(voll.flaschen / nVoll), umsatz: runde(voll.umsatz / nVoll) } : null,
      liter: runde(za.flaschen * FLASCHE_LITER) };

    // Umsatz pro Flasche: dieses Jahr gegen das ganze Vorjahr
    const vjKanal = Object.create(null);
    zv.kanaele.forEach((k) => { vjKanal[k.kanal] = k; });
    aus.preise = [{ name: '', jetzt: zj, vor: zv }].concat(zj.kanaele.filter((k) => k.flaschen > 0).map((k) => ({ name: k.kanal, jetzt: k, vor: vjKanal[k.kanal] })))
      .map((x) => {
        const neu = proFlasche(x.jetzt);
        const alt = proFlasche(x.vor);
        return { name: x.name, proFlasche: neu, vorjahr: alt, p: neu !== null && alt !== null ? veraenderung(neu, alt) : null };
      });

    // Bestellungen des Jahres und ihre Größen
    const bj = best.filter((b) => b.monat >= anfang);
    const mengen = bj.map((b) => b.flaschen).sort((x, y) => x - y);
    const flSumme = mengen.reduce((x, y) => x + y, 0);
    const mitte = mengen.length >> 1;
    const gross = bj.reduce((x, b) => (!x || b.flaschen > x.flaschen ? b : x), null);
    const kurz = (b) => (b ? { flaschen: b.flaschen, umsatz: b.umsatz, kunde: b.kunde, datum: b.datum, monat: b.monat } : null);
    aus.bestellungen = { anzahl: bj.length, flaschen: bj.length ? runde(flSumme / bj.length) : null,
      median: !mengen.length ? null : mengen.length % 2 ? mengen[mitte] : runde((mengen[mitte - 1] + mengen[mitte]) / 2),
      umsatz: bj.length ? runde(bj.reduce((x, b) => x + b.umsatz, 0) / bj.length) : null,
      proMonat: runde(bj.length / Number(jetzt.slice(5, 7))), groesste: kurz(gross) };
    const kiste = flaschenProKiste > 0 ? flaschenProKiste : 24;
    aus.groessen = [[0, 1], [1, 4], [4, 10], [10, 20], [20, null]].map((g) => {
      const teil = bj.filter((b) => b.flaschen > g[0] * kiste && (g[1] === null || b.flaschen <= g[1] * kiste));
      const fl = teil.reduce((x, b) => x + b.flaschen, 0);
      return { abKisten: g[0], bisKisten: g[1], anzahl: teil.length, flaschen: runde(fl), anteil: flSumme > 0 ? zehntel((fl / flSumme) * 100) : 0 };
    });

    // Kunden des Jahres
    const aktiv = zj.kunden.filter((k) => k.flaschen > 0);
    const istAktiv = Object.create(null);
    aktiv.forEach((k) => { istAktiv[k.schluessel] = true; });
    const vorjahr = zv.kunden.filter((k) => k.flaschen > 0);
    const warVorjahr = Object.create(null);
    vorjahr.forEach((k) => { warVorjahr[k.schluessel] = true; });
    const aktivFl = aktiv.reduce((x, k) => x + k.flaschen, 0);
    aus.kunden = { aktiv: aktiv.length, neu: aktiv.filter((k) => k.erster >= anfang).length, wieder: aktiv.filter((k) => warVorjahr[k.schluessel]).length,
      nichtMehr: vorjahr.filter((k) => !istAktiv[k.schluessel]).length, flaschen: aktiv.length ? runde(aktivFl / aktiv.length) : null,
      umsatz: aktiv.length ? runde(aktiv.reduce((x, k) => x + k.umsatz, 0) / aktiv.length) : null,
      bestellungen: aktiv.length ? runde(bj.filter((b) => istAktiv[b.schluessel]).length / aktiv.length) : null };
    let lauf = 0;
    aus.top = aktiv.slice(0, 10).map((k, i) => {
      lauf += k.flaschen;
      return { rang: i + 1, kunde: k.kunde, flaschen: k.flaschen, umsatz: k.umsatz, anteil: zehntel((k.flaschen / aktivFl) * 100), kumuliert: zehntel((lauf / aktivFl) * 100) };
    });

    // Rekorde über alles
    const groesster = (liste, feld) => liste.reduce((x, y) => (y[feld] > 0 && (!x || y[feld] > x[feld]) ? y : x), null);
    const mf = groesster(monListe, 'flaschen');
    const mu = groesster(monListe, 'umsatz');
    const name = Object.create(null);
    za.kunden.forEach((k) => { name[k.schluessel] = k.kunde; });
    const zahlProKunde = Object.create(null);
    best.forEach((b) => { zahlProKunde[b.schluessel] = (zahlProKunde[b.schluessel] || 0) + 1; });
    const treu = za.kunden.reduce((x, k) => ((zahlProKunde[k.schluessel] || 0) > (x ? x.anzahl : 0) ? { kunde: k.kunde, anzahl: zahlProKunde[k.schluessel] } : x), null);
    // nur Kunden, die auch in `gesamt.kunden` zählen (Flaschen unter dem Strich im Plus): Wer alles gutgeschrieben
    // bekam, steht weder dort noch hier
    const zaehlt = Object.create(null);
    za.kunden.forEach((k) => { if (k.flaschen > 0) zaehlt[k.schluessel] = true; });
    aus.gesamt.mehrfach = Object.keys(zahlProKunde).filter((s2) => zaehlt[s2] && zahlProKunde[s2] >= 2).length;
    const gk = za.kunden.length && za.kunden[0].flaschen > 0 ? za.kunden[0] : null;
    const gb = best.reduce((x, b) => (!x || b.flaschen > x.flaschen ? b : x), null);
    aus.rekorde = { monatFlaschen: mf ? { monat: mf.monat, flaschen: mf.flaschen } : null, monatUmsatz: mu ? { monat: mu.monat, umsatz: mu.umsatz } : null,
      bestellung: gb ? Object.assign(kurz(gb), { kunde: name[gb.schluessel] || gb.kunde }) : null,
      kunde: gk ? { kunde: gk.kunde, flaschen: gk.flaschen, umsatz: gk.umsatz } : null, treu: treu };

    // Rohertrag und Marge (seit v32): Herstellkosten je Abfüllung aus der Schnittstelle, verteilt nach First in, First out
    const schichten = fifoSchichten(abfuellungen);
    if (schichten && schichten.length) {
      // Was ohne Verkauf wegging, braucht die Abfüllungen genauso auf: die gebuchten Abgänge (Promo, Eigenverbrauch,
      // Bruch) an ihrem Tag und der Schwund aus den Zählungen. Den Schwund liefert die Schnittstelle fertig: jede
      // Nachzählung eines Lagers an ihrem Tag (auch negativ, wenn mehr da war) und, sobald alle Lager einmal gezählt
      // sind, die Lücke vom Anfang. Eine spätere Zählung verschiebt frühere Ereignisse nicht.
      // Diese Flaschen sind bezahlt und weg: Ihre Herstellkosten sind verlorenes bzw. ausgegebenes Geld. Sie stehen
      // für sich, aufgeschlüsselt nach Art und Zeitraum (`verluste`), und was danach in Euro bleibt (`nach`). Rohertrag
      // und Marge der Verkäufe ändern sie nicht.
      const gueltig = (x) => Array.isArray(x) && datumGueltig(x[0]) && x[0] <= heute && istZahl(x[1]);
      const GEBUCHT = ['Promo', 'Eigenverbrauch', 'Bruch'];
      // Kennt die Schnittstelle die Felder noch nicht (ältere Fassung), gibt es keine Aussage dazu: `verluste` = null
      const bekannt = !!lager && Array.isArray(lager.abgaenge);
      const ereignisse = (lager && Array.isArray(lager.abgaenge) ? lager.abgaenge : []).filter((x) => gueltig(x) && x[1] > 0)
        .map((x) => ({ datum: x[0], flaschen: x[1], art: GEBUCHT.indexOf(x[2]) >= 0 ? x[2] : 'Sonstiges' }))
        .concat((lager && Array.isArray(lager.schwund) ? lager.schwund : []).filter((x) => gueltig(x) && x[1] !== 0)
          // Ohne Standort: die alte Lücke. Diese Flaschen fehlten schon, als zum ersten Mal alle Lager gezählt waren.
          // Wann und aus welcher Abfüllung sie weggingen, weiß niemand: Sie brauchen die Abfüllungen am Zähltag auf
          // (damit die Mengen stimmen), ihr Geld steht aber für sich und zählt zu keinem Jahr und keiner Abfüllung.
          .map((x) => ({ datum: x[0], flaschen: x[1], art: x[2] === '' ? 'Lücke' : 'Schwund' })));
      // „Sonstiges“ nur, wenn die Schnittstelle eine Art schickt, die die App nicht kennt
      const VERLUST_ARTEN = GEBUCHT.concat(ereignisse.some((e) => e.art === 'Sonstiges') ? ['Sonstiges'] : [], ['Schwund']);
      // Zeilen nach dem laufenden Monat zählen nirgends mit (die App lässt sie schon in verkaufZeilen weg): auch
      // nicht in der Warteschlange, sonst gingen Abfüllungen und Abgleich nicht auf
      const zaehltMit = (z) => !(z.monat > jetzt);
      const fifo = fifoKosten(zeilen.map((z) => (zaehltMit(z) ? z : Object.assign({}, z, { flaschen: 0 }))), schichten, ereignisse);
      const vLeer = () => ({ flaschen: 0, kosten: 0, offen: false });
      const vDazu = (x, e, k) => { x.flaschen += e.flaschen; if (k === null) x.offen = true; else x.kosten += k; };
      const vFertig = (x) => ({ flaschen: runde(x.flaschen), kosten: x.offen ? null : runde(x.kosten) });
      const vArt = Object.create(null);
      VERLUST_ARTEN.forEach((art) => { vArt[art] = { jahr: vLeer(), vorjahr: vLeer(), gesamt: vLeer() }; });
      const vAlle = { jahr: vLeer(), vorjahr: vLeer(), gesamt: vLeer() };
      const vMonat = Object.create(null);
      const vLuecke = vLeer();
      let lueckeAm = '';
      ereignisse.forEach((e, i) => {
        const k = fifo.abgang[i];
        // Die alte Lücke zählt nur zu „seit dem Start“: zu keinem Jahr, keinem Monat und keiner Art
        if (e.art === 'Lücke') { vDazu(vLuecke, e, k); vDazu(vAlle.gesamt, e, k); if (e.datum > lueckeAm) lueckeAm = e.datum; return; }
        const j = Number(e.datum.slice(0, 4));
        const zeitraum = j === jahr ? 'jahr' : j === jahr - 1 ? 'vorjahr' : null;
        [vArt[e.art], vAlle].forEach((ziel) => {
          vDazu(ziel.gesamt, e, k);
          if (zeitraum) vDazu(ziel[zeitraum], e, k);
        });
        vDazu(vMonat[e.datum.slice(0, 7)] = vMonat[e.datum.slice(0, 7)] || vLeer(), e, k);
      });
      const dreifach = (x) => ({ jahr: vFertig(x.jahr), vorjahr: vFertig(x.vorjahr), gesamt: vFertig(x.gesamt) });
      const verluste = !bekannt ? null : Object.assign(dreifach(vAlle), {
        anzahl: ereignisse.length,
        arten: VERLUST_ARTEN.map((art) => Object.assign({ art: art }, dreifach(vArt[art]))),
        luecke: lueckeAm ? Object.assign({ datum: lueckeAm }, vFertig(vLuecke)) : null,
        // die letzten zwölf Monate, in denen etwas wegging (neuester zuerst, auch der laufende)
        monate: Object.keys(vMonat).sort().reverse().slice(0, 12).map((m) => Object.assign({ monat: m }, vFertig(vMonat[m]))),
      });
      const vOhne = { flaschen: 0, kosten: 0 };
      const leer = () => ({ flaschen: 0, umsatz: 0, kosten: 0, offen: false });
      const dazu = (x, z, i) => {
        x.flaschen += z.flaschen;
        x.umsatz += z.umsatz;
        if (fifo.kosten[i] === null) x.offen = true; else x.kosten += fifo.kosten[i];
        return x;
      };
      // Posten: Rohertrag = Umsatz − Herstellkosten. Fehlen Kosten einer berührten Abfüllung, bleibt alles außer Flaschen und Umsatz leer.
      const roh = (x) => {
        const flaschen = runde(x.flaschen);
        const umsatz = runde(x.umsatz);
        if (x.offen) return { flaschen: flaschen, umsatz: umsatz, kosten: null, rohertrag: null, marge: null, aufschlag: null, proFlasche: null, kostenProFlasche: null };
        const kosten = runde(x.kosten);
        const ertrag = runde(umsatz - kosten);
        return { flaschen: flaschen, umsatz: umsatz, kosten: kosten, rohertrag: ertrag,
          marge: umsatz > 0 ? zehntel((ertrag / umsatz) * 100) : null, aufschlag: kosten > 0 ? zehntel((ertrag / kosten) * 100) : null,
          proFlasche: flaschen > 0 ? runde(ertrag / flaschen) : null, kostenProFlasche: flaschen > 0 ? runde(kosten / flaschen) : null };
      };
      const jahrS = leer();
      const vorS = leer();
      const gesS = leer();
      const monS = Object.create(null);
      const kanS = Object.create(null);
      const kunS = Object.create(null);
      // Je Abfüllung (seit v34): ihre verkauften Flaschen mit Umsatz und Kosten, was aus ihr ohne Verkauf wegging und
      // die Flaschen der alten Lücke. Mehrbestand zählt zur ersten, Überhang zur letzten Abfüllung (wie bei den Kosten).
      const schS = schichten.map(() => ({ verkauf: leer(), weg: vLeer(), luecke: vLeer() }));
      const zuSchicht = (i) => Math.max(0, Math.min(schichten.length - 1, i));
      const teilDazu = (x, i, menge) => {
        x.flaschen += menge;
        if (menge === 0) return;
        if (schichten[i].kosten === null) x.offen = true; else x.kosten += menge * schichten[i].kosten;
      };
      ereignisse.forEach((e, nr) => fifo.abgangTeile[nr].forEach((t) => {
        const i = zuSchicht(t[0]);
        teilDazu(schS[i][e.art === 'Lücke' ? 'luecke' : 'weg'], i, t[1]);
      }));
      zeilen.forEach((z, i) => {
        if (z.monat > jetzt) return;
        // Umsatz einer Zeile aus zwei Abfüllungen: anteilig nach Flaschen, ungerundet (gerundet wird erst die Summe je
        // Abfüllung, siehe `aufCent`; so kann kein Teil einer Zeile das Vorzeichen wechseln)
        fifo.teile[i].forEach((t) => {
          const s = zuSchicht(t[0]);
          schS[s].verkauf.umsatz += z.flaschen !== 0 ? z.umsatz * (t[1] / z.flaschen) : z.umsatz;
          teilDazu(schS[s].verkauf, s, t[1]);
        });
        dazu(gesS, z, i);
        dazu(monS[z.monat] = monS[z.monat] || leer(), z, i);
        const j = Number(z.monat.slice(0, 4));
        if (j === jahr) {
          dazu(jahrS, z, i);
          dazu(kanS[z.kanal] = kanS[z.kanal] || leer(), z, i);
          dazu(kunS[z.schluessel] = kunS[z.schluessel] || leer(), z, i);
        } else if (j === jahr - 1) {
          dazu(vorS, z, i);
        }
      });
      // Anteil am Rohertrag: nur was im Plus liegt, teilt sich die 100 %
      const mitAnteil = (liste) => {
        const plus = liste.reduce((x, y) => x + Math.max(0, y.rohertrag || 0), 0);
        liste.forEach((y) => { y.anteil = plus > 0 ? zehntel((Math.max(0, y.rohertrag || 0) / plus) * 100) : 0; });
        return liste;
      };
      const mMonate = vorjahrMonate.map((m) => Object.assign({ monat: m.monat, balken: 0 }, roh(monS[m.monat] || leer())));
      const mHoch = Math.max.apply(null, mMonate.map((m) => (m.rohertrag > 0 ? m.rohertrag : 0)).concat([0]));
      if (mHoch > 0) mMonate.forEach((m) => { m.balken = m.rohertrag > 0 ? zehntel((m.rohertrag / mHoch) * 100) : 0; });
      // Bestellungen des Jahres, deren Umsatz ihre Herstellkosten nicht deckt (auf den Cent, Gleichstand zählt nicht)
      const unter = bj.filter((b) => {
        const k = b.zeilenNr.reduce((x, i) => (x === null || fifo.kosten[i] === null ? null : x + fifo.kosten[i]), 0);
        return k !== null && b.umsatz < runde(k);
      });
      const unterFl = unter.reduce((x, b) => x + b.flaschen, 0);
      // Alle Kanäle und Kunden des Jahres, auch mit Gutschriften oder ohne Flaschen unter dem Strich: Nur so ergeben die
      // Zeilen zusammen den Rohertrag des Jahres. Die Reihenfolge der Kanäle bleibt die der Balken.
      const hat = (x) => x.flaschen !== 0 || x.umsatz !== 0;
      // In den Listen bleibt auch, wer bei Flaschen und Umsatz auf 0 steht, aber Kosten trägt (Kauf aus einer Abfüllung,
      // Gutschrift nach dem Wechsel zur nächsten)
      const zeigt = (x) => hat(x) || x.kosten === null || x.kosten !== 0;
      const nachErtrag = (x, y) => (y.rohertrag === null ? -Infinity : y.rohertrag) - (x.rohertrag === null ? -Infinity : x.rohertrag) || y.flaschen - x.flaschen;
      // Passt eine Minus-Zeile im Tab Abfüllungen zu keiner Abfüllung, weichen die Schichten von der Summe im Sheet ab
      const imSheet = (Array.isArray(abfuellungen) ? abfuellungen : []).reduce((x, y) => x + (y && istZahl(y.flaschen) ? y.flaschen : 0), 0);
      const abweichung = runde(schichten.reduce((x, y) => x + y.flaschen, 0) - imSheet);
      // Das Vorjahr gibt es, sobald dort etwas steht: Verkäufe, Kosten (auch bei 0 Flaschen unter dem Strich) oder Abgänge
      const vorDa = hat(zv) || vorS.offen || vorS.kosten !== 0 ||
        (!!verluste && (verluste.vorjahr.flaschen !== 0 || verluste.vorjahr.kosten !== 0));
      // Woraus als Nächstes verkauft wird: zuerst der Mehrbestand (zurückgekommen oder gefunden, Kosten der ersten
      // Abfüllung), dann die älteste Abfüllung mit Rest
      const naechste = fifo.schichten.find((x) => x.rest > 0);
      const aktuell = fifo.mehr > 0 ? { name: '', kosten: fifo.schichten[0].kosten, rest: fifo.mehr, mehr: true }
        : naechste ? { name: naechste.name, kosten: naechste.kosten, rest: naechste.rest, mehr: false } : null;
      // Flaschen-Abgleich: abgefüllt − verkauft − gebucht weg − Schwund = übrig (Reste, dazu der Mehrbestand, ohne Überhang)
      const abgefuellt = schichten.reduce((x, y) => x + y.flaschen, 0);
      const summeArt = (arten) => ereignisse.reduce((x, e) => x + (arten(e.art) ? e.flaschen : 0), 0);
      const flaschen = { abgefuellt: runde(abgefuellt), verkauft: runde(zeilen.reduce((x, z) => x + (zaehltMit(z) ? z.flaschen : 0), 0)),
        abgaenge: runde(summeArt((art) => art !== 'Schwund' && art !== 'Lücke')), schwund: runde(summeArt((art) => art === 'Schwund')),
        luecke: runde(summeArt((art) => art === 'Lücke')), uebrig: fifo.uebrig };
      // Beträge so auf den Cent runden, dass sie zusammen genau `ziel` ergeben: abrunden, die fehlenden Cent gehen an
      // die größten Reste. Jeder Betrag weicht höchstens einen Cent von seinem genauen Wert ab. Passt die Summe nicht
      // zum Ziel (nur bei kaputten Eingaben), null: Dann rundet jeder Betrag für sich.
      const aufCent = (werte, ziel) => {
        const genau = werte.map((x) => x * 100);
        const cent = genau.map((x) => Math.floor(x + 1e-6));
        const fehlen = Math.round(ziel * 100) - cent.reduce((x, y) => x + y, 0);
        if (fehlen < 0 || fehlen > cent.length) return null;
        genau.map((x, i) => ({ i: i, rest: x - cent[i] })).sort((a, b) => b.rest - a.rest || a.i - b.i).slice(0, fehlen).forEach((x) => { cent[x.i] += 1; });
        return cent.map((x) => x / 100);
      };
      // Umsatz und Kosten der verkauften Flaschen: Die Abfüllungen ergeben zusammen genau `gesamt` (3,01 € über zwei
      // Abfüllungen sind 1,51 € + 1,50 €, nicht zweimal 1,51 €)
      const umsatzCent = aufCent(schS.map((x) => x.verkauf.umsatz), runde(gesS.umsatz));
      if (umsatzCent) schS.forEach((x, i) => { x.verkauf.umsatz = umsatzCent[i]; });
      const kostenCent = gesS.offen || schS.some((x) => x.verkauf.offen) ? null : aufCent(schS.map((x) => x.verkauf.kosten), runde(gesS.kosten));
      if (kostenCent) schS.forEach((x, i) => { x.verkauf.kosten = kostenCent[i]; });
      // Je Abfüllung: Rohertrag und Marge nur aus ihren verkauften Flaschen; `bleibt` zieht ab, was aus ihr ohne
      // Verkauf wegging (Promo, Eigenverbrauch, Bruch, Schwund). Die alte Lücke geht nur als Flaschen ein, nicht als Geld.
      const jeAbfuellung = fifo.schichten.map((s, i) => {
        const r = roh(schS[i].verkauf);
        const weg = vFertig(schS[i].weg);
        return Object.assign({ name: s.name, monat: s.monat, abgefuellt: s.flaschen, rest: s.rest }, r, { weg: weg, luecke: runde(schS[i].luecke.flaschen),
          bleibt: r.rohertrag === null || weg.kosten === null ? null : runde(r.rohertrag - weg.kosten) });
      });
      aus.marge = { schichten: fifo.schichten, abfuellungen: jeAbfuellung, aktuell: aktuell, ueber: fifo.ueber, fehlt: fifo.fehlt, abweichung: abweichung,
        verluste: verluste, mehr: fifo.mehr, flaschen: flaschen, kostenJeZeile: fifo.kosten,
        jahr: roh(jahrS), vorjahr: vorDa ? roh(vorS) : null, gesamt: roh(gesS), monate: mMonate,
        kanaele: mitAnteil(zj.kanaele.map((x) => Object.assign({ kanal: x.kanal }, roh(kanS[x.kanal] || leer()))).filter(zeigt)),
        top: mitAnteil(zj.kunden.map((x) => Object.assign({ kunde: x.kunde }, roh(kunS[x.schluessel] || leer()))).filter(zeigt)).sort(nachErtrag)
          .slice(0, 10).map((x, i) => Object.assign({ rang: i + 1 }, x)),
        unterKosten: { anzahl: unter.length, flaschen: runde(unterFl), anteil: flSumme > 0 ? zehntel((unterFl / flSumme) * 100) : 0 } };
      // Was nach den Abgängen bleibt, nur in Euro: Rohertrag aus den Verkäufen minus Herstellkosten der Flaschen, die
      // ohne Verkauf weg sind. Marge und Rohertrag selbst beziehen sich weiter nur auf verkaufte Flaschen (Mark,
      // 2026-11-10: „die Marge soll dadurch nicht runtergehen“), deshalb hier bewusst kein Prozentwert.
      const nach = (r, v) => {
        if (!r) return null;
        return { rohertrag: r.rohertrag, abgaenge: v.kosten, flaschen: v.flaschen,
          bleibt: r.rohertrag === null || v.kosten === null ? null : runde(r.rohertrag - v.kosten),
          // was die Abgänge je verkaufter Flasche kosten
          proFlasche: v.kosten !== null && r.flaschen > 0 ? runde(v.kosten / r.flaschen) : null };
      };
      const v3 = verluste || { jahr: vOhne, vorjahr: vOhne, gesamt: vOhne };
      aus.marge.nach = !verluste ? null : { jahr: nach(aus.marge.jahr, v3.jahr), vorjahr: nach(aus.marge.vorjahr, v3.vorjahr), gesamt: nach(aus.marge.gesamt, v3.gesamt) };
    }
    return aus;
  }

  /**
   * Blöcke auf zwei Spalten verteilen, ohne die Reihenfolge zu ändern: Rückgabe = wie viele Blöcke vorn in die erste
   * Spalte kommen, sodass beide nach den geschätzten Höhen (`hoehen`, Zahlen > 0) möglichst gleich lang sind. Bei
   * Gleichstand ist die erste Spalte die längere. Ein Block oder keiner: alles in die erste.
   */
  function spaltenTeilen(hoehen) {
    const h = (Array.isArray(hoehen) ? hoehen : []).map((x) => (istZahl(x) && x > 0 ? x : 0));
    const summe = h.reduce((x, y) => x + y, 0);
    let vorn = 0;
    let beste = h.length;
    let abstand = summe;
    for (let i = 1; i < h.length; i++) {
      vorn += h[i - 1];
      const d = Math.abs(vorn - (summe - vorn));
      if (d < abstand || (d === abstand && vorn >= summe - vorn)) { abstand = d; beste = i; }
    }
    return beste;
  }

  /** Was sich in „Auswerten“ zeigen und aufteilen lässt. */
  const AUSWERTEN_KENNZAHLEN = ['flaschen', 'umsatz', 'rohertrag'];
  const AUSWERTEN_NACH = ['jahr', 'monat', 'kanal', 'kunde'];

  /**
   * Auswerten (seit v35): die Verkäufe nach Wahl gefiltert und aufgeteilt, damit sich eine einzelne Zahl schnell findet,
   * ohne das ganze Dashboard durchzugehen (Wunsch aus dem Team, 2026-11-12: Filter nach Jahr und Region, Flaschen
   * gegen Umsatz gegen Ertrag). `zeilen` aus verkaufZeilen, `kosten` = Herstellkosten je Zeile in derselben Reihenfolge
   * (dashboardMehr → marge.kostenJeZeile; ohne Herstellkosten null), `heute` = `JJJJ-MM-TT`, `wahl` = { kennzahl:
   * 'flaschen' | 'umsatz' | 'rohertrag', jahr (Zahl; sonst alle Jahre), kanal ('' = alle), nach: 'jahr' | 'monat' |
   * 'kanal' | 'kunde' }. Ohne Zeilen oder gültiges `heute` null. Rückgabe:
   * { kennzahl, jahr, kanal, nach: die Wahl, wie sie gilt (Rohertrag ohne Herstellkosten → Flaschen, unbekanntes Jahr →
   *     null, unbekannter Kanal → '', 'jahr' bei gewähltem Jahr → 'monat'),
   *   mitKosten, jahre: Jahre mit Verkaufszeilen (neuestes zuerst), kanaele: alle Kanäle nach Flaschen über alles (feste
   *     Reihenfolge, egal was gewählt ist), erster: erster Monat mit einer Zeile,
   *   werte (seit v36): Funktion Monat → { flaschen, umsatz } des gewählten Kanals über alle Jahre, mit Herstellkosten
   *     dazu `rohertrag` (null, wo sie fehlen). Passt in jahresVergleich, so folgen die Diagramme der Verkäufe der Wahl,
   *   summe: Posten der Auswahl, dazu { bestellungen (wie bestellListe, Flaschen im Plus), kunden (unter dem Strich
   *     Flaschen im Plus) },
   *   vergleich: nur mit gewähltem Jahr und Verkäufen davor, sonst null: { jahr (das Jahr davor), bis (letzter
   *     verglichener Monat; null = ganze Jahre), flaschen, umsatz, rohertrag (Veränderung in Prozent, null ohne Basis) }.
   *     Das laufende Jahr vergleicht seine vollen Monate mit denselben Monaten im Jahr davor, ein früheres Jahr ganz,
   *   gruppen: je { schluessel, name, laufend (Monat oder Jahr zählt erst bis heute), Posten, wert (die gewählte
   *     Kennzahl), balken (Prozent des größten Werts, 0 bei Minus), anteil (Kanal und Kunde: Prozent an allem im Plus;
   *     sonst null), p (Veränderung der gewählten Kennzahl zum Jahr davor: Jahr und Monat wie bei `vergleich`, beim
   *     laufenden Monat null; Kanal und Kunde seit v36 über dasselbe Fenster wie `vergleich`, ohne gewähltes Jahr
   *     null), neu (Kanal und Kunde: im Fenster des Jahres davor keine Flaschen, jetzt schon) }. Jahre und Monate
   *     neueste zuerst (Monate vom ersten Verkauf bzw. Januar bis heute, auch ohne Verkäufe), Kanäle und Kunden nach
   *     der gewählten Kennzahl. Kanäle, die im Fenster des Jahres davor verkauft haben und jetzt fehlen, stehen mit 0
   *     dabei (sonst verschwinden Verluste).
   * Posten = { flaschen, umsatz, kosten, rohertrag, marge (Prozent vom Umsatz), proFlasche (Umsatz), rohProFlasche },
   * gerechnet wie in dashboardMehr; ohne Herstellkosten (oder wo sie einer berührten Abfüllung fehlen) sind kosten,
   * rohertrag, marge und rohProFlasche null.
   */
  function auswerten(zeilen, kosten, heute, wahl) {
    if (!Array.isArray(zeilen) || !datumGueltig(heute)) return null;
    const jetzt = heute.slice(0, 7);
    const diesesJahr = Number(jetzt.slice(0, 4));
    const lfm = monatPlus(jetzt, -1);
    const mitKosten = Array.isArray(kosten);
    const alle = zeilen.map((z, i) => ({ z: z, k: mitKosten ? kosten[i] : null }))
      .filter((x) => x.z && typeof x.z.monat === 'string' && MONAT_MUSTER.test(x.z.monat) && x.z.monat <= jetzt && istZahl(x.z.flaschen));
    const jahrVon = (x) => Number(x.z.monat.slice(0, 4));
    const nachName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

    const leer = () => ({ flaschen: 0, umsatz: 0, kosten: 0, offen: !mitKosten });
    const dazu = (s, x) => {
      s.flaschen += x.z.flaschen;
      s.umsatz += istZahl(x.z.umsatz) ? x.z.umsatz : 0;
      if (istZahl(x.k)) s.kosten += x.k; else s.offen = true;
      return s;
    };
    const posten = (s) => {
      const flaschen = runde(s.flaschen);
      const umsatz = runde(s.umsatz);
      const proFlasche = flaschen > 0 ? runde(umsatz / flaschen) : null;
      if (s.offen) return { flaschen: flaschen, umsatz: umsatz, kosten: null, rohertrag: null, marge: null, proFlasche: proFlasche, rohProFlasche: null };
      const k = runde(s.kosten);
      const ertrag = runde(umsatz - k);
      return { flaschen: flaschen, umsatz: umsatz, kosten: k, rohertrag: ertrag, marge: umsatz > 0 ? zehntel((ertrag / umsatz) * 100) : null,
        proFlasche: proFlasche, rohProFlasche: flaschen > 0 ? runde(ertrag / flaschen) : null };
    };
    const summeVon = (liste, von, bis) => posten(liste.reduce((s, x) => (x.z.monat >= von && x.z.monat <= bis ? dazu(s, x) : s), leer()));

    // Was es zu wählen gibt: Jahre mit Zeilen, Kanäle nach Flaschen über alles
    const jahre = Array.from(new Set(alle.map(jahrVon))).sort((a, b) => b - a);
    const proKanal = Object.create(null);
    alle.forEach((x) => { proKanal[x.z.kanal] = (proKanal[x.z.kanal] || 0) + x.z.flaschen; });
    const kanaele = Object.keys(proKanal).sort((a, b) => proKanal[b] - proKanal[a] || nachName(a, b));
    const erster = alle.reduce((m, x) => (x.z.monat < m ? x.z.monat : m), jetzt);

    const w = wahl || {};
    let kennzahl = AUSWERTEN_KENNZAHLEN.indexOf(w.kennzahl) >= 0 ? w.kennzahl : 'flaschen';
    if (kennzahl === 'rohertrag' && !mitKosten) kennzahl = 'flaschen';
    const jahr = jahre.indexOf(w.jahr) >= 0 ? w.jahr : null;
    const kanal = kanaele.indexOf(w.kanal) >= 0 ? w.kanal : '';
    let nach = AUSWERTEN_NACH.indexOf(w.nach) >= 0 ? w.nach : 'monat';
    if (nach === 'jahr' && jahr !== null) nach = 'monat';

    const imKanal = kanal ? alle.filter((x) => x.z.kanal === kanal) : alle;
    const passt = jahr === null ? imKanal : imKanal.filter((x) => jahrVon(x) === jahr);

    // Vergleich mit dem Jahr davor: das laufende Jahr über seine vollen Monate, ein früheres ganz
    const fenster = (j) => (j !== diesesJahr ? { von: j + '-01', bis: j + '-12' } : lfm.slice(0, 4) === String(j) ? { von: j + '-01', bis: lfm } : null);
    const zumVorjahr = (f) => {
      if (!f || monatPlus(f.bis, -12) < erster) return null; // davor gab es noch nichts
      const a = summeVon(imKanal, f.von, f.bis);
      const v = summeVon(imKanal, monatPlus(f.von, -12), monatPlus(f.bis, -12));
      return { flaschen: veraenderung(a.flaschen, v.flaschen), umsatz: veraenderung(a.umsatz, v.umsatz),
        rohertrag: a.rohertrag === null || v.rohertrag === null ? null : veraenderung(a.rohertrag, v.rohertrag) };
    };
    const f = jahr === null ? null : fenster(jahr);
    const vg = zumVorjahr(f);
    const vergleich = vg ? Object.assign({ jahr: jahr - 1, bis: jahr === diesesJahr ? f.bis : null }, vg) : null;

    // Gruppen
    const gruppe = (schluessel, name, p, extra) => Object.assign({ schluessel: schluessel, name: name, laufend: false }, p, { wert: p[kennzahl], balken: 0, anteil: null, p: null, neu: false }, extra);
    let gruppen;
    if (nach === 'jahr') {
      gruppen = jahre.map((j) => {
        const v = zumVorjahr(fenster(j));
        return gruppe(String(j), String(j), summeVon(imKanal, j + '-01', j + '-12'), { laufend: j === diesesJahr, p: v ? v[kennzahl] : null });
      });
    } else if (nach === 'monat') {
      const von = jahr === null || jahr + '-01' < erster ? erster : jahr + '-01';
      const bis = jahr === null || jahr + '-12' > jetzt ? jetzt : jahr + '-12';
      gruppen = [];
      for (let m = bis; m >= von; m = monatPlus(m, -1)) {
        const v = m === jetzt ? null : zumVorjahr({ von: m, bis: m });
        gruppen.push(gruppe(m, m, summeVon(passt, m, m), { laufend: m === jetzt, p: v ? v[kennzahl] : null }));
      }
    } else {
      const feld = nach === 'kanal' ? 'kanal' : 'schluessel';
      const sammeln = Object.create(null);
      passt.forEach((x) => {
        const g = sammeln[x.z[feld]] = sammeln[x.z[feld]] || { s: leer(), namen: Object.create(null) };
        dazu(g.s, x);
        const n = nach === 'kanal' ? x.z.kanal : x.z.kunde || '(ohne Name)';
        g.namen[n] = (g.namen[n] || 0) + 1;
      });
      // Mit gewähltem Jahr: je Gruppe die Veränderung zum Jahr davor über dasselbe Fenster wie `vergleich`
      const jetztF = Object.create(null);
      const vorher = Object.create(null);
      if (vg) {
        const v0 = monatPlus(f.von, -12);
        const v1 = monatPlus(f.bis, -12);
        imKanal.forEach((x) => {
          const k = x.z[feld];
          if (x.z.monat >= f.von && x.z.monat <= f.bis) dazu(jetztF[k] = jetztF[k] || leer(), x);
          else if (x.z.monat >= v0 && x.z.monat <= v1) dazu(vorher[k] = vorher[k] || leer(), x);
        });
        // Kanäle, die im Jahr davor verkauft haben und jetzt fehlen, mit 0 zeigen
        if (nach === 'kanal') Object.keys(vorher).forEach((k) => { if (!sammeln[k] && vorher[k].flaschen > 0) sammeln[k] = { s: leer(), namen: { [k]: 1 } }; });
      }
      const rang = (g) => (g.wert === null ? -Infinity : g.wert);
      gruppen = Object.keys(sammeln).map((k) => {
        const g = gruppe(k, haeufigsterName(sammeln[k].namen), posten(sammeln[k].s));
        if (vg) {
          const a = posten(jetztF[k] || leer());
          const v = posten(vorher[k] || leer());
          g.p = a[kennzahl] === null || v[kennzahl] === null ? null : veraenderung(a[kennzahl], v[kennzahl]);
          g.neu = !(v.flaschen > 0) && g.flaschen > 0;
        }
        return g;
      }).sort((a, b) => rang(b) - rang(a) || b.flaschen - a.flaschen || b.umsatz - a.umsatz || nachName(a.name, b.name));
      const plus = gruppen.reduce((x, g) => x + Math.max(0, g.wert || 0), 0);
      gruppen.forEach((g) => { g.anteil = plus > 0 ? zehntel((Math.max(0, g.wert || 0) / plus) * 100) : 0; });
    }
    const hoch = gruppen.reduce((x, g) => Math.max(x, g.wert || 0), 0);
    gruppen.forEach((g) => { g.balken = hoch > 0 && g.wert > 0 ? zehntel((g.wert / hoch) * 100) : 0; });

    // Monatswerte des gewählten Kanals über alle Jahre, für die Diagramme (jahresVergleich)
    const proMonat = Object.create(null);
    imKanal.forEach((x) => dazu(proMonat[x.z.monat] = proMonat[x.z.monat] || leer(), x));
    const werte = (m) => {
      const p = posten(proMonat[m] || leer());
      return mitKosten ? { flaschen: p.flaschen, umsatz: p.umsatz, rohertrag: p.rohertrag } : { flaschen: p.flaschen, umsatz: p.umsatz };
    };

    // Bestellungen und Kunden der Auswahl
    const proKunde = Object.create(null);
    passt.forEach((x) => { proKunde[x.z.schluessel] = (proKunde[x.z.schluessel] || 0) + x.z.flaschen; });
    const summe = Object.assign(posten(passt.reduce(dazu, leer())), {
      bestellungen: bestellListe(passt.map((x) => x.z)).filter((b) => b.flaschen > 0).length,
      kunden: Object.keys(proKunde).filter((s) => proKunde[s] > 0).length,
    });
    return { kennzahl: kennzahl, jahr: jahr, kanal: kanal, nach: nach, mitKosten: mitKosten, jahre: jahre, kanaele: kanaele, erster: erster,
      werte: werte, summe: summe, vergleich: vergleich, gruppen: gruppen };
  }

  const hilfen = {
    CODE_LAENGE, ARTEN, MAX_KOMMENTAR, codeBereinigen, codePruefen, apiUrlGueltig, zahlFormat, euroFormat, kistenFormat,
    zeitFormat, datumGueltig, datumFormat, datumText, monatFormat, zeitraumFormat, heuteBerlin, tagePlus, tageZwischen, bestellStufe,
    reichweiteBalken,
    ganzeZahlEingabe, flaschenAusEingabe, kistenText, kistenTeilen, buchungPruefen, buchungText, anfrageIdAus, achse, diagrammMasse,
    achsenText, achseMitMinus, antwortDeuten, uebersichtGueltig, neuer,
    relativZeit, monatPlus, veraenderung, prozentText, richtung, monatsTrend, reiterPosition, ziehRichtung, gummiband, ziehTempo, blattSchliesst,
    MAX_FLASCHEN, datumKurz, monateAnzahl, zeitraumKurz, monatBisher, kistenKurz, anteileSinnvoll, hinweiseOrdnen, verlaufOhneStorno, schrittWert,
    kundeSchluessel, rechnungOhnePosition, STANDORT_VERSCHIEDEN, standortAuswahl, verkaufZeilen, monatsWerte, jahresVergleich, kumuliert, zeitraumAuswerten, kundeDetails, nachfassen,
    bestellungenZaehlen, wannText, abstandText, monatName, wochentagText, dauerText, datumAbkuerzungen, buchungVorschau, standText, frageTeilen, inventurAm, jahresStichtag, prognoseSaison, aktivitaet, monatsTage, letzteBestellungen,
    datumMonatePlus, ersterVerkaufsmonat, bekannteRechnungen, bestellPrognose, dashboardDaten, dashboardMehr, bestellListe, fifoSchichten, fifoKosten, kostenAusEingabe, MAX_KOSTEN_PRO_FLASCHE,
    auswerten, AUSWERTEN_KENNZAHLEN, AUSWERTEN_NACH, spaltenTeilen,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = hilfen;
  else wurzel.SATE_HILFEN = hilfen;
})(typeof window !== 'undefined' ? window : globalThis);
