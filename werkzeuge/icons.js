// Erzeugt die vorläufigen App-Icons („SATE“ weiß auf dunklem Grund) mit macOS-Bordmitteln (JXA + AppKit).
// Aufruf im Repo-Root:  osascript -l JavaScript werkzeuge/icons.js "$PWD/docs/icons"
// Kommt das echte Logo, die drei PNGs einfach ersetzen (gleiche Namen und Größen) und VERSION in docs/sw.js hochzählen.
ObjC.import('AppKit');

function run(argv) {
  const ziel = argv[0];
  if (!ziel) throw new Error('Zielordner fehlt');
  const groessen = [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]];
  groessen.forEach(([name, px]) => icon(ziel + '/' + name, px));
  return 'fertig: ' + groessen.map((g) => g[0]).join(', ');
}

function icon(pfad, px) {
  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
    $(), px, px, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
  rep.size = $.NSMakeSize(px, px);
  const ctx = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext(ctx);

  // Vollflächig dunkel und deckend (iOS rundet die Ecken selbst ab). Der Kontext braucht RGBA, Alpha bleibt überall 1.
  $.NSColor.colorWithDeviceRedGreenBlueAlpha(0x1c / 255, 0x1c / 255, 0x1e / 255, 1).setFill;
  $.NSBezierPath.fillRect($.NSMakeRect(0, 0, px, px));

  const schrift = $.NSFont.boldSystemFontOfSize(px * 0.26);
  const attribute = $.NSMutableDictionary.alloc.init;
  attribute.setObjectForKey(schrift, $.NSFontAttributeName);
  attribute.setObjectForKey($.NSColor.whiteColor, $.NSForegroundColorAttributeName);
  const text = $.NSString.alloc.initWithString('SATE');
  // Mittig nach der Größe der Großbuchstaben (capHeight), nicht nach der Zeilenhöhe
  const breite = text.sizeWithAttributes(attribute).width;
  const unten = (px - schrift.capHeight) / 2;
  text.drawAtPointWithAttributes($.NSMakePoint((px - breite) / 2, unten + schrift.descender), attribute);

  ctx.flushGraphics;
  $.NSGraphicsContext.restoreGraphicsState;
  const daten = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $());
  if (!daten.writeToFileAtomically(pfad, true)) throw new Error('Schreiben fehlgeschlagen: ' + pfad);
}
