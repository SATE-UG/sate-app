// Gesten: waagerecht wischen wechselt zum Nachbar-Reiter, ganz oben nach unten ziehen lädt neu.
// Alle Touch-Listener sind passiv (blockieren nie das Scrollen); entschieden wird erst nach ~10 px Bewegung, ob die
// Geste klar waagerecht (Wischen), nach unten an der Oberkante (Ziehen) oder etwas anderes ist (dann bleibt alles
// dem Browser). Kein Wischen ab Eingabefeldern, Auswahllisten, Diagramm, waagerecht scrollbaren Bereichen, Rückfrage
// oder Hinweis und in den ersten 20 px am linken Rand (iOS-Zurück-Geste).
(function () {
  'use strict';

  const S = window.SATE;
  const H = S.H;
  const Z = S.zustand;

  const RAND_PX = 20;          // Start so nah am linken Rand: iOS-Zurück-Geste, nicht unsere
  const RICHTUNG_PX = 10;      // ab so viel Bewegung wird die Richtung festgelegt
  const FOLGEN = 0.35;         // Inhalt folgt dem Finger beim Wischen nur leicht
  const ZIEH_SCHWELLE_PX = 70; // ab so weit (nach dem Gummiband) lädt Loslassen neu
  const ZIEH_HALTEN_PX = 56;   // so weit bleibt der Inhalt unten, solange geladen wird
  const ZIEH_MIN_MS = 500;     // Kreisel mindestens so lange zeigen (sonst flackert es)

  const seite = document.querySelector('.seite');
  const zeiger = S.el('ziehen');

  let g = null;          // laufende Geste
  let ziehLaedt = false; // nach „Ziehen“ läuft gerade das Neuladen

  const ruhig = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const istFeld = (e) => !!(e && e.closest && e.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])'));

  function waagerechtScrollbar(e) {
    for (let x = e; x && x.nodeType === 1 && x !== document.body; x = x.parentElement) {
      if (x.scrollWidth > x.clientWidth + 1) {
        const o = window.getComputedStyle(x).overflowX;
        if (o === 'auto' || o === 'scroll') return true;
      }
    }
    return false;
  }

  /** Geste gar nicht beachten? (abgemeldet, Rückfrage offen, Tastatur offen, Start auf Feld, Diagramm oder Hinweis) */
  function gesperrt(ziel) {
    if (S.el('app').hidden || !Z.code) return true;
    const d = S.el('dialog');
    if (d && d.open) return true;
    if (istFeld(document.activeElement)) return true; // Eingabe läuft (Tastatur offen)
    if (!ziel || !ziel.closest) return true;
    return istFeld(ziel) || !!ziel.closest('.diagramm, #toast, #dialog, [data-kein-wischen]');
  }

  const ansicht = () => S.el('ansicht-' + Z.ansicht);

  // Darstellung -------------------------------------------------------------------------------------------------

  function wischenZeigen(dx) {
    const sek = ansicht();
    if (!sek || ruhig()) return;
    const nb = H.nachbar(S.ANSICHTEN, Z.ansicht, dx < 0 ? 1 : -1);
    sek.classList.remove('feder');
    const weg = nb ? dx * FOLGEN : 0; // am Rand bewegt sich nichts
    sek.style.transform = weg ? 'translate3d(' + weg + 'px, 0, 0)' : '';
    sek.style.opacity = weg ? String(1 - Math.min(Math.abs(dx) / window.innerWidth, 1) * 0.35) : '';
  }

  function wischenZurueck() {
    const sek = ansicht();
    if (!sek) return;
    sek.classList.add('feder');
    sek.style.transform = '';
    sek.style.opacity = '';
  }

  function ziehenZeigen(weg, mitFeder) {
    seite.classList.toggle('feder', !!mitFeder);
    zeiger.classList.toggle('feder', !!mitFeder);
    seite.style.transform = weg > 0 && !ruhig() ? 'translate3d(0, ' + weg + 'px, 0)' : '';
    zeiger.hidden = !(weg > 0) && !ziehLaedt;
    zeiger.style.opacity = String(ziehLaedt ? 1 : Math.min(weg / ZIEH_SCHWELLE_PX, 1));
    zeiger.style.transform = 'translate3d(0, ' + Math.max(weg / 2 - 18, -18) + 'px, 0)';
    zeiger.style.setProperty('--drehung', Math.round(Math.min(weg / ZIEH_SCHWELLE_PX, 1) * 180) + 'deg');
    zeiger.classList.toggle('bereit', weg >= ZIEH_SCHWELLE_PX);
    zeiger.classList.toggle('laedt-ring', ziehLaedt);
  }

  function ziehenZurueck() {
    ziehenZeigen(0, true);
    zeiger.hidden = true;
  }

  async function ziehenLaden() {
    ziehLaedt = true;
    ziehenZeigen(ZIEH_HALTEN_PX, true);
    const start = Date.now();
    try {
      await S.aktualisieren();
    } finally {
      const rest = ZIEH_MIN_MS - (Date.now() - start);
      if (rest > 0) await new Promise((f) => setTimeout(f, rest));
      ziehLaedt = false;
      ziehenZurueck();
    }
  }

  // Ereignisse (alle passiv) ------------------------------------------------------------------------------------

  function abbrechen() {
    if (!g) return;
    if (g.art === 'wischen') wischenZurueck();
    if (g.art === 'ziehen' && !ziehLaedt) ziehenZurueck();
    g = null;
  }

  document.addEventListener('touchstart', (ev) => {
    if (g) abbrechen();
    if (ev.touches.length !== 1 || gesperrt(ev.target)) return;
    const t = ev.touches[0];
    g = {
      x0: t.clientX, y0: t.clientY, t0: Date.now(), art: '', dx: 0, dy: 0,
      wischOk: t.clientX >= RAND_PX && !waagerechtScrollbar(ev.target),
      ziehOk: window.scrollY <= 0 && !ziehLaedt,
    };
  }, { passive: true });

  document.addEventListener('touchmove', (ev) => {
    if (!g) return;
    if (ev.touches.length !== 1) return abbrechen(); // zweiter Finger (Zoomen): nichts tun
    const t = ev.touches[0];
    g.dx = t.clientX - g.x0;
    g.dy = t.clientY - g.y0;
    const ax = Math.abs(g.dx);
    const ay = Math.abs(g.dy);
    if (!g.art) {
      if (Math.max(ax, ay) < RICHTUNG_PX) return;
      if (g.wischOk && ax > 1.5 * ay) g.art = 'wischen';
      else if (g.ziehOk && g.dy > 0 && ay > ax && window.scrollY <= 0) g.art = 'ziehen';
      else g.art = 'aus'; // normales Scrollen o. Ä.: ab jetzt nicht mehr einmischen
    }
    if (g.art === 'wischen') wischenZeigen(g.dx);
    else if (g.art === 'ziehen') {
      if (window.scrollY > 0) { ziehenZurueck(); g.art = 'aus'; return; }
      ziehenZeigen(H.gummiband(g.dy), false);
    }
  }, { passive: true });

  document.addEventListener('touchend', (ev) => {
    if (!g) return;
    const x = g;
    g = null;
    const t = ev.changedTouches && ev.changedTouches[0];
    if (t) { x.dx = t.clientX - x.x0; x.dy = t.clientY - x.y0; }
    if (x.art === 'wischen') {
      const r = H.wischRichtung({ dx: x.dx, dy: x.dy, ms: Date.now() - x.t0, breite: window.innerWidth });
      const nb = r ? H.nachbar(S.ANSICHTEN, Z.ansicht, r) : null;
      if (nb) S.ansichtZeigen(nb, { gewischt: r }); // setzt Verschiebung der alten Ansicht zurück
      else wischenZurueck();
    } else if (x.art === 'ziehen') {
      if (H.gummiband(x.dy) >= ZIEH_SCHWELLE_PX && window.scrollY <= 0) ziehenLaden();
      else ziehenZurueck();
    }
  }, { passive: true });

  document.addEventListener('touchcancel', abbrechen, { passive: true });

  // Nach dem Hereingleiten die Klasse wieder entfernen (sonst gleitet sie beim nächsten Einblenden erneut)
  document.addEventListener('animationend', (ev) => {
    if (ev.target.classList) ev.target.classList.remove('rein-von-rechts', 'rein-von-links');
  });
})();
