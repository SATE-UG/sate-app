// Gesten: Ziehen zum Aktualisieren (in einer Ansicht ganz oben nach unten ziehen lädt neu, wie der Neu-laden-Knopf)
// und kein Zoomen. Wischen zwischen den Reitern macht der Browser selbst (CSS Scroll Snap, siehe app.js und style.css).
// Alle Touch-Listener sind passiv (blockieren nie das Scrollen). Den Inhalt bewegt nur das native Gummiband von iOS;
// hier wird nur der Fingerweg gemessen und oben ein Pfeil gezeigt, der sich bis zur Schwelle dreht.
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
    zeiger.classList.toggle('bereit', weg >= ZIEH_SCHWELLE_PX);
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

  // Kein Zoomen (Mark, 2026-11-08): iOS ignoriert user-scalable=no im Viewport teils, die Safari-eigenen
  // Gesture-Ereignisse (Zwei-Finger-Zoom) lassen sich aber abfangen. Nur diese sind nicht passiv; Scrollen bleibt frei.
  // Doppeltipp-Zoom verhindert touch-action in style.css. Die Systemschriftgröße bleibt unberührt.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((art) => {
    document.addEventListener(art, (ev) => ev.preventDefault(), { passive: false });
  });
})();
