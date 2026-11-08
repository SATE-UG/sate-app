// SATE-App: Zugangscode eingeben, dann Bestand und Reichweite aus der Apps-Script-Web-App holen.
// Der Code liegt nur in localStorage dieses Geräts und geht nur im POST-Body an die Web-App (nie in die URL).
(function () {
  'use strict';

  const H = window.SATE_HILFEN;
  const API_URL = (window.SATE_CONFIG || {}).apiUrl;
  const SPEICHER_SCHLUESSEL = 'sate.zugangscode';
  const ZEITLIMIT_MS = 25000;

  const el = (id) => document.getElementById(id);
  const anmelden = el('anmelden');
  const uebersicht = el('uebersicht');
  const form = el('code-form');
  const eingabe = el('code');
  const laden = el('laden');
  const fehler = el('fehler');
  const knoepfe = [el('code-senden'), el('neu-laden'), el('abmelden')];

  // Speicher (localStorage kann im privaten Modus fehlen oder werfen) --------------------------------------
  const speicher = {
    lesen() { try { return window.localStorage.getItem(SPEICHER_SCHLUESSEL) || ''; } catch (e) { return ''; } },
    schreiben(code) { try { window.localStorage.setItem(SPEICHER_SCHLUESSEL, code); return true; } catch (e) { return false; } },
    loeschen() { try { window.localStorage.removeItem(SPEICHER_SCHLUESSEL); } catch (e) { /* egal */ } },
  };
  // Falls localStorage nicht geht: Code nur für diese Sitzung im Speicher halten.
  let codeImSpeicher = '';

  // Anzeige -------------------------------------------------------------------------------------------------
  function zeige(bereich) {
    anmelden.hidden = bereich !== 'anmelden';
    uebersicht.hidden = bereich !== 'uebersicht';
    if (bereich === 'anmelden') eingabe.focus();
  }
  function meldung(text) {
    fehler.textContent = text || '';
    fehler.hidden = !text;
  }
  function beschaeftigt(ja) {
    laden.hidden = !ja;
    knoepfe.forEach((k) => { k.disabled = ja; });
  }
  function daten(d) {
    el('gruss').textContent = 'Hallo ' + d.name;
    el('bestand').textContent = H.zahlFormat(d.bestand, 0);
    el('reichweite').textContent = H.zahlFormat(d.reichweite, 1);
    el('zeit').textContent = H.zeitFormat(d.zeit);
  }

  // Schnittstelle -------------------------------------------------------------------------------------------
  async function anfrage(code, aktion) {
    if (!H.apiUrlGueltig(API_URL)) {
      return { art: 'fehler', meldung: 'Die App ist noch nicht fertig eingerichtet (Web-App-URL fehlt in config.js).' };
    }
    if (navigator.onLine === false) return { art: 'fehler', meldung: 'Kein Internet. Bitte Verbindung prüfen und neu laden.' };
    const abbruch = new AbortController();
    const uhr = setTimeout(() => abbruch.abort(), ZEITLIMIT_MS);
    try {
      // text/plain = „einfache“ Anfrage ohne CORS-Preflight (Apps Script beantwortet kein OPTIONS).
      const antwort = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ code: code, aktion: aktion }),
        redirect: 'follow',
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: abbruch.signal,
      });
      return H.antwortDeuten(antwort.status, await antwort.text());
    } catch (e) {
      if (e && e.name === 'AbortError') return { art: 'fehler', meldung: 'Die Schnittstelle antwortet nicht. Bitte später nochmal versuchen.' };
      return { art: 'fehler', meldung: 'Keine Verbindung zur Schnittstelle. Bitte Internet prüfen und neu laden.' };
    } finally {
      clearTimeout(uhr);
    }
  }

  /** Daten holen. `neu` = Code kommt gerade aus dem Formular (erst bei Erfolg speichern). */
  async function holen(code, neu) {
    meldung('');
    beschaeftigt(true);
    const e = await anfrage(code, 'ping');
    beschaeftigt(false);
    if (e.art === 'ok') {
      if (neu) {
        codeImSpeicher = code;
        if (!speicher.schreiben(code)) meldung('Hinweis: Der Code kann auf diesem Gerät nicht gespeichert werden (privater Modus?).');
        eingabe.value = '';
      }
      daten(e.daten);
      zeige('uebersicht');
    } else if (e.art === 'code') {
      speicher.loeschen();
      codeImSpeicher = '';
      zeige('anmelden');
      meldung(e.meldung);
    } else {
      meldung(e.meldung);
      // Gespeicherter Code bleibt bei Netzfehlern erhalten, dann einfach „Neu laden“.
      zeige(neu || !aktuellerCode() ? 'anmelden' : 'uebersicht');
    }
  }

  /** Code dieser Sitzung zuerst (falls Speichern/Löschen in localStorage scheitert), sonst der gespeicherte. */
  function aktuellerCode() {
    return codeImSpeicher || speicher.lesen();
  }

  // Ereignisse ----------------------------------------------------------------------------------------------
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const problem = H.codePruefen(eingabe.value);
    if (problem) { meldung(problem); return; }
    holen(H.codeBereinigen(eingabe.value), true);
  });
  el('neu-laden').addEventListener('click', () => {
    const code = aktuellerCode();
    if (code) holen(code, false);
    else zeige('anmelden');
  });
  el('abmelden').addEventListener('click', () => {
    speicher.loeschen();
    codeImSpeicher = '';
    meldung('');
    zeige('anmelden');
  });

  // Start ---------------------------------------------------------------------------------------------------
  const gespeichert = aktuellerCode();
  if (gespeichert) {
    zeige('uebersicht');
    holen(gespeichert, false);
  } else {
    zeige('anmelden');
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* ohne Offline-Hülle geht die App trotzdem */ });
    });
  }
})();
