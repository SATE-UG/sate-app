// Erzeugt App-Icons und Marken-Bilder der PWA aus den SATE-Originalen (weiß, transparent) mit macOS-Bordmitteln (JXA + AppKit).
// Die Originale liegen im Crawler-Repo (assets/) und werden nur gelesen.
// Aufruf im Repo-Root:
//   osascript -l JavaScript werkzeuge/bilder.js ~/GitHub/sate-eventcrawler-muc/assets "$PWD/docs"
// Danach VERSION in docs/sw.js hochzählen, sonst zeigen installierte iPhones die alten Bilder.
//
// Ergebnis (Größen für 3×-Retina, angezeigt wird ein Drittel davon):
//   icons/apple-touch-icon.png 180, icons/icon-192.png 192, icons/icon-512.png 512:
//     Strichmännchen weiß auf Schwarz mit Rand, deckend (iOS füllt Transparenz sonst unschön auf)
//   bilder/logo.png    Männchen + „SATE“ nebeneinander wie oben links auf den Slides, 120 px hoch
//   bilder/flasche.png SATE-Flasche mit Stern (Aufzählungszeichen), 108 px hoch
//   bilder/herz.png    Herz für „Trink SATE!“, 72 px hoch
//   bilder/pfeil.png   Doppelpfeil für „weiter“, 60 px hoch
ObjC.import('AppKit');

const QUELLEN = {
  maennchen: 'SATE_Männchen_weiß.png',
  schrift: 'SATE_Logo_weiß_schrift.png',
  flasche: 'Flasche_weiß_voll_Stern.png',
  herz: 'SATE Herz.png',
  pfeil: 'Doppelpfeil.png',
};

function run(argv) {
  const [quellordner, docs] = argv;
  if (!quellordner || !docs) throw new Error('Aufruf: bilder.js <Ordner mit Originalen> <docs-Ordner>');
  const b = {};
  Object.keys(QUELLEN).forEach((k) => { b[k] = laden(quellordner + '/' + QUELLEN[k]); });

  // Icons: Männchen mittig, 70 % der Breite, schwarzer deckender Grund
  [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]].forEach(([name, px]) => {
    schreiben(docs + '/icons/' + name, px, px, true, (zeichne) => {
      const breite = px * 0.70;
      const hoehe = breite / b.maennchen.verhaeltnis;
      zeichne(b.maennchen, (px - breite) / 2, (px - hoehe) / 2, breite, hoehe);
    });
  });

  // Logo wie auf den Slides (image_gen.py: LOGO_H 65, LOGO_GAP 14, Schriftzug 4 px höher)
  const H = 120;
  const mannB = H * b.maennchen.verhaeltnis;
  const luecke = H * 14 / 65;
  const schriftB = H * b.schrift.verhaeltnis;
  const hoch = H * 4 / 65;
  const logoB = Math.ceil(mannB + luecke + schriftB);
  schreiben(docs + '/bilder/logo.png', logoB, Math.ceil(H + hoch), false, (zeichne) => {
    zeichne(b.maennchen, 0, 0, mannB, H);
    zeichne(b.schrift, mannB + luecke, hoch, schriftB, H);
  });

  [['flasche', 108], ['herz', 72], ['pfeil', 60]].forEach(([k, h]) => {
    const w = Math.ceil(h * b[k].verhaeltnis);
    schreiben(docs + '/bilder/' + k + '.png', w, h, false, (zeichne) => zeichne(b[k], 0, 0, w, h));
  });
  return 'fertig';
}

/** Bild laden und den sichtbaren Bereich (Alpha > 0) bestimmen, wie _load_asset im Crawler (getbbox). */
function laden(pfad) {
  const bild = $.NSImage.alloc.initWithContentsOfFile(pfad);
  if (!bild || bild.isNil()) throw new Error('Bild fehlt: ' + pfad);
  // Probe in kleiner Auflösung abtasten (schneller), Ränder großzügig auf ganze Probe-Pixel runden.
  const P = 256;
  const probe = leinwand(P, P);
  mitKontext(probe, () => bild.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, P, P), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1));
  let x0 = P, y0 = P, x1 = -1, y1 = -1;
  for (let y = 0; y < P; y++) {
    for (let x = 0; x < P; x++) {
      if (probe.colorAtXY(x, y).alphaComponent > 0.02) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('Bild ist leer: ' + pfad);
  // colorAtXY zählt y von oben, das Zeichnen von unten
  const s = bild.size;
  const aus = $.NSMakeRect(x0 / P * s.width, (P - 1 - y1) / P * s.height, (x1 - x0 + 1) / P * s.width, (y1 - y0 + 1) / P * s.height);
  return { bild, aus, verhaeltnis: aus.size.width / aus.size.height };
}

function leinwand(w, h) {
  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
    $(), w, h, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
  rep.size = $.NSMakeSize(w, h);
  return rep;
}

function mitKontext(rep, f) {
  const ctx = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext(ctx);
  ctx.imageInterpolation = $.NSImageInterpolationHigh;
  f();
  ctx.flushGraphics;
  $.NSGraphicsContext.restoreGraphicsState;
}

/** PNG der Größe w×h schreiben. `deckend`: schwarzer Grund ohne Transparenz. y zählt von oben. */
function schreiben(pfad, w, h, deckend, inhalt) {
  const rep = leinwand(w, h);
  mitKontext(rep, () => {
    if (deckend) {
      $.NSColor.blackColor.setFill;
      $.NSBezierPath.fillRect($.NSMakeRect(0, 0, w, h));
    }
    inhalt((q, x, y, bw, bh) => q.bild.drawInRectFromRectOperationFraction(
      $.NSMakeRect(x, h - y - bh, bw, bh), q.aus, $.NSCompositingOperationSourceOver, 1));
  });
  const daten = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $());
  if (!daten.writeToFileAtomically(pfad, true)) throw new Error('Schreiben fehlgeschlagen: ' + pfad);
}
