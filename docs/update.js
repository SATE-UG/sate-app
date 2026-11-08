// Automatisches Update der App-Hülle (seit v9). Übernimmt ein neuer Service Worker (`controllerchange`), lädt die App
// von selbst neu, aber nur, wenn dabei nichts verloren geht: kein ungespeicherter Eintrag im Formular, keine offene
// Rückfrage, keine laufende Schreib-Aktion. Sonst erscheint oben das Banner „Neue Version – tippen zum Laden“.
// Gegen Endlosschleifen: pro Version höchstens einmal automatisch neu laden (Version fragt die App beim neuen Service
// Worker nach, gemerkt in sessionStorage). Beim Start und beim Zurückkehren in die App wird nach Updates gesucht.
(function () {
  'use strict';

  const S = window.SATE;
  const Z = S.zustand;
  const sw = navigator.serviceWorker;
  if (!sw) return;

  const SCHLUESSEL = 'sate.neuGeladenFuer';
  const MIN_ABSTAND_MS = 60000; // Update-Suche beim Zurückkehren höchstens einmal pro Minute
  const banner = S.el('update');

  let registrierung = null;
  let zuletztGesucht = 0;
  let wartend = ''; // Version, die bereitliegt, aber noch nicht geladen ist ('' = keine)
  // Ohne Controller beim Start ist dies die erste Installation: Seite ist schon aktuell, kein Neuladen nötig
  let hatteController = !!sw.controller;

  const sitzungLesen = () => { try { return window.sessionStorage.getItem(SCHLUESSEL) || ''; } catch (e) { return null; } };
  const sitzungSchreiben = (v) => { try { window.sessionStorage.setItem(SCHLUESSEL, v); return true; } catch (e) { return false; } };

  /** Gibt es Eingaben, die beim Neuladen verloren gingen? */
  function ungespeichert() {
    if (Z.schreibt) return true;
    const d = S.el('dialog');
    if (d && d.open) return true;
    if (typeof S.eintragenHatEingaben === 'function' && S.eintragenHatEingaben()) return true;
    const code = S.el('code');
    return !!(code && code.value.trim() && !S.el('anmelden').hidden);
  }

  /** Version beim neuen Service Worker erfragen (sw.js antwortet auf 'version'). Ohne Antwort nach 1,5 s: 'unbekannt'. */
  function versionFragen() {
    return new Promise((fertig) => {
      const ziel = sw.controller;
      if (!ziel || typeof MessageChannel === 'undefined') return fertig('unbekannt');
      const kanal = new MessageChannel();
      const uhr = setTimeout(() => { kanal.port1.close(); fertig('unbekannt'); }, 1500);
      kanal.port1.onmessage = (ev) => {
        clearTimeout(uhr);
        kanal.port1.close();
        fertig(typeof ev.data === 'string' && ev.data ? ev.data : 'unbekannt');
      };
      try { ziel.postMessage('version', [kanal.port2]); } catch (e) { clearTimeout(uhr); kanal.port1.close(); fertig('unbekannt'); }
    });
  }

  function bannerZeigen(ja) {
    if (ja && banner.hidden) S.ansagen('Neue Version der App bereit. Oben tippen zum Laden.'); // einmal für VoiceOver
    banner.hidden = !ja;
  }

  /** Neu laden, wenn es sicher geht und für diese Version noch nicht geschehen ist; sonst Banner. */
  function versuchen() {
    if (!wartend) return;
    if (ungespeichert() || sitzungLesen() === wartend) return bannerZeigen(true);
    if (!sitzungSchreiben(wartend)) return bannerZeigen(true); // ohne Merker kein automatisches Neuladen (Schleifen-Schutz)
    window.location.reload();
  }
  S.updateVersuchen = versuchen;

  sw.addEventListener('controllerchange', () => {
    if (!hatteController) { hatteController = true; return; }
    versionFragen().then((v) => {
      wartend = v;
      versuchen();
    });
  });

  banner.addEventListener('click', async () => {
    if (Z.schreibt) return S.melden('Moment, es wird gerade noch gespeichert.', true);
    if (typeof S.eintragenHatEingaben === 'function' && S.eintragenHatEingaben() &&
        !(await S.frage('Neue Version laden? Deine Eingaben im Formular gehen dabei verloren.', 'Jetzt laden', 'Abbrechen'))) return;
    sitzungSchreiben(wartend || 'unbekannt');
    window.location.reload();
  });

  function suchen() {
    if (!registrierung || Date.now() - zuletztGesucht < MIN_ABSTAND_MS) return;
    zuletztGesucht = Date.now();
    registrierung.update().catch(() => { /* offline: beim nächsten Mal */ });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    versuchen(); // liegt ein Update bereit und ist das Formular inzwischen leer, jetzt laden
    suchen();
  });

  window.addEventListener('load', () => {
    sw.register('sw.js').then((reg) => {
      registrierung = reg;
      suchen();
    }).catch(() => { /* ohne Offline-Hülle geht die App trotzdem */ });
  });
})();
