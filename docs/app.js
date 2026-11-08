// SATE-App: Anmeldung per Zugangscode, Reiter unten, Laden der Übersicht (mit gespeichertem Stand für den Start).
// Der Code liegt nur in localStorage dieses Geräts und geht nur im POST-Body an die Web-App (nie in die URL).
(function () {
  'use strict';

  const S = window.SATE;
  const H = S.H;
  const Z = S.zustand;
  const K = S.SCHLUESSEL;
  const ANSICHTEN = ['uebersicht', 'verkaeufe', 'lager', 'eintragen'];

  const el = S.el;
  const eingabe = el('code');

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
    document.body.classList.toggle('mit-leiste', ja);
    if (!ja) eingabe.focus();
  }

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
  function standZeigen() {
    let t = '';
    if (Z.daten) {
      const rel = H.relativZeit(Z.daten.stand) || H.zeitFormat(Z.daten.stand);
      t = Z.frisch ? 'Aktualisiert ' + rel : 'Gespeicherter Stand · ' + rel;
      el('stand').title = 'Stand: ' + H.zeitFormat(Z.daten.stand);
    }
    if (Z.laedt) t += (t ? ' – ' : '') + 'lädt neu …';
    el('stand').textContent = t;
    el('stand').classList.toggle('laedt', Z.laedt); // kleiner Kreisel vor dem Text (CSS)
    el('neu-laden').disabled = Z.laedt;
  }

  /** Schmales Banner „Offline – zeigt gespeicherten Stand“: kein Netz laut Gerät oder letzter Abruf ohne Verbindung. */
  S.offlineZeigen = function () {
    const offline = !!Z.code && (navigator.onLine === false || Z.offline);
    el('offline-text').textContent = Z.daten ? 'Offline – zeigt gespeicherten Stand' : 'Offline – keine Verbindung';
    el('offline').hidden = !offline;
  };

  S.renderAlle = function () {
    Object.keys(S.ansichten).forEach((n) => S.ansichten[n]());
    standZeigen();
    S.offlineZeigen();
  };

  S.ANSICHTEN = ANSICHTEN;

  /**
   * Reiter wechseln (Tab-Bar, Pfeiltasten, Wischen). `wie` = { gewischt: +1 | -1 } lässt die neue Ansicht von der Seite
   * hereingleiten und sagt sie für VoiceOver an. Steht der Fokus in der alten (jetzt versteckten) Ansicht, geht er
   * auf den neuen Reiter, damit er nicht im Nichts landet.
   */
  function ansichtZeigen(name, wie) {
    const a = ANSICHTEN.indexOf(name) >= 0 ? name : 'uebersicht';
    const wechsel = a !== Z.ansicht;
    const alt = el('ansicht-' + Z.ansicht);
    const fokusWeg = wechsel && alt && alt.contains(document.activeElement);
    Z.ansicht = a;
    ANSICHTEN.forEach((n) => {
      const sek = el('ansicht-' + n);
      sek.hidden = n !== a;
      sek.classList.remove('rein-von-rechts', 'rein-von-links');
      sek.style.transform = '';
      sek.style.opacity = '';
      el('reiter-' + n).setAttribute('aria-selected', n === a ? 'true' : 'false');
      el('reiter-' + n).tabIndex = n === a ? 0 : -1;
    });
    S.speicher.schreiben(K.ansicht, a);
    if (wechsel) window.scrollTo(0, 0);
    if (wechsel && wie && wie.gewischt) {
      el('ansicht-' + a).classList.add(wie.gewischt > 0 ? 'rein-von-rechts' : 'rein-von-links');
      const r = el('reiter-' + a);
      S.ansagen(r.textContent.trim() + ', Reiter ' + (ANSICHTEN.indexOf(a) + 1) + ' von ' + ANSICHTEN.length);
    }
    if (fokusWeg) el('reiter-' + a).focus({ preventScroll: true });
    if (a === 'lager' && (Z.verlaufVeraltet || !Z.verlauf) && !Z.verlaufLaedt) S.verlaufLaden();
  }
  S.ansichtZeigen = ansichtZeigen;

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
      if (!S.datenSetzen(e.daten, e.daten.name)) meldung('Die Antwort der Schnittstelle ist unvollständig. Bitte Mark Bescheid geben.');
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
    if (Z.ansicht === 'lager') teile.push(S.verlaufLaden());
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
  };

  /**
   * Alles zum Konto auf dem Gerät und im Speicher vergessen, auch den Buchungsentwurf (Formular und anfrageId),
   * offene Rückfragen und Rückmeldungen. Rückgabe: Code wirklich gelöscht?
   */
  function vergessen() {
    const geloescht = S.speicher.loeschen(K.code);
    S.speicher.loeschen(K.daten);
    S.speicher.loeschen(K.ansicht);
    codeImSpeicher = '';
    abgemeldet = true;
    verlaufNr++;
    Object.assign(Z, { code: '', name: '', daten: null, frisch: false, laedt: false, verlauf: null, verlaufLaedt: false,
      verlaufFehler: '', verlaufVeraltet: true, balken: null, offline: false, ladenNachholen: false, sitzung: Z.sitzung + 1 });
    meldung('');
    S.frageSchliessen();
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
    ansichtZeigen('uebersicht');
  }

  // Ereignisse --------------------------------------------------------------------------------------------------

  el('code-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const problem = H.codePruefen(eingabe.value);
    if (problem) return anmeldeMeldung(problem);
    anmelden(H.codeBereinigen(eingabe.value));
  });

  el('neu-laden').addEventListener('click', () => { S.aktualisieren(); });

  el('abmelden').addEventListener('click', async () => {
    if (!(await S.frage('Abmelden? Danach brauchst du deinen Zugangscode wieder.', 'Abmelden', 'Abbrechen'))) return;
    const geloescht = vergessen();
    angemeldetZeigen(false);
    anmeldeMeldung(geloescht ? '' : 'Abgemeldet, aber der Code ließ sich auf diesem Gerät nicht löschen. ' +
      'Beim nächsten Start bist du wieder angemeldet. Abhilfe: in den iPhone-Einstellungen die Websitedaten löschen.');
  });

  // Reiter: Tippen, dazu Pfeiltasten wie bei Tabs üblich
  el('leiste').addEventListener('click', (ev) => {
    const knopf = ev.target.closest('button[data-ansicht]');
    if (knopf) ansichtZeigen(knopf.dataset.ansicht);
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
    ansichtZeigen(S.speicher.lesen(K.ansicht));
    S.laden();
  } else {
    angemeldetZeigen(false);
    S.renderAlle();
  }
})();
