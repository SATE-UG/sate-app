// SATE-App: Anmeldung per Zugangscode, Reiter unten, Laden der Übersicht (mit gespeichertem Stand für den Start).
// Der Code liegt nur in localStorage dieses Geräts und geht nur im POST-Body an die Web-App (nie in die URL).
(function () {
  'use strict';

  const S = window.SATE;
  const H = S.H;
  const Z = S.zustand;
  const K = S.SCHLUESSEL;
  // Reihenfolge wie die Reiter (seit v23: Start, Verkäufe, + Eintragen in der Mitte, Kunden, Lager)
  const ANSICHTEN = ['uebersicht', 'verkaeufe', 'eintragen', 'kunden', 'lager'];

  const el = S.el;
  const eingabe = el('code');
  const leiste = el('ansichten'); // waagerecht scrollende Leiste mit den vier Ansichten (CSS Scroll Snap)

  // Falls localStorage nicht geht: Code nur für diese Sitzung im Speicher halten.
  let codeImSpeicher = '';
  // Nach „Abmelden“ in dieser Sitzung nie auf einen alten gespeicherten Code zurückfallen.
  let abgemeldet = false;

  /** Code dieser Sitzung zuerst (falls Speichern/Löschen in localStorage scheitert), sonst der gespeicherte. */
  function aktuellerCode() {
    return codeImSpeicher || (abgemeldet ? '' : S.speicher.lesen(K.code));
  }

  // Anzeige -----------------------------------------------------------------------------------------------------

  function angemeldetZeigen(ja) {
    el('anmelden').hidden = ja;
    el('app').hidden = !ja;
    el('leiste').hidden = !ja;
    el('neu-laden').hidden = !ja;
    el('teilen').hidden = !ja;
    document.body.classList.toggle('mit-leiste', ja);
    document.documentElement.classList.toggle('mit-leiste', ja);
    untenPruefen();
    if (!ja) eingabe.focus();
  }

  /**
   * iOS 26.0 lässt bei Home-Bildschirm-Apps den sichtbaren Bereich teils oberhalb des unteren Bildschirmrands enden
   * (in Safari 26.1 von Apple behoben). Dann liegt die Home-Leiste schon in der Lücke darunter, und die Tab-Bar braucht
   * keinen eigenen Abstand dafür. Erkennen: Web-App vom Home-Bildschirm, hochkant, Inhalt reicht unter die Statusleiste
   * (Abstand oben > 0, also beginnt der Bereich oben am Bildschirmrand) und ist trotzdem mind. 20 px kürzer als der
   * Bildschirm. Die Lücke selbst hat die Farbe der Tab-Bar (CSS: html.mit-leiste).
   */
  function untenPruefen() {
    // Offene Tastatur verkleinert innerHeight: dann nicht neu bewerten (sonst Fehlalarm), Klasse bleibt wie sie war.
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    let luecke = false;
    try {
      const webApp = window.navigator.standalone === true ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
      const hochkant = window.innerHeight > window.innerWidth;
      const probe = el('safe-probe');
      const oben = probe ? parseFloat(getComputedStyle(probe).paddingTop) || 0 : 0;
      luecke = webApp && hochkant && oben > 0 && window.screen.height - window.innerHeight >= 20;
    } catch (e) { luecke = false; }
    document.documentElement.classList.toggle('luecke-unten', luecke);
  }
  window.addEventListener('resize', untenPruefen);
  window.addEventListener('orientationchange', untenPruefen);
  // Nach dem Schließen der Tastatur (Fokus weg) neu prüfen, falls in der Zwischenzeit gedreht wurde
  document.addEventListener('focusout', () => setTimeout(untenPruefen, 400));

  function meldung(text) {
    el('fehler').textContent = text || '';
    el('fehler').hidden = !text;
  }

  function anmeldeMeldung(text) {
    el('anmelden-fehler').textContent = text || '';
    el('anmelden-fehler').hidden = !text;
  }

  /**
   * Stand-Zeile oben: „Aktualisiert vor 5 Min.“ (läuft jede Minute mit, siehe unten). Bewusst keine Live-Region, sonst
   * würde VoiceOver jede Minute vorlesen; das Ergebnis eines Neuladens sagt S.aktualisieren an.
   */
  const STAND_ALT_MS = 60 * 60 * 1000;
  function standZeigen() {
    // Nur zeigen, wenn es etwas zu sagen gibt (Mark 2026-11-08: „Aktualisiert gerade eben“ braucht man nicht):
    // gespeicherter Stand (offline/noch nicht neu geladen) oder Daten älter als eine Stunde. Laden zeigt der Kreisel
    // im Neu-laden-Knopf.
    let t = '';
    if (Z.daten) {
      const alt = Date.now() - Date.parse(Z.daten.stand) > STAND_ALT_MS;
      const rel = H.relativZeit(Z.daten.stand) || H.zeitFormat(Z.daten.stand);
      const offline = navigator.onLine === false || Z.offline;
      if (!Z.frisch) t = 'Gespeicherter Stand, ' + rel;
      else if (offline) t = 'Offline, Stand ' + rel;
      else if (alt) t = 'Aktualisiert ' + rel;
      el('stand').title = 'Stand: ' + H.zeitFormat(Z.daten.stand);
    }
    el('stand').hidden = !t;
    el('stand').textContent = t;
    el('stand').classList.toggle('laedt', Z.laedt); // kleiner Kreisel vor dem Text (CSS)
    el('neu-laden').disabled = Z.laedt;
  }

  /** Schmales Banner „Offline – zeigt gespeicherten Stand“: kein Netz laut Gerät oder letzter Abruf ohne Verbindung. */
  S.offlineZeigen = function () {
    const offline = !!Z.code && (navigator.onLine === false || Z.offline);
    el('offline-text').textContent = Z.daten ? 'Offline, du siehst den gespeicherten Stand' : 'Offline, keine Verbindung';
    el('offline').hidden = !offline;
  };

  S.renderAlle = function () {
    Object.keys(S.ansichten).forEach((n) => S.ansichten[n]());
    if (typeof S.dashboardAuffrischen === 'function') S.dashboardAuffrischen(); // offenes Dashboard zeigt den neuen Stand
    standZeigen();
    S.offlineZeigen();
  };

  S.ANSICHTEN = ANSICHTEN;

  // Reiter und Ansichten ---------------------------------------------------------------------------------------
  // Die vier Ansichten liegen nebeneinander in #ansichten (natives waagerechtes Scrollen mit Einrasten). Wischen macht
  // allein der Browser; hier wird nur verfolgt, welche Ansicht gerade steht, und die Tab-Bar scrollt per scrollTo.

  const ruhig = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let zielAnsicht = null; // läuft gerade ein Scrollen per Tab-Tipp: dorthin (Tab-Bar springt solange nicht mit)
  let breite = 0;          // zuletzt gemessene Breite der Leiste (für Drehen/Größenänderung)

  /** Die helle Pille der Tab-Bar dorthin, wo die Ansichten gerade stehen (läuft beim Wischen und beim Tipp-Scrollen mit). */
  const pille = document.querySelector('.leiste-pille');
  function pilleSetzen() {
    const b = leiste.clientWidth;
    if (!pille || !b) return;
    const pos = Math.min(Math.max(leiste.scrollLeft / b, 0), ANSICHTEN.length - 1);
    pille.style.setProperty('--pos', pos.toFixed(3));
  }

  /**
   * Kleiner Titel im Kopf, sobald die große Überschrift der aktuellen Ansicht weggescrollt ist (wie „Large Title“ bei
   * iOS): Name des Reiters, blendet ein und aus.
   */
  const TITEL_AB_PX = 38;
  function kopfTitel() {
    const k = el('kopf-titel');
    const sek = el('ansicht-' + Z.ansicht);
    const zeigen = !!sek && !el('app').hidden && sek.scrollTop > TITEL_AB_PX;
    if (zeigen) k.textContent = el('reiter-' + Z.ansicht).textContent.trim();
    k.classList.toggle('sichtbar', zeigen);
  }
  S.kopfTitel = kopfTitel;

  /** Gewählten Reiter in der Tab-Bar markieren (nur Anzeige). */
  function reiterMarkieren(a) {
    ANSICHTEN.forEach((n) => {
      const r = el('reiter-' + n);
      const ja = n === a;
      if (r.getAttribute('aria-selected') !== String(ja)) r.setAttribute('aria-selected', ja ? 'true' : 'false');
      r.tabIndex = ja ? 0 : -1;
    });
  }

  /**
   * Ansicht `a` als aktuelle übernehmen: merken, die anderen Ansichten `inert` (nicht fokussierbar, für VoiceOver weg),
   * im Lager den Verlauf laden. `ansagen` = für VoiceOver ansagen (nur nach Wischen; beim Tippen sagt der Reiter es
   * selbst). Steht der Fokus in der alten Ansicht, geht er auf den neuen Reiter, damit er nicht im Nichts landet.
   */
  function ansichtUebernehmen(a, ansagen) {
    const wechsel = a !== Z.ansicht;
    const alt = el('ansicht-' + Z.ansicht);
    const fokusWeg = wechsel && alt && alt.contains(document.activeElement);
    Z.ansicht = a;
    reiterMarkieren(a);
    ANSICHTEN.forEach((n) => { el('ansicht-' + n).inert = n !== a; });
    kopfTitel();
    S.speicher.schreiben(K.ansicht, a);
    if (fokusWeg) el('reiter-' + a).focus({ preventScroll: true });
    if (wechsel && ansagen) {
      S.ansagen(el('reiter-' + a).textContent.trim() + ', Reiter ' + (ANSICHTEN.indexOf(a) + 1) + ' von ' + ANSICHTEN.length);
    }
    if (a === 'verkaeufe' && typeof S.diagrammeZeigen === 'function') S.diagrammeZeigen();
    // Lager zeigt den Verlauf, Eintragen „Zuletzt eingetragen“ und Start „Zuletzt passiert“ daraus
    if ((a === 'lager' || a === 'eintragen' || a === 'uebersicht') && (Z.verlaufVeraltet || !Z.verlauf) && !Z.verlaufLaedt) S.verlaufLaden();
  }

  /**
   * Zu einer Ansicht wechseln (Tab-Bar, Pfeiltasten, Karte „Letzter voller Monat“). Standard: weich hinscrollen
   * (bei „Bewegung reduzieren“ springen). `wie.sofort`: ohne Animation (Start, Anmelden), damit nichts sichtbar durchrutscht.
   */
  function ansichtZeigen(name, wie) {
    const a = ANSICHTEN.indexOf(name) >= 0 ? name : 'uebersicht';
    const sofort = !!(wie && wie.sofort) || ruhig();
    const links = ANSICHTEN.indexOf(a) * leiste.clientWidth;
    ansichtUebernehmen(a, false);
    if (sofort || Math.abs(leiste.scrollLeft - links) < 1) {
      zielAnsicht = null;
      leiste.scrollTo({ left: links, behavior: 'auto' });
    } else {
      zielAnsicht = a;
      leiste.scrollTo({ left: links, behavior: 'smooth' });
    }
    breite = leiste.clientWidth;
    pilleSetzen();
  }
  S.ansichtZeigen = ansichtZeigen;

  /** Aktuelle Ansicht nach oben scrollen (erneutes Tippen auf den gewählten Reiter, nach dem Speichern). */
  S.nachOben = function (name) {
    const sek = el('ansicht-' + (name || Z.ansicht));
    if (sek) sek.scrollTo({ top: 0, behavior: ruhig() ? 'auto' : 'smooth' });
  };

  /** Steht die Leiste auf einer Ansicht (Finger los, Einrasten fertig)? Dann diese übernehmen. */
  function leisteSteht() {
    clearTimeout(ruheUhr);
    if (finger > 0) return; // Finger liegt noch (auch wenn er gerade genau auf einer Ansicht pausiert): erst nach Loslassen
    const p = H.reiterPosition(leiste.scrollLeft, leiste.clientWidth, ANSICHTEN.length);
    if (!p || !p.eingerastet || el('app').hidden) return; // noch unterwegs oder Finger liegt noch: abwarten
    const a = ANSICHTEN[p.index];
    zielAnsicht = null;
    // Anders als gemerkt = gewischt (oder ein Tipp-Scrollen wurde vom Finger unterbrochen): übernehmen und ansagen
    if (a !== Z.ansicht) ansichtUebernehmen(a, true);
    else reiterMarkieren(a);
  }

  // Während des Scrollens markiert die Tab-Bar schon die Ansicht, die gerade überwiegend zu sehen ist (einmal pro Frame).
  // Übernommen wird sie erst, wenn sie steht und kein Finger mehr aufliegt: `scrollend`, sonst (Browser ohne scrollend)
  // 150 ms nach dem letzten Scroll-Ereignis bzw. nach dem Loslassen.
  let ruheUhr = null;
  let rahmen = 0;
  let finger = 0; // aufliegende Finger auf der Leiste (passive Listener, nur gezählt)
  const fingerZaehlen = (ev) => {
    finger = ev.touches ? ev.touches.length : 0;
    if (!finger) { clearTimeout(ruheUhr); ruheUhr = setTimeout(leisteSteht, 150); }
  };
  ['touchstart', 'touchend', 'touchcancel'].forEach((art) => leiste.addEventListener(art, fingerZaehlen, { passive: true }));
  leiste.addEventListener('scroll', () => {
    if (!rahmen) {
      rahmen = window.requestAnimationFrame(() => {
        rahmen = 0;
        pilleSetzen();
        const p = H.reiterPosition(leiste.scrollLeft, leiste.clientWidth, ANSICHTEN.length);
        if (p && zielAnsicht === null) reiterMarkieren(ANSICHTEN[p.index]);
      });
    }
    clearTimeout(ruheUhr);
    ruheUhr = setTimeout(leisteSteht, 150);
  }, { passive: true });
  leiste.addEventListener('scrollend', leisteSteht);

  // Drehen oder andere Breite: ohne Animation wieder genau auf die aktuelle Ansicht (nur wenn sich die Breite ändert,
  // nicht wenn oben ein Banner die Höhe ändert, sonst würde ein laufendes Wischen abgebrochen)
  function breiteGeaendert() {
    const b = leiste.clientWidth;
    if (!b || b === breite || el('app').hidden) return;
    breite = b;
    zielAnsicht = null;
    leiste.scrollTo({ left: ANSICHTEN.indexOf(Z.ansicht) * b, behavior: 'auto' });
    pilleSetzen();
  }
  if (typeof window.ResizeObserver === 'function') new window.ResizeObserver(breiteGeaendert).observe(leiste);
  else window.addEventListener('resize', breiteGeaendert);

  // Tipp auf den Kopf (Logo oder Titel, nicht die Knöpfe): aktuelle Ansicht nach oben, wie der Tipp auf die Statusleiste
  // bei iOS (die gehört hier dem System und erreicht die Ansichten nicht)
  document.querySelector('.kopf').addEventListener('click', (ev) => {
    if (el('app').hidden || (ev.target.closest && ev.target.closest('button'))) return;
    S.nachOben();
  });

  // Kleiner Titel im Kopf: folgt dem Scrollen der aktuellen Ansicht
  ANSICHTEN.forEach((n) => el('ansicht-' + n).addEventListener('scroll', () => { if (n === Z.ansicht) kopfTitel(); }, { passive: true }));

  // Fußzeile „Trink SATE!“ ans Ende jeder Ansicht (die der Seite ist angemeldet ausgeblendet)
  const fuss = document.querySelector('.seite > .fuss');
  ANSICHTEN.forEach((n) => el('ansicht-' + n).append(fuss.cloneNode(true)));
  // „Abmelden“ als kleiner Textlink ganz unten in der Übersicht, unter der Fußzeile
  el('ansicht-uebersicht').append(el('abmelden-zeile'));

  // Daten -------------------------------------------------------------------------------------------------------

  /**
   * Neue Übersicht übernehmen (aus `uebersicht`, einer Schreib-Antwort oder dem Gerätespeicher). Ältere als die
   * gezeigte werden ignoriert (z. B. wenn ein langsames Neuladen nach dem Speichern ankommt). Rückgabe: gültig?
   */
  S.datenSetzen = function (u, name, ausSpeicher) {
    if (!H.uebersichtGueltig(u)) return false;
    if (typeof name === 'string' && name) Z.name = name;
    if (!Z.daten || H.neuer(u.stand, Z.daten.stand)) {
      const d = Object.assign({}, u);
      delete d.ok;
      delete d.name;
      Z.daten = d;
      if (!ausSpeicher) S.speicher.schreiben(K.daten, JSON.stringify({ name: Z.name, daten: d }));
    }
    if (!ausSpeicher) Z.frisch = true;
    S.renderAlle();
    return true;
  };

  /**
   * Übersicht frisch laden. Bei Fehlern bleiben die gezeigten (ggf. gespeicherten) Daten stehen. Rückgabe: Promise, das
   * nach dem Laden erfüllt ist; läuft schon ein Laden in dieser Sitzung, dasselbe (für „Ziehen zum Aktualisieren“).
   */
  let laufend = null;
  let laufendSitzung = -1;
  S.laden = function () {
    if (laufend && laufendSitzung === Z.sitzung) return laufend;
    laufendSitzung = Z.sitzung;
    const p = laufend = ladenEinmal().finally(() => { if (laufend === p) laufend = null; });
    return p;
  };

  async function ladenEinmal() {
    const sitzung = Z.sitzung;
    const schreibNr = Z.schreibNr;
    Z.laedt = true;
    meldung('');
    standZeigen();
    if (!Z.daten) S.renderAlle();
    const e = await S.anfrage('uebersicht');
    if (sitzung !== Z.sitzung) return; // inzwischen abgemeldet: Antwort verwerfen
    Z.laedt = false;
    if (schreibNr !== Z.schreibNr || Z.schreibt) {
      // Während des Ladens wurde geschrieben: die Antwort kann ältere Bestände enthalten (der Server stempelt „stand“
      // erst nach dem Lesen). Die Schreib-Antwort bringt die frische Übersicht; ohne sie einmal neu laden.
      standZeigen();
      if (!Z.schreibt) return ladenEinmal();
      Z.ladenNachholen = true; // kommt mit der Schreib-Antwort keine Übersicht (Fehler), lädt S.schreiben nach
      return;
    }
    if (e.art === 'ok') {
      if (S.datenSetzen(e.daten, e.daten.name)) return; // datenSetzen hat schon alles neu gezeichnet
      meldung('Die Antwort der Schnittstelle ist unvollständig. Bitte Mark Bescheid geben.');
    } else if (e.art === 'code') {
      return S.codeUngueltig(e.meldung);
    } else if (!(e.offline && Z.daten)) {
      // Ohne Verbindung, aber mit gespeichertem Stand sagt das Offline-Banner schon alles
      meldung(e.meldung + (Z.daten ? ' Gezeigt wird der gespeicherte Stand.' : ''));
    }
    S.renderAlle();
  }

  /**
   * Wie der Neu-laden-Knopf (auch für „Ziehen zum Aktualisieren“): Übersicht und, im Lager, den Verlauf neu laden.
   * Sagt danach für VoiceOver an, ob es geklappt hat. Rückgabe: Promise, erfüllt nach dem Laden.
   */
  S.aktualisieren = function () {
    const sitzung = Z.sitzung;
    const teile = [S.laden()];
    if (Z.ansicht === 'lager' || Z.ansicht === 'eintragen' || Z.ansicht === 'uebersicht') teile.push(S.verlaufLaden());
    return Promise.all(teile).then(() => {
      if (sitzung !== Z.sitzung || !Z.code) return;
      if (!el('fehler').hidden) return S.ansagen(el('fehler').textContent);
      if (Z.offline) return S.ansagen('Offline, gezeigt wird der gespeicherte Stand.');
      if (Z.ansicht === 'lager' && Z.verlaufFehler) return S.ansagen('Aktualisiert, aber Verlauf nicht geladen: ' + Z.verlaufFehler);
      S.ansagen('Aktualisiert.');
    });
  };

  let verlaufNr = 0;
  S.verlaufLaden = async function () {
    const nr = ++verlaufNr;
    const schreibNr = Z.schreibNr;
    Z.verlaufLaedt = true;
    Z.verlaufFehler = '';
    S.ansichten.lager();
    if (typeof S.zuletztZeigen === 'function') S.zuletztZeigen();
    if (typeof S.aktivitaetZeigen === 'function') S.aktivitaetZeigen();
    const e = await S.anfrage('verlauf');
    if (nr !== verlaufNr || !Z.code) return; // inzwischen neu angestoßen oder abgemeldet
    Z.verlaufLaedt = false;
    if (e.art === 'ok' && Array.isArray(e.daten.eintraege)) {
      Z.verlauf = { eintraege: e.daten.eintraege, zeit: new Date().toISOString() };
      // Wurde währenddessen geschrieben, fehlt die neue Zeile evtl. noch: veraltet lassen und gleich nachladen
      Z.verlaufVeraltet = schreibNr !== Z.schreibNr || Z.schreibt;
      if (Z.verlaufVeraltet && !Z.schreibt && Z.ansicht === 'lager') return S.verlaufLaden();
    } else if (e.art === 'code') {
      return S.codeUngueltig(e.meldung);
    } else {
      Z.verlaufFehler = e.art === 'ok' ? 'Antwort unvollständig.' : e.meldung;
    }
    S.ansichten.lager();
    if (typeof S.zuletztZeigen === 'function') S.zuletztZeigen();
    if (typeof S.aktivitaetZeigen === 'function') S.aktivitaetZeigen();
  };

  /**
   * Alles zum Konto auf dem Gerät und im Speicher vergessen, auch den Buchungsentwurf (Formular und anfrageId),
   * offene Rückfragen und Rückmeldungen. Rückgabe: Code wirklich gelöscht?
   */
  function vergessen() {
    const geloescht = S.speicher.loeschen(K.code);
    S.speicher.loeschen(K.daten);
    S.speicher.loeschen(K.ansicht);
    S.speicher.loeschen(K.standort);
    codeImSpeicher = '';
    abgemeldet = true;
    verlaufNr++;
    Object.assign(Z, { code: '', name: '', daten: null, frisch: false, laedt: false, verlauf: null, verlaufLaedt: false,
      verlaufFehler: '', verlaufVeraltet: true, diagramm: 'flaschen', zeitraum: 'jahr', monatWahl: null, alleKunden: false, kundenZeitraum: 'jahr', kundenSuche: '', kundenKanal: '', kundenSortierung: 'menge', alleNachfassen: false, verlaufAlle: false, zuordnenOffen: false, offline: false, ladenNachholen: false,
      dashSeite: 'ueberblick', dashKennzahl: 'flaschen', dashJahr: undefined, dashKanal: '', dashNach: 'monat', dashAlle: false, sitzung: Z.sitzung + 1 });
    meldung('');
    S.frageSchliessen();
    S.blattSchliessen(true);
    S.meldenSchliessen();
    S.eintragenZuruecksetzen();
    S.renderAlle();
    return geloescht;
  }

  /** Server sagt „Code ungültig“ (gesperrt oder neu vergeben): abmelden und Grund zeigen. */
  S.codeUngueltig = function (text) {
    vergessen();
    abgemeldet = false; // ein neuer Code darf wieder gespeichert werden
    angemeldetZeigen(false);
    anmeldeMeldung(text);
  };

  // Anmeldung ---------------------------------------------------------------------------------------------------

  async function anmelden(code) {
    anmeldeMeldung('');
    el('code-senden').disabled = true;
    el('anmelden-laden').hidden = false;
    const e = await S.anfrage('uebersicht', {}, code);
    el('code-senden').disabled = false;
    el('anmelden-laden').hidden = true;
    if (e.art !== 'ok') return anmeldeMeldung(e.meldung);
    Z.code = code;
    codeImSpeicher = code;
    abgemeldet = false;
    eingabe.value = '';
    angemeldetZeigen(true);
    if (!S.speicher.schreiben(K.code, code)) meldung('Hinweis: Der Code kann auf diesem Gerät nicht gespeichert werden (privater Modus?).');
    if (!S.datenSetzen(e.daten, e.daten.name)) meldung('Die Antwort der Schnittstelle ist unvollständig. Bitte Mark Bescheid geben.');
    ansichtZeigen('uebersicht', { sofort: true });
  }

  // Ereignisse --------------------------------------------------------------------------------------------------

  el('code-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const problem = H.codePruefen(eingabe.value);
    if (problem) return anmeldeMeldung(problem);
    anmelden(H.codeBereinigen(eingabe.value));
  });

  el('neu-laden').addEventListener('click', () => { S.aktualisieren(); });

  /**
   * Stand teilen: kurzes Update (H.standText) ins iOS-Teilen-Menü (z. B. WhatsApp-Gruppe). Ohne Teilen-Menü in die
   * Zwischenablage. Abbrechen im Menü ist kein Fehler.
   */
  el('teilen').addEventListener('click', async () => {
    const a = typeof S.auswertung === 'function' ? S.auswertung() : null;
    if (!Z.daten || !a) return S.melden('Noch keine Daten zum Teilen.', true);
    const text = H.standText(Z.daten, a.jv, a.heute, a.prognose, { zeilen: a.zeilen, jvVorjahr: a.jvVorjahr });
    try {
      if (navigator.share) {
        await navigator.share({ text: text });
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return S.melden('Stand kopiert. Jetzt z. B. in WhatsApp einfügen.');
      }
      S.melden('Teilen geht auf diesem Gerät nicht.', true);
    } catch (e) {
      if (e && e.name === 'AbortError') return; // Teilen-Menü abgebrochen
      S.melden('Teilen hat nicht geklappt.', true);
    }
  });

  el('abmelden').addEventListener('click', async () => {
    if (!(await S.frage('Abmelden? Danach brauchst du deinen Zugangscode wieder.', 'Abmelden', 'Abbrechen', true))) return;
    const geloescht = vergessen();
    angemeldetZeigen(false);
    anmeldeMeldung(geloescht ? '' : 'Abgemeldet, aber der Code ließ sich auf diesem Gerät nicht löschen. ' +
      'Beim nächsten Start bist du wieder angemeldet. Abhilfe: in den iPhone-Einstellungen die Websitedaten löschen.');
  });

  // Reiter: Tippen (auf den schon gewählten: nach oben scrollen wie bei iOS), dazu Pfeiltasten wie bei Tabs üblich
  el('leiste').addEventListener('click', (ev) => {
    const knopf = ev.target.closest('button[data-ansicht]');
    if (!knopf) return;
    const p = H.reiterPosition(leiste.scrollLeft, leiste.clientWidth, ANSICHTEN.length);
    const stehtDa = p && p.eingerastet && ANSICHTEN[p.index] === knopf.dataset.ansicht;
    if (knopf.dataset.ansicht === Z.ansicht && stehtDa && zielAnsicht === null) S.nachOben();
    else ansichtZeigen(knopf.dataset.ansicht);
  });
  el('leiste').addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    const i = (ANSICHTEN.indexOf(Z.ansicht) + (ev.key === 'ArrowRight' ? 1 : ANSICHTEN.length - 1)) % ANSICHTEN.length;
    ansichtZeigen(ANSICHTEN[i]);
    el('reiter-' + ANSICHTEN[i]).focus();
  });

  // Stand-Zeit läuft mit, beim Zurückkehren in die App sofort auffrischen
  setInterval(() => { if (Z.daten && !document.hidden) standZeigen(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Z.daten) standZeigen(); });

  // Verbindung: Banner sofort zeigen; kommt das Netz wieder, gleich neu laden (Erfolg blendet das Banner aus)
  window.addEventListener('offline', () => S.offlineZeigen());
  window.addEventListener('online', () => {
    S.offlineZeigen();
    if (Z.code && !el('app').hidden) S.laden();
  });

  // Start: gespeicherten Stand sofort zeigen, dann frisch laden ------------------------------------------------
  const gespeichert = aktuellerCode();
  if (gespeichert) {
    Z.code = gespeichert;
    try {
      const alt = JSON.parse(S.speicher.lesen(K.daten) || 'null');
      if (alt && typeof alt === 'object') S.datenSetzen(alt.daten, alt.name, true);
    } catch (e) { /* kaputter Speicher: einfach frisch laden */ }
    angemeldetZeigen(true);
    S.renderAlle();
    ansichtZeigen(S.speicher.lesen(K.ansicht), { sofort: true });
    S.laden();
  } else {
    angemeldetZeigen(false);
    S.renderAlle();
  }
})();
