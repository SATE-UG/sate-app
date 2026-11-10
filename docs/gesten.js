// Gesten: Ziehen zum Aktualisieren (in einer Ansicht ganz oben nach unten ziehen lädt neu, wie der Neu-laden-Knopf),
// Blatt nach unten ziehen schließt es, sichtbares Drücken auf allen Bedienelementen, Haptik bei Auswahl, kein Zoomen.
// Wischen zwischen den Reitern macht der Browser selbst (CSS Scroll Snap, siehe app.js und style.css).
// Die Touch-Listener sind passiv (blockieren nie das Scrollen), außer beim Blatt: dort hält der Finger das Blatt fest.
// Beim Ziehen zum Aktualisieren bewegt den Inhalt nur das native Gummiband von iOS; hier wird nur der Fingerweg
// gemessen und oben ein Pfeil gezeigt, der sich bis zur Schwelle dreht.
(function () {
  'use strict';

  const S = window.SATE;
  const H = S.H;
  const Z = S.zustand;

  const ZIEH_SCHWELLE_PX = 70; // ab so weit (nach dem Gummiband) lädt Loslassen neu
  const ZIEH_HALTEN_PX = 56;   // so weit unten steht der Kreisel, solange geladen wird
  const ZIEH_MIN_MS = 500;     // Kreisel mindestens so lange zeigen (sonst flackert es)

  const leiste = S.el('ansichten');
  const zeiger = S.el('ziehen');

  let g = null;          // laufende Geste
  let ziehLaedt = false; // nach „Ziehen“ läuft gerade das Neuladen

  const istFeld = (e) => !!(e && e.closest && e.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])'));

  /** Ziehen gar nicht beachten? (abgemeldet, Rückfrage offen, Tastatur offen, Start auf Feld, Leiste nicht eingerastet) */
  function gesperrt(ziel) {
    if (S.el('app').hidden || !Z.code || ziehLaedt) return true;
    const d = S.el('dialog');
    if (d && d.open) return true;
    if (S.el('blatt').open) return true;
    if (istFeld(document.activeElement) || istFeld(ziel)) return true;
    const p = H.reiterPosition(leiste.scrollLeft, leiste.clientWidth, S.ANSICHTEN.length);
    return !p || !p.eingerastet; // gerade waagerecht unterwegs
  }

  function zeigen(weg, mitFeder) {
    zeiger.classList.toggle('feder', !!mitFeder);
    zeiger.hidden = !(weg > 0) && !ziehLaedt;
    zeiger.style.opacity = String(ziehLaedt ? 1 : Math.min(weg / ZIEH_SCHWELLE_PX, 1));
    zeiger.style.transform = 'translate3d(0, ' + Math.max(weg / 2 - 18, -18) + 'px, 0)';
    zeiger.style.setProperty('--drehung', Math.round(Math.min(weg / ZIEH_SCHWELLE_PX, 1) * 180) + 'deg');
    const bereit = weg >= ZIEH_SCHWELLE_PX;
    if (bereit && !zeiger.classList.contains('bereit') && !ziehLaedt && !mitFeder) S.haptik(); // Schwelle erreicht: ein Tippen
    zeiger.classList.toggle('bereit', bereit);
    zeiger.classList.toggle('laedt-ring', ziehLaedt);
  }

  function zurueck() {
    zeigen(0, true);
    zeiger.hidden = true;
  }

  async function laden() {
    ziehLaedt = true;
    zeigen(ZIEH_HALTEN_PX, true);
    const start = Date.now();
    try {
      await S.aktualisieren();
    } finally {
      const rest = ZIEH_MIN_MS - (Date.now() - start);
      if (rest > 0) await new Promise((f) => setTimeout(f, rest));
      ziehLaedt = false;
      zurueck();
    }
  }

  function abbrechen() {
    if (!g) return;
    if (g.art === 'ziehen' && !ziehLaedt) zurueck();
    g = null;
  }

  // Ereignisse (alle passiv) ------------------------------------------------------------------------------------

  leiste.addEventListener('touchstart', (ev) => {
    if (g) abbrechen();
    const sek = ev.target && ev.target.closest ? ev.target.closest('.ansicht') : null;
    if (ev.touches.length !== 1 || !sek || sek.scrollTop > 0 || gesperrt(ev.target)) return;
    const t = ev.touches[0];
    g = { sek: sek, x0: t.clientX, y0: t.clientY, dy: 0, art: '' };
  }, { passive: true });

  leiste.addEventListener('touchmove', (ev) => {
    if (!g) return;
    if (ev.touches.length !== 1) return abbrechen(); // zweiter Finger: nichts tun
    const t = ev.touches[0];
    g.dy = t.clientY - g.y0;
    if (!g.art) g.art = H.ziehRichtung(t.clientX - g.x0, g.dy);
    if (!g.art) return;
    if (g.art !== 'ziehen') { g = null; return; } // waagerecht oder nach oben: alles dem Browser überlassen
    if (g.sek.scrollTop > 0) return abbrechen(); // doch gescrollt
    zeigen(H.gummiband(g.dy), false);
  }, { passive: true });

  leiste.addEventListener('touchend', (ev) => {
    if (!g) return;
    const x = g;
    g = null;
    const t = ev.changedTouches && ev.changedTouches[0];
    if (t) x.dy = t.clientY - x.y0;
    if (x.art !== 'ziehen') return;
    if (H.gummiband(x.dy) >= ZIEH_SCHWELLE_PX && x.sek.scrollTop <= 0 && !ziehLaedt) laden();
    else zurueck();
  }, { passive: true });

  leiste.addEventListener('touchcancel', abbrechen, { passive: true });

  // Blatt: nach unten ziehen schließt (wie ein iOS-Sheet) --------------------------------------------------------
  // Am Kopf zieht der Finger immer das Blatt. Im Inhalt nur, wenn der ganz oben steht und der Finger nach unten geht;
  // sonst scrollt der Inhalt wie gewohnt. Loslassen: weit genug oder schnell genug nach unten → zu (H.blattSchliesst),
  // sonst federt es zurück. Ein zweiter Finger bricht das Ziehen ab, ein laufendes Schließen lässt sich nicht aufhalten.
  const blatt = S.el('blatt');
  const blattInhalt = S.el('blatt-inhalt');
  let z = null;                 // laufendes Ziehen am Blatt

  function blattLage(weg) {
    blatt.style.transform = 'translate3d(0, ' + weg + 'px, 0)';
    // Hintergrund hellt mit dem Weg auf (wirkt nur, wo ::backdrop Variablen vom Dialog erbt; sonst bleibt er dunkel)
    blatt.style.setProperty('--dunkel', String(Math.max(0.3, 1 - weg / (blatt.offsetHeight || 1))));
  }
  function blattLos(schliessenErlaubt, jetzt) {
    const x = z;
    z = null;
    if (!x || !x.zieht) return;
    if (blatt.classList.contains('geht')) return; // schließt schon (Escape, Knopf): nicht dazwischenfunken
    if (schliessenErlaubt && H.blattSchliesst(x.weg, H.ziehTempo(x.spur, jetzt))) {
      S.haptik();
      S.blattSchliessen(false, x.weg);
    } else {
      S.blattZurueckFedern(x.weg);
    }
  }
  blatt.addEventListener('touchstart', (ev) => {
    if (z && z.zieht) blattLos(false, ev.timeStamp); // zweiter Finger mitten im Ziehen: zurückfedern, nichts bleibt hängen
    z = null;
    if (ev.touches.length !== 1 || !blatt.open || blatt.classList.contains('geht') || ev.target === blatt || istFeld(ev.target)) return;
    const t = ev.touches[0];
    z = { x0: t.clientX, y0: t.clientY, weg: 0, zieht: false, imInhalt: blattInhalt.contains(ev.target), spur: [] };
  }, { passive: true });
  blatt.addEventListener('touchmove', (ev) => {
    if (!z) return;
    if (blatt.classList.contains('geht')) { z = null; return; }
    if (ev.touches.length !== 1) return blattLos(false, ev.timeStamp);
    const t = ev.touches[0];
    if (!z.zieht) {
      const dx = t.clientX - z.x0;
      const dy = t.clientY - z.y0;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      // Nur senkrecht nach unten; im Inhalt nur von ganz oben; und nur solange der Browser noch nicht selbst scrollt
      if (!(dy > 0 && dy > Math.abs(dx)) || (z.imInhalt && blattInhalt.scrollTop > 0) || !ev.cancelable) { z = null; return; }
      z.zieht = true;
      // Ab hier zählt der Weg. Fährt das Blatt gerade noch (auf oder zurück), macht der Finger an dieser Stelle weiter.
      z.y0 = t.clientY - S.blattHalten();
      blatt.classList.add('zieht');
    }
    if (ev.cancelable) ev.preventDefault();
    z.spur.push({ t: ev.timeStamp, y: t.clientY });
    if (z.spur.length > 12) z.spur.shift();
    z.weg = Math.max(0, t.clientY - z.y0);
    blattLage(z.weg);
  }, { passive: false });
  blatt.addEventListener('touchend', (ev) => blattLos(true, ev.timeStamp), { passive: true });
  blatt.addEventListener('touchcancel', (ev) => blattLos(false, ev.timeStamp), { passive: true });

  // Drücken: sichtbare Rückmeldung auf jedem Bedienelement ---------------------------------------------------------
  // `.gedrueckt` liegt an, solange ein Finger (oder die Maus) auf einem Knopf liegt; was das heißt, steht in style.css.
  // Ein kurzer Tipp zeigt es trotzdem mindestens DRUCK_MIN_MS lang. In scrollenden Bereichen kommt es wie bei iOS einen
  // Moment verzögert, damit beim Anscrollen nichts aufblitzt; bewegt sich der Finger, ist es sofort wieder weg.
  const DRUCK_ZIELE = 'button, label.art';
  const DRUCK_WARTEN_MS = 70;
  const DRUCK_MIN_MS = 140;
  const DRUCK_WEG_PX = 10;
  let druck = null; // { el, x, y, uhr, seit }

  function druckEnde(abbrechen) {
    const x = druck;
    druck = null;
    if (!x) return;
    clearTimeout(x.uhr);
    if (abbrechen) return x.el.classList.remove('gedrueckt');
    if (!x.seit) { x.el.classList.add('gedrueckt'); x.seit = Date.now(); } // kurzer Tipp: jetzt noch zeigen
    setTimeout(() => x.el.classList.remove('gedrueckt'), Math.max(0, DRUCK_MIN_MS - (Date.now() - x.seit)));
  }
  document.addEventListener('pointerdown', (ev) => {
    druckEnde(true);
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    const ziel = ev.target && ev.target.closest ? ev.target.closest(DRUCK_ZIELE) : null;
    if (!ziel || ziel.disabled || (ziel.control && ziel.control.disabled)) return;
    const d = { el: ziel, x: ev.clientX, y: ev.clientY, uhr: 0, seit: 0 };
    const an = () => { if (druck === d) { ziel.classList.add('gedrueckt'); d.seit = Date.now(); } };
    druck = d;
    if (ev.pointerType === 'touch' && ziel.closest('.ansicht, .blatt-inhalt')) d.uhr = setTimeout(an, DRUCK_WARTEN_MS);
    else an();
  }, { passive: true });
  document.addEventListener('pointermove', (ev) => {
    if (druck && Math.hypot(ev.clientX - druck.x, ev.clientY - druck.y) > DRUCK_WEG_PX) druckEnde(true);
  }, { passive: true });
  document.addEventListener('pointerup', () => druckEnde(false), { passive: true });
  document.addEventListener('pointercancel', () => druckEnde(true), { passive: true });

  // Haptik bei Auswahl (wie die Auswahl-Rückmeldung von iOS): Segment, Chip, Stepper, Art der Buchung, Monat blättern.
  // Ergebnis (gespeichert, Fehler) tippt in S.melden, die Schwelle beim Ziehen oben. Reiter und normale Knöpfe bleiben still.
  const HAPTIK_ZIELE = '.segment button, .chip, .schritt, .monat-schritte .rund';
  document.addEventListener('click', (ev) => {
    if (!ev.isTrusted) return; // nur echte Tipps
    const ziel = ev.target && ev.target.closest ? ev.target.closest(HAPTIK_ZIELE) : null;
    if (ziel && !ziel.disabled && ziel.getAttribute('aria-pressed') !== 'true') S.haptik();
  }, { capture: true, passive: true });
  document.addEventListener('change', (ev) => {
    if (ev.isTrusted && ev.target && ev.target.matches && ev.target.matches('.art input')) S.haptik();
  }, { passive: true });

  // Kein Zoomen (Mark, 2026-11-08): iOS ignoriert user-scalable=no im Viewport teils, die Safari-eigenen
  // Gesture-Ereignisse (Zwei-Finger-Zoom) lassen sich aber abfangen. Nur diese sind nicht passiv; Scrollen bleibt frei.
  // Doppeltipp-Zoom verhindert touch-action in style.css. Die Systemschriftgröße bleibt unberührt.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((art) => {
    document.addEventListener(art, (ev) => ev.preventDefault(), { passive: false });
  });
})();
