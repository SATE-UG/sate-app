// Reine Hilfsfunktionen der App (ohne DOM), im Browser als window.SATE_HILFEN, unter Node per require (Tests).
(function (wurzel) {
  'use strict';

  const CODE_LAENGE = 12;
  const PLATZHALTER_URL = 'HIER_WEB_APP_URL_EINTRAGEN';

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

  /** Zahl deutsch formatieren (8.041 bzw. 7,3). null/ungültig → „–“. */
  function zahlFormat(z, nachkomma) {
    if (typeof z !== 'number' || !isFinite(z)) return '–';
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: nachkomma || 0, maximumFractionDigits: nachkomma || 0 }).format(z);
  }

  /** ISO-Zeit → „8. November 2026, 16:05 Uhr“ (deutsche Zeit). Ungültig → „–“. */
  function zeitFormat(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '–';
    const tag = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }).format(d);
    const uhr = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(d);
    return tag + ', ' + uhr + ' Uhr';
  }

  /**
   * Antwort der Schnittstelle deuten. `text` = Antwort-Body.
   * Rückgabe: { art: 'ok', daten } | { art: 'code', meldung } (Code ungültig) | { art: 'fehler', meldung }.
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
    return { art: 'fehler', meldung: typeof o.fehler === 'string' && o.fehler ? o.fehler : 'Unbekannter Fehler.' };
  }

  const hilfen = { CODE_LAENGE, codeBereinigen, codePruefen, apiUrlGueltig, zahlFormat, zeitFormat, antwortDeuten };
  if (typeof module !== 'undefined' && module.exports) module.exports = hilfen;
  else wurzel.SATE_HILFEN = hilfen;
})(typeof window !== 'undefined' ? window : globalThis);
