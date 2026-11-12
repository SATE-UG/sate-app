// Kern der SATE-App: gemeinsamer Zustand, DOM-Bausteine, Gerätespeicher, Schnittstelle, Rückfrage und Rückmeldung.
// Alles liegt unter window.SATE; ansichten.js, eintragen.js und app.js bauen darauf auf.
// Der Zugangscode liegt nur in localStorage dieses Geräts und geht nur im POST-Body an die Web-App (nie in die URL).
(function () {
  'use strict';

  const H = window.SATE_HILFEN;
  const API_URL = (window.SATE_CONFIG || {}).apiUrl;
  const ZEITLIMIT_LESEN_MS = 30000;
  const ZEITLIMIT_SCHREIBEN_MS = 60000; // Schreiben wartet auf die Sperre und schreibt danach Tab Lager
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const S = window.SATE = {
    H: H,
    SCHLUESSEL: { code: 'sate.zugangscode', daten: 'sate.uebersicht', ansicht: 'sate.ansicht', standort: 'sate.standort' },
    zustand: {
      code: '',          // Zugangscode dieser Sitzung
      name: '',          // Name aus der letzten Antwort
      daten: null,       // letzte Antwort der Aktion `uebersicht` (ohne ok/name)
      frisch: false,     // false = Daten aus dem Gerätespeicher, noch nicht neu geladen
      laedt: false,      // uebersicht wird gerade geladen
      offline: false,    // letzter Abruf scheiterte an fehlender Verbindung (oder navigator.onLine === false)
      schreibt: false,   // eine Schreib-Aktion läuft (nie zwei gleichzeitig)
      schreibNr: 0,      // zählt bei Beginn und Ende jeder Schreib-Aktion hoch
      ladenNachholen: false, // ein Neuladen wurde während des Schreibens verworfen
      sitzung: 0,        // zählt bei Abmelden hoch; ältere Antworten werden verworfen
      ansicht: 'uebersicht',
      verlauf: null,     // { eintraege, zeit } aus der Aktion `verlauf`
      verlaufLaedt: false,
      verlaufFehler: '',
      verlaufVeraltet: true,
      diagramm: 'flaschen', // Verkäufe: Kennzahl 'flaschen' | 'umsatz' | 'rohertrag' (gilt für den ganzen Reiter)
      zeitraum: 'jahr',
      monatWahl: null,   // Verkäufe: gewählter Monat (`JJJJ-MM`, auch im Vorjahr), null = letzter voller Monat
      alleKunden: false, // Kunden: alle statt der ersten 20
      kundenZeitraum: 'jahr', // Kunden: 'jahr' | 'vorjahr' | 'gesamt'
      kundenSuche: '',   // Kunden: Suchtext
      kundenKanal: '',   // Kunden: nur dieser Kanal ('' = alle)
      kundenSortierung: 'menge', // Kunden: 'menge' | 'zuletzt' | 'name'
      alleNachfassen: false,
      rechenwegOffen: false, // Start: „So rechnet die App“ aufgeklappt?
      zuordnenOffen: false, // Lager: „Verkäufe zuordnen“ aufgeklappt?
      verlaufAlle: false,   // Lager: ganzen Verlauf statt der letzten 10 zeigen
      verkaufJahr: undefined, // Verkäufe: gewähltes Jahr (Zahl), null = alle Jahre, undefined = noch nichts gewählt (dann das laufende Jahr)
      verkaufKanal: '',     // Verkäufe: nur dieser Kanal ('' = alle)
      verkaufNach: 'kanal', // Verkäufe: Aufteilung nach 'kanal' | 'kunde' (mit gewähltem Kanal immer Kunden)
      verkaufAlle: false,   // Verkäufe: alle Zeilen der Aufteilung statt der ersten zwölf
    },
    ansichten: {},
  };

  S.el = (id) => document.getElementById(id);

  /** Element bauen: attrs { class, text, onclick, … }, Kinder als Knoten, Texte oder Listen (null wird übersprungen). */
  function knoten(ns, tag, attrs, kinder) {
    const e = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') e.textContent = String(v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : String(v));
    });
    const anhaengen = (k) => {
      if (k === null || k === undefined || k === false) return;
      if (Array.isArray(k)) k.forEach(anhaengen);
      else e.append(typeof k === 'string' ? document.createTextNode(k) : k);
    };
    anhaengen(kinder);
    return e;
  }
  S.h = (tag, attrs, ...kinder) => knoten(null, tag, attrs, kinder);
  /** Inhalt eines Elements ersetzen; null/false/undefined fallen weg (replaceChildren schriebe sonst „null“), Listen flach. */
  S.fuellen = function (el, ...kinder) {
    const flach = [];
    const rein = (k) => {
      if (k === null || k === undefined || k === false) return;
      if (Array.isArray(k)) k.forEach(rein); else flach.push(typeof k === 'string' ? document.createTextNode(k) : k);
    };
    kinder.forEach(rein);
    el.replaceChildren(...flach);
    return el;
  };
  S.s = (tag, attrs, ...kinder) => knoten(SVG_NS, tag, attrs, kinder);

  // Symbole (selbst gezeichnet, 24×24, nur Linien in currentColor; die Reiter-Symbole stehen fest in index.html) ----
  const FLASCHE = 'M10 3h4v3.5l2.2 3.3c.5.7.8 1.6.8 2.5V20a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-7.7c0-.9.3-1.8.8-2.5L10 6.5z';
  S.ICONS = {
    raster: [['rect', { x: 4, y: 4, width: 6.5, height: 6.5, rx: 1.5 }], ['rect', { x: 13.5, y: 4, width: 6.5, height: 6.5, rx: 1.5 }],
      ['rect', { x: 4, y: 13.5, width: 6.5, height: 6.5, rx: 1.5 }], ['rect', { x: 13.5, y: 13.5, width: 6.5, height: 6.5, rx: 1.5 }]],
    inventur: [['rect', { x: 5, y: 4.5, width: 14, height: 16.5, rx: 2 }], ['path', { d: 'M9 4.5V3h6v1.5' }], ['path', { d: 'M8.5 12.5l2.3 2.3 4.7-4.8' }]],
    umlagerung: [['path', { d: 'M4 8h14.5' }], ['path', { d: 'M15 4.5 18.5 8 15 11.5' }], ['path', { d: 'M20 16H5.5' }], ['path', { d: 'M9 12.5 5.5 16 9 19.5' }]],
    promo: [['rect', { x: 3.5, y: 8, width: 17, height: 4, rx: 1 }], ['path', { d: 'M5.5 12v8h13v-8' }], ['path', { d: 'M12 8v12' }],
      ['path', { d: 'M12 8C10.5 4.5 7 4.3 7 6.4 7 8 9.5 8 12 8s5 0 5-1.6C17 4.3 13.5 4.5 12 8z' }]],
    eigenverbrauch: [['path', { d: 'M8.5 3h7l-.6 6.4a2.9 2.9 0 0 1-5.8 0z' }], ['path', { d: 'M12 12.5V20' }], ['path', { d: 'M8.5 20.5h7' }]],
    bruch: [['path', { d: FLASCHE }], ['path', { d: 'M7.2 14.2l3-1.4 1.5 2 2.2-1.6 3 1' }]],
    abfuellung: [['path', { d: FLASCHE }], ['path', { d: 'M12 12.5v5M9.5 15h5' }]],
    storno: [['path', { d: 'M9 14 4.5 9.5 9 5' }], ['path', { d: 'M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3' }]],
    ok: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M8 12.3l2.7 2.7L16 9.6' }]],
    fehler: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7.5v5.5' }], ['path', { d: 'M12 16.4v.1' }]],
    ertrag: [['path', { d: 'M4 16.5l5-5 4 3.5 7-8' }], ['path', { d: 'M15.5 7H20v4.5' }]],
    info: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 11v5.5' }], ['path', { d: 'M12 7.6v.1' }]],
    flasche: [['path', { d: FLASCHE }]],
    lupe: [['circle', { cx: 10.5, cy: 10.5, r: 6.5 }], ['path', { d: 'M15.4 15.4 20 20' }]],
    zu: [['path', { d: 'M7 7l10 10M17 7 7 17' }]],
    kunden: [['circle', { cx: 9, cy: 8, r: 3.5 }], ['path', { d: 'M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5' }], ['path', { d: 'M15.5 4.8a3.5 3.5 0 0 1 0 6.4' }],
      ['path', { d: 'M18 14.9c2 .8 3.2 2.5 3.5 5.1' }]],
    rechnung: [['path', { d: 'M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z' }], ['path', { d: 'M9 8h6M9 11.5h6M9 15h3.5' }]],
  };
  /** Symbol als SVG-Knoten (für Vorleseprogramme versteckt). */
  S.icon = function (name, klasse) {
    return S.s('svg', { class: 'icon' + (klasse ? ' ' + klasse : ''), viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
      (S.ICONS[name] || []).map(([tag, attrs]) => S.s(tag, attrs)));
  };

  // Gerätespeicher (localStorage kann im privaten Modus fehlen oder werfen) ---------------------------------------
  S.speicher = {
    lesen(k) { try { return window.localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    schreiben(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    /** true, wenn danach wirklich nichts mehr unter k steht. */
    loeschen(k) {
      try { window.localStorage.removeItem(k); } catch (e) { /* unten prüfen */ }
      if (!this.lesen(k)) return true;
      try { window.localStorage.setItem(k, ''); } catch (e) { /* unten prüfen */ }
      return !this.lesen(k);
    },
  };

  // Schnittstelle -----------------------------------------------------------------------------------------------

  /** Verbindung merken (für das Offline-Banner): true = keine Verbindung, false = Server hat geantwortet. */
  function verbindungMerken(offline) {
    if (S.zustand.offline === offline) return;
    S.zustand.offline = offline;
    if (typeof S.offlineZeigen === 'function') S.offlineZeigen();
  }

  /** Eine Aktion an die Web-App. `extra` = weitere Felder, `code` nur bei der Anmeldung. Rückgabe wie antwortDeuten. */
  S.anfrage = async function (aktion, extra, code, zeitlimit) {
    if (!H.apiUrlGueltig(API_URL)) {
      return { art: 'fehler', meldung: 'Die App ist noch nicht fertig eingerichtet (Web-App-URL fehlt in config.js).' };
    }
    if (navigator.onLine === false) {
      verbindungMerken(true);
      return { art: 'fehler', meldung: 'Kein Internet. Bitte Verbindung prüfen und neu laden.', netz: true, offline: true };
    }
    const abbruch = new AbortController();
    const uhr = setTimeout(() => abbruch.abort(), zeitlimit || ZEITLIMIT_LESEN_MS);
    try {
      // text/plain = „einfache“ Anfrage ohne CORS-Preflight (Apps Script beantwortet kein OPTIONS).
      const antwort = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({}, extra || {}, { code: code || S.zustand.code, aktion: aktion })),
        redirect: 'follow',
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: abbruch.signal,
      });
      const text = await antwort.text();
      verbindungMerken(false);
      return H.antwortDeuten(antwort.status, text);
    } catch (e) {
      // Zeitüberschreitung sagt nichts Sicheres über die Verbindung (oft nur ein langsamer Server): Banner nicht ändern
      if (e && e.name === 'AbortError') return { art: 'fehler', meldung: 'Die Schnittstelle antwortet nicht. Bitte später nochmal versuchen.', netz: true };
      verbindungMerken(true);
      return { art: 'fehler', meldung: 'Keine Verbindung zur Schnittstelle. Bitte Internet prüfen und neu laden.', netz: true, offline: true };
    } finally {
      clearTimeout(uhr);
    }
  };

  /** Neue Anfrage-ID für den Doppelklick-Schutz (32 Hex-Zeichen). */
  S.neueAnfrageId = function () {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return H.anfrageIdAus(bytes);
  };

  /**
   * Schreib-Aktion (buchen, stornieren, verkaufStandort) mit anfrageId. Will der Server ein „trotzdem“, kommt die
   * Rückfrage mit seiner Warnung; bei Ja dieselbe Anfrage mit bestaetigt: true. Die frische Übersicht aus der Antwort
   * wird übernommen. Rückgabe wie antwortDeuten, dazu { art: 'abgebrochen' } (Rückfrage mit Nein beantwortet).
   */
  S.schreiben = async function (aktion, daten) {
    const Z = S.zustand;
    if (Z.schreibt) return { art: 'fehler', meldung: 'Moment, es wird gerade noch gespeichert.' };
    const sitzung = Z.sitzung;
    const gleicheSitzung = () => sitzung === Z.sitzung; // nach Abmelden keine Antwort mehr übernehmen
    let frisch = false; // hat die Antwort eine neue Übersicht gebracht?
    Z.schreibt = true;
    Z.schreibNr++; // laufende Lese-Anfragen gelten ab jetzt als veraltet (siehe S.laden, S.verlaufLaden)
    if (typeof S.eintragenPruefen === 'function') S.eintragenPruefen(); // „Speichern“ sperren, solange geschrieben wird
    try {
      const nutz = Object.assign({}, daten, { anfrageId: daten.anfrageId || S.neueAnfrageId() });
      let e = await S.anfrage(aktion, nutz, '', ZEITLIMIT_SCHREIBEN_MS);
      if (!gleicheSitzung()) return { art: 'abgebrochen' };
      if (e.art === 'bestaetigen') {
        if (!(await S.frage(e.warnung, 'Trotzdem speichern', 'Abbrechen')) || !gleicheSitzung()) return { art: 'abgebrochen' };
        e = await S.anfrage(aktion, Object.assign(nutz, { bestaetigt: true }), '', ZEITLIMIT_SCHREIBEN_MS);
        if (!gleicheSitzung()) return { art: 'abgebrochen' };
        if (e.art === 'bestaetigen') e = { art: 'fehler', meldung: e.warnung };
      }
      if (e.art === 'ok') {
        Z.verlaufVeraltet = true;
        frisch = S.datenSetzen(e.daten.uebersicht, e.daten.name);
        if (!frisch) S.laden(); // Übersicht fehlte: neu holen
      } else if (e.art === 'code') {
        S.codeUngueltig(e.meldung);
      }
      return e;
    } finally {
      Z.schreibt = false;
      Z.schreibNr++;
      // Ein Neuladen wurde während des Schreibens verworfen und die Schreib-Antwort brachte nichts Frisches: nachholen
      if (Z.ladenNachholen) {
        Z.ladenNachholen = false;
        if (!frisch && gleicheSitzung() && Z.code) S.laden();
      }
      // Während des Schreibens gesperrte Bedienelemente (z. B. Verkäufe zuordnen) wieder freigeben
      if (gleicheSitzung() && Z.code) S.ansichten.lager();
      if (typeof S.eintragenPruefen === 'function') S.eintragenPruefen();
    }
  };

  // Rückfrage und Rückmeldung -------------------------------------------------------------------------------------

  const ruhig = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /**
   * Kurzes Tippen im Gerät (Haptik) bei Auswahl und Ergebnis. Webseiten dürfen auf dem iPhone nicht vibrieren; ab
   * iOS 17.4 löst aber das Umlegen eines Schalters (<input type="checkbox" switch>) das System-Tippen aus, auch wenn
   * das Skript auf sein Label klickt. Android vibriert kurz. Ohne Unterstützung passiert nichts.
   */
  S.haptik = function () {
    try {
      if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return;
      if (typeof navigator.vibrate === 'function') { navigator.vibrate(8); return; }
      const label = document.createElement('label');
      const schalter = document.createElement('input');
      schalter.type = 'checkbox';
      schalter.setAttribute('switch', '');
      label.setAttribute('aria-hidden', 'true');
      label.style.display = 'none';
      label.appendChild(schalter);
      document.head.appendChild(label);
      label.click();
      label.remove();
    } catch (e) { /* ohne Haptik weiter */ }
  };

  /**
   * Rückfrage mit zwei Knöpfen. Promise → true bei „ja“. Ohne <dialog>-Unterstützung: window.confirm. Die Frage vorn
   * (bis zum ersten „?“) steht fett als Titel, der Rest als Erklärung darunter. `gefahr`: der Ja-Knopf ist rot
   * (Storno, Abmelden).
   */
  S.frage = function (text, ja, nein, gefahr) {
    const d = S.el('dialog');
    if (!d || typeof d.showModal !== 'function') return Promise.resolve(window.confirm(text));
    const teile = H.frageTeilen(text);
    S.el('dialog-titel').textContent = teile.titel;
    S.el('dialog-titel').hidden = !teile.titel;
    S.el('dialog-text').textContent = teile.text;
    S.el('dialog-text').hidden = !teile.text;
    d.setAttribute('aria-labelledby', teile.titel ? 'dialog-titel' : 'dialog-text');
    S.el('dialog-ja').textContent = ja || 'Ja';
    S.el('dialog-ja').classList.toggle('haupt', !gefahr);
    S.el('dialog-ja').classList.toggle('gefahr', !!gefahr);
    S.el('dialog-nein').textContent = nein || 'Abbrechen';
    // Zwei Kapseln nebeneinander; passt eine Beschriftung nicht in die halbe Breite, stehen sie untereinander
    d.classList.toggle('gestapelt', Math.max((ja || 'Ja').length, (nein || 'Abbrechen').length) > 11);
    // Kommt eine Frage, während noch eine offen ist: die alte gilt als „nein“, das Fenster bleibt offen und zeigt die neue
    frageAntworten(false);
    return new Promise((fertig) => {
      frageOffen = fertig;
      if (!d.open) d.showModal();
      // Fokus auf die Frage, nicht auf einen Knopf: Vorleser lesen sie vor, und kein Knopf sieht vorgewählt aus
      S.el(teile.titel ? 'dialog-titel' : 'dialog-text').focus();
    });
  };
  /**
   * Die offene Rückfrage beantworten. Genau einmal je Frage und gleich, nicht erst im close-Ereignis: das kommt
   * verzögert und träfe sonst eine inzwischen neu gestellte Frage.
   */
  let frageOffen = null;
  function frageAntworten(ja) {
    const fertig = frageOffen;
    frageOffen = null;
    if (fertig) fertig(!!ja);
  }
  /** Offene Rückfrage schließen (wie „nein“), z. B. beim Abmelden. */
  S.frageSchliessen = function () {
    const d = S.el('dialog');
    frageAntworten(false);
    if (d && d.open && typeof d.close === 'function') d.close();
  };
  S.el('dialog-ja').addEventListener('click', () => { frageAntworten(true); S.el('dialog').close(); });
  S.el('dialog-nein').addEventListener('click', () => { frageAntworten(false); S.el('dialog').close(); });
  // Escape (oder ein Schließen von außen) zählt als „nein“; ist das Fenster schon wieder offen, gehört das Ereignis zur alten Frage
  S.el('dialog').addEventListener('close', () => { if (!S.el('dialog').open) frageAntworten(false); });

  /**
   * Blatt von unten (iOS-Sheet) mit Titel und Inhalt (Knoten). Schließen: nach unten ziehen (gesten.js), Knopf oben
   * rechts, Tippen auf den dunklen Rand, Escape. Der Fokus geht danach zurück auf das Element, von dem aus es geöffnet
   * wurde. Auf und zu fährt es mit einer kurzen Bewegung (bei „Bewegung reduzieren“ ohne).
   */
  const BLATT_KURVE = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const lage = (px) => 'translate3d(0, ' + px + ', 0)';
  let blattVon = null;
  let blattZurueck = null; // Ersatz, falls das auslösende Element inzwischen neu gebaut wurde (z. B. nach Neuladen)
  let blattLauf = null;    // laufende Bewegung (Web Animation)

  /** Blatt von `von` nach `nach` bewegen (CSS-Längen für die Höhe), danach `fertig()`. Eine laufende Bewegung endet. */
  function blattBewegen(von, nach, ms, kurve, fertig) {
    const b = S.el('blatt');
    if (blattLauf) { blattLauf.onfinish = null; blattLauf.cancel(); blattLauf = null; }
    b.style.transform = '';
    if (ruhig() || typeof b.animate !== 'function') { if (fertig) fertig(); return; }
    const lauf = b.animate([{ transform: lage(von) }, { transform: lage(nach) }], { duration: ms, easing: kurve, fill: 'both' });
    blattLauf = lauf;
    lauf.onfinish = () => {
      if (blattLauf === lauf) blattLauf = null;
      if (fertig) fertig();
      lauf.cancel(); // Endlage steht jetzt ohne Animation (offen: an Ort und Stelle, zu: gar nicht mehr sichtbar)
    };
  }
  /** Um wie viele Pixel das Blatt gerade nach unten versetzt ist (gezogen oder mitten in einer Bewegung), sonst 0. */
  function blattVersatz() {
    try {
      const m = /matrix(3d)?\(([^)]+)\)/.exec(getComputedStyle(S.el('blatt')).transform || '');
      if (!m) return 0;
      const w = m[2].split(',').map(Number);
      return Math.max(0, (m[1] ? w[13] : w[5]) || 0);
    } catch (e) { return 0; }
  }
  /** Ziehen oder Schließen aufräumen (Klassen, Lage, Abdunklung). */
  function blattRuhe() {
    const b = S.el('blatt');
    b.classList.remove('geht', 'zieht');
    b.style.transform = '';
    b.style.removeProperty('--dunkel');
  }
  S.blattZeigen = function (titel, inhalt, zurueck, gross) {
    const b = S.el('blatt');
    if (!b || typeof b.showModal !== 'function') return false;
    // `gross === true` (Blätter mit vielen Zahlen): auf breiten Bildschirmen breit, dort stehen die Blöcke in zwei Spalten (style.css)
    b.classList.toggle('gross', gross === true);
    S.el('blatt-titel').textContent = titel;
    S.fuellen(S.el('blatt-inhalt'), inhalt); // verschachtelte Listen flach, null fällt weg
    blattZurueck = typeof zurueck === 'function' ? zurueck : null;
    const gingGerade = b.classList.contains('geht'); // wurde gerade geschlossen: wieder hochfahren statt zumachen
    if (!b.open || gingGerade) {
      blattRuhe();
      if (!b.open) {
        blattVon = document.activeElement;
        b.showModal();
      }
      blattBewegen('100%', '0px', 460, BLATT_KURVE);
    }
    S.el('blatt-inhalt').scrollTop = 0;
    S.el('blatt-titel').focus(); // Titel statt ✕: Vorleseprogramme lesen den Namen, es erscheint kein Fokusring
    return true;
  };
  /**
   * Blatt schließen: fährt nach unten weg, dann erst ist es zu. `sofort === true`: ohne Bewegung (wenn der Aufrufer
   * gleich danach woanders hinspringt, z. B. zum Eintragen, oder beim Abmelden). `ab` = Pixel, um die das Blatt schon
   * nach unten gezogen ist (gesten.js); ohne Angabe von dort, wo es gerade steht.
   */
  S.blattSchliessen = function (sofort, ab) {
    const b = S.el('blatt');
    if (!b || !b.open) return;
    const zu = () => { blattRuhe(); if (b.open) b.close(); };
    if (sofort === true || ruhig() || typeof b.animate !== 'function') {
      if (blattLauf) { blattLauf.onfinish = null; blattLauf.cancel(); blattLauf = null; }
      return zu();
    }
    if (b.classList.contains('geht')) return;
    b.classList.remove('zieht');
    b.classList.add('geht');
    blattBewegen((typeof ab === 'number' && ab > 0 ? ab : blattVersatz()) + 'px', '100%', 240, 'cubic-bezier(0.4, 0, 1, 1)', zu);
  };
  /**
   * Laufende Bewegung anhalten, weil der Finger das Blatt übernimmt (gesten.js). Rückgabe: um wie viele Pixel das
   * Blatt in diesem Moment nach unten versetzt ist, damit das Ziehen dort weitermacht und nichts springt.
   */
  S.blattHalten = function () {
    if (!blattLauf) return 0;
    const versatz = blattVersatz();
    blattLauf.onfinish = null;
    blattLauf.cancel();
    blattLauf = null;
    return versatz;
  };
  /** Nach dem Ziehen zurück an seinen Platz federn (`ab` = Pixel, um die es gezogen war). Ein begonnenes Schließen hat Vorrang. */
  S.blattZurueckFedern = function (ab) {
    const b = S.el('blatt');
    if (!b || !b.open || b.classList.contains('geht')) return;
    blattRuhe();
    blattBewegen((ab > 0 ? ab : 0) + 'px', '0px', 340, BLATT_KURVE);
  };
  S.el('blatt-zu').addEventListener('click', () => S.blattSchliessen());
  // Tipp auf den Rand (das <dialog> selbst, nicht sein Inhalt) schließt
  S.el('blatt').addEventListener('click', (ev) => { if (ev.target === S.el('blatt')) S.blattSchliessen(); });
  // Escape: nicht schlagartig zu, sondern wie alle anderen Wege mit Bewegung
  S.el('blatt').addEventListener('cancel', (ev) => { ev.preventDefault(); S.blattSchliessen(); });
  S.el('blatt').addEventListener('close', () => {
    blattRuhe();
    let v = blattVon;
    const ersatz = blattZurueck;
    blattVon = null;
    blattZurueck = null;
    if ((!v || !document.contains(v)) && ersatz) v = ersatz();
    if (v && document.contains(v) && typeof v.focus === 'function') v.focus({ preventScroll: true });
  });

  /** Text für Vorleseprogramme ansagen (VoiceOver). Erst leeren, dann kurz danach füllen, damit auch ein gleicher Text erneut kommt. */
  let ansageUhr = null;
  S.ansagen = function (text) {
    const ansage = S.el('ansage');
    clearTimeout(ansageUhr);
    ansage.textContent = '';
    ansageUhr = setTimeout(() => { ansage.textContent = text; }, 60);
  };

  /** Kurze Rückmeldung über der Leiste. `zusatz` = weitere Zeilen (z. B. Hinweise der Antwort). Antippen schließt. */
  let toastUhr = null;
  S.melden = function (text, fehler, zusatz) {
    const t = S.el('toast');
    clearTimeout(toastUhr);
    t.replaceChildren(S.icon(fehler ? 'fehler' : 'ok', 'toast-icon'),
      S.h('div', { class: 'toast-text' }, S.h('div', { text: text }),
        ...(zusatz || []).filter(Boolean).map((z) => S.h('div', { class: 'nebenzeile', text: z }))));
    t.classList.toggle('fehler-toast', !!fehler);
    t.hidden = false;
    S.haptik();
    S.ansagen((fehler ? 'Fehler: ' : '') + [text].concat((zusatz || []).filter(Boolean)).join('. '));
    toastUhr = setTimeout(() => { t.hidden = true; }, fehler || (zusatz && zusatz.length) ? 9000 : 4500);
  };
  S.meldenSchliessen = function () { clearTimeout(toastUhr); S.el('toast').hidden = true; };
  S.el('toast').addEventListener('click', S.meldenSchliessen);
})();
