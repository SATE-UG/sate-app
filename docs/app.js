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

  function standZeigen() {
    let t = '';
    if (Z.daten) t = (Z.frisch ? 'Stand: ' : 'Gespeicherter Stand von ') + H.zeitFormat(Z.daten.stand);
    if (Z.laedt) t += (t ? ' – ' : '') + 'lädt neu …';
    el('stand').textContent = t;
    el('neu-laden').disabled = Z.laedt;
  }

  S.renderAlle = function () {
    Object.keys(S.ansichten).forEach((n) => S.ansichten[n]());
    standZeigen();
  };

  function ansichtZeigen(name) {
    const a = ANSICHTEN.indexOf(name) >= 0 ? name : 'uebersicht';
    const wechsel = a !== Z.ansicht;
    Z.ansicht = a;
    ANSICHTEN.forEach((n) => {
      el('ansicht-' + n).hidden = n !== a;
      el('reiter-' + n).setAttribute('aria-selected', n === a ? 'true' : 'false');
      el('reiter-' + n).tabIndex = n === a ? 0 : -1;
    });
    S.speicher.schreiben(K.ansicht, a);
    if (wechsel) window.scrollTo(0, 0);
    if (a === 'lager' && (Z.verlaufVeraltet || !Z.verlauf) && !Z.verlaufLaedt) S.verlaufLaden();
  }

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

  /** Übersicht frisch laden. Bei Fehlern bleiben die gezeigten (ggf. gespeicherten) Daten stehen. */
  S.laden = async function () {
    if (Z.laedt) return;
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
      if (!Z.schreibt) S.laden();
      return standZeigen();
    }
    if (e.art === 'ok') {
      if (!S.datenSetzen(e.daten, e.daten.name)) meldung('Die Antwort der Schnittstelle ist unvollständig. Bitte Mark Bescheid geben.');
    } else if (e.art === 'code') {
      return S.codeUngueltig(e.meldung);
    } else {
      meldung(e.meldung + (Z.daten ? ' Gezeigt wird der gespeicherte Stand.' : ''));
    }
    S.renderAlle();
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

  /** Alles zum Konto auf dem Gerät und im Speicher vergessen. Rückgabe: Code wirklich gelöscht? */
  function vergessen() {
    const geloescht = S.speicher.loeschen(K.code);
    S.speicher.loeschen(K.daten);
    S.speicher.loeschen(K.ansicht);
    codeImSpeicher = '';
    abgemeldet = true;
    verlaufNr++;
    Object.assign(Z, { code: '', name: '', daten: null, frisch: false, laedt: false, verlauf: null, verlaufLaedt: false,
      verlaufFehler: '', verlaufVeraltet: true, balken: null, sitzung: Z.sitzung + 1 });
    meldung('');
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

  el('neu-laden').addEventListener('click', () => {
    S.laden();
    if (Z.ansicht === 'lager') S.verlaufLaden();
  });

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

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* ohne Offline-Hülle geht die App trotzdem */ });
    });
  }
})();
