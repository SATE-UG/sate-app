/**
 * Baut aus den Rohwerten der Tabs (getValues) die Antwort der Aktion `uebersicht` (rein, unter Node testbar).
 */

/** Hat der Tab Abfüllungen die freiwillige Spalte E „Kosten/Fl (€)“ (genau dieser Kopf in E1)? */
function abfuellungenMitKosten(zeilen) {
  return String((((zeilen && zeilen[0]) || [])[AB.KOSTEN]) || '').trim() === AB_KOSTEN_KOPF;
}

/**
 * Tab Abfüllungen (A Abfüllung, B Monat, C Flaschen, erste Zeile Kopf) → [{abfuellung, monat, flaschen}]. Mit der
 * freiwilligen Spalte E dazu `kostenProFlasche` (Herstellkosten in Euro; leer, unlesbar oder ≤ 0 → null). Ohne die
 * Spalte fehlt das Feld, dann zeigt die App keinen Rohertrag.
 */
function abfuellungenLesen(zeilen, formatieren) {
  const mitKosten = abfuellungenMitKosten(zeilen);
  return (zeilen || []).slice(1).filter((z) => z && String(z[0] || '').trim()).map((z) => {
    const a = { abfuellung: String(z[0]).trim(), monat: zelleMonat(z[1], formatieren), flaschen: betragLesen(z[2]) };
    if (mitKosten) {
      const k = betragLesen(z[AB.KOSTEN]);
      a.kostenProFlasche = k !== null && k > 0 ? k : null;
    }
    return a;
  });
}

/**
 * Tab Lexware-Kosten (seit v38, getValues, erste Zeile Kopf) → { zeilen, belege, offen, neuestes } für die App:
 * `zeilen` = [[Monat `JJJJ-MM`, Art (`Ware`, `Sonstiges` oder '' = noch ohne Kategorie), Kategorie, netto]], je Monat,
 * Art und Kategorie zusammengefasst (Belegdatum, netto auf den Cent, Summe 0 fällt weg), ohne stornierte Belege.
 * `belege` = Anzahl Belege, die zählen, `offen` = davon in Lexware noch zu prüfen (blank/unchecked), `neuestes` = das
 * neueste Belegdatum (oder null). Fehlt der Tab (`zeilen` null): null. Passt die Kopfzeile nicht: null mit Hinweis.
 * Leere Zeilen (das Skript überschreibt alte Reste mit leeren Zeilen) fallen still weg, Zeilen ohne lesbares Datum oder
 * ohne lesbaren Betrag mit einem Hinweis.
 */
function lexwareKostenLesen(zeilen, formatieren, hinweise) {
  if (!Array.isArray(zeilen)) return null;
  const kopf = zeilen[0] || [];
  if (Object.keys(LK_KOPF).some((i) => String(kopf[i] || '').trim() !== LK_KOPF[i])) {
    hinweise.push('Tab ' + LEXWARE_KOSTEN_TAB + ': Kopfzeile passt nicht, Kosten und Gewinn fehlen in der App.');
    return null;
  }
  const leer = (w) => w === '' || w === null || w === undefined || (typeof w === 'string' && !w.trim());
  const summen = Object.create(null);
  const belege = Object.create(null);
  const offen = Object.create(null);
  let neuestes = null;
  let kaputt = 0;
  for (let i = 1; i < zeilen.length; i++) {
    const z = zeilen[i] || [];
    if ([LK.DATUM, LK.KATEGORIE, LK.ART, LK.NETTO, LK.STATUS, LK.ID].every((sp) => leer(z[sp]))) continue;
    const status = String(z[LK.STATUS] === undefined || z[LK.STATUS] === null ? '' : z[LK.STATUS]).trim();
    if (KOSTEN_STATUS_ZAEHLT_NICHT.test(status)) continue;
    const datum = zelleDatum(z[LK.DATUM], formatieren);
    const netto = betragLesen(z[LK.NETTO]);
    if (!datum || netto === null) { kaputt++; continue; }
    const artText = String(z[LK.ART] || '').trim().toLowerCase();
    const art = KOSTEN_ARTEN.find((a) => a.toLowerCase() === artText) || '';
    const kategorie = String(z[LK.KATEGORIE] || '').trim();
    const schluessel = datum.slice(0, 7) + '\u0000' + art + '\u0000' + kategorie;
    summen[schluessel] = (summen[schluessel] || 0) + netto;
    // Ein Beleg kann mehrere Zeilen haben (eine je Kategorie); ohne ID zählt die Zeile für sich
    const id = String(z[LK.ID] === undefined || z[LK.ID] === null ? '' : z[LK.ID]).trim() || 'Zeile ' + (i + 1);
    belege[id] = true;
    if (KOSTEN_STATUS_OFFEN.test(status)) offen[id] = true;
    if (!neuestes || datum > neuestes) neuestes = datum;
  }
  if (kaputt) {
    hinweise.push('Tab ' + LEXWARE_KOSTEN_TAB + ': ' + kaputt + (kaputt === 1 ? ' Zeile' : ' Zeilen') + ' ohne lesbares Datum oder Betrag, zählt nicht.');
  }
  return {
    zeilen: Object.keys(summen).sort().map((k) => k.split('\u0000').concat([runde_(summen[k], 2)])).filter((x) => x[3] !== 0),
    belege: Object.keys(belege).length,
    offen: Object.keys(offen).length,
    neuestes: neuestes,
  };
}

/**
 * `roh`: { verkaeufe, lagerLog, einstellungen, abfuellungen } (2D-Arrays ganzer Tabs), `uebersicht`
 * (Übersicht!B8:B13 als 6×1) und `lexwareKosten` (ganzer Tab oder null, wenn es ihn nicht gibt).
 * `formatieren(date)` → `JJJJ-MM-TT` in Europe/Berlin, `jetzt` = Date.
 * Antwort ohne ok/name: { stand, heute, kennzahlen, bestellung, lager, verkaeufe, abfuellungen, abgaenge, schwund, kosten,
 * verkaufListe, hinweise }.
 */
function uebersichtBauen(roh, formatieren, jetzt) {
  const heute = formatieren(jetzt);
  const e = einstellungenLesen(roh.einstellungen);
  const vk = verkaeufeLesen(roh.verkaeufe, formatieren);
  const log = lagerLogLesen(roh.lagerLog, formatieren, e, heute);
  const lager = lagerBerechnen(log.buchungen, vk.verkaeufe, e, heute);
  const u = (roh.uebersicht || []).map((z) => zahlLesen(z && z[0]));
  const rechnerisch = u[2] === undefined ? null : u[2];
  const gesamt = gesamtBestand(lager.standorte, rechnerisch);
  const ab = abverkaufProMonat(vk.verkaeufe, heute, e.abverkaufMonate);
  const bestellung = bestellStatus(gesamt.wert, ab.genau, e, heute);

  const hinweise = [].concat(e.hinweise, vk.hinweise, log.hinweise, lager.hinweise);
  const kosten = lexwareKostenLesen(roh.lexwareKosten, formatieren, hinweise);
  if (gesamt.quelle === 'rechnerisch') {
    hinweise.unshift(gesamt.fehlen.length === lager.standorte.length
      ? 'Noch keine Inventur: Gesamtbestand ist der rechnerische aus der Übersicht (ohne Promo, Eigenverbrauch, Bruch).'
      : 'Noch keine Inventur bei ' + gesamt.fehlen.join(', ') + ': Gesamtbestand ist der rechnerische aus der Übersicht.');
  }
  const verkauft = runde_(vk.verkaeufe.reduce((x, v) => x + v.flaschen, 0), 2);
  if (u[1] !== null && u[1] !== undefined && u[1] !== verkauft) {
    hinweise.push('Verkauft laut Übersicht ' + u[1] + ', gelesen ' + verkauft + ' Flaschen.');
  }
  const kiste = (b) => (b === null ? null : runde_(b / e.flaschenProKiste, 1));
  const abfuellungen = abfuellungenLesen(roh.abfuellungen, formatieren);
  // Was ohne Verkauf wegging (für First in, First out in der App: braucht die Abfüllungen auf, Herstellkosten als Verlust):
  // gebuchte Promo, Eigenverbrauch und Bruch (ohne Stornos, bis heute) …
  const abgaenge = log.buchungen.filter((b) => ABGANG_ARTEN.indexOf(b.art) >= 0 && b.datum <= heute)
    .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.zeile - b.zeile));
  // … und Schwund: jede Nachzählung eines Lagers mit ihrer Abweichung an ihrem Tag. Sind alle Lager mindestens einmal
  // gezählt, dazu die Lücke vom Anfang (was seit der ersten Abfüllung fehlte, bevor gezählt wurde), mit leerem Standort
  // am Tag `gezaehltSeit`. Gerechnet mit den Regeln des Lagers (Lagerdatum, nichts aus der Zukunft, nur Verkäufe mit
  // bekanntem Standort), damit eine Rechnung, die im Lager an einem anderen Tag oder gar nicht zählt, nie als Schwund erscheint. Die Lücke bleibt gleich, solange nicht
  // rückwirkend gebucht wird: Verkäufe, Abgänge, Abfüllungen und Nachzählungen danach ändern beide Seiten gleich.
  const schwund = lager.schwund.map((x) => [x.datum, x.flaschen, x.standort]);
  if (gesamt.quelle === 'inventur' && lager.gezaehltSeit) {
    const abgefuellt = abfuellungen.reduce((x, a) => x + (a.flaschen || 0), 0);
    const anfang = runde_(abgefuellt - lager.verkauftBisHeute - abgaenge.reduce((x, b) => x + b.flaschen, 0) -
      lager.schwund.reduce((x, y) => x + y.flaschen, 0) - gesamt.wert, 2);
    if (anfang !== 0) schwund.push([lager.gezaehltSeit, anfang, '']);
  }
  schwund.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return {
    stand: jetzt.toISOString(),
    heute: heute,
    kennzahlen: {
      abgefuellt: u[0] === undefined ? null : u[0], verkauft: verkauft, bestandRechnerisch: rechnerisch,
      gesamtbestand: gesamt.wert, gesamtQuelle: gesamt.quelle, bestandGezaehlt: gesamt.summeBekannt,
      kisten: kiste(gesamt.wert), flaschenProKiste: e.flaschenProKiste, mindestbestand: e.mindestbestand,
      abverkaufProMonat: ab.wert, abverkaufVon: ab.von, abverkaufBis: ab.bis,
      // Gibt es im Tab Abfüllungen die Spalte „Kosten/Fl (€)“? Nur dann zeigt die App beim Eintragen das Kostenfeld.
      abfuellungKosten: abfuellungenMitKosten(roh.abfuellungen),
      // Seit wann ist jedes Lager mindestens einmal gezählt? (null, solange eines fehlt)
      gezaehltSeit: lager.gezaehltSeit,
    },
    bestellung: Object.assign(bestellung, { vorlaufMonate: e.vorlaufMonate, pufferWochen: e.pufferWochen }),
    lager: lager.standorte.map((s) => ({
      standort: s.standort, bestand: s.bestand, kisten: kiste(s.bestand), letzteInventur: s.letzteInventur, schwund: s.schwund,
      gezaehlt: s.gezaehlt, seitInventur: s.seitInventur, inventuren: s.inventuren,
    })),
    verkaeufe: verkaeufeAuswerten(vk.verkaeufe, heute),
    abfuellungen: abfuellungen,
    // Promo, Eigenverbrauch und Bruch als [Datum, Flaschen, Art], Schwund als [Datum, Flaschen, Standort ('' = Lücke vom Anfang)]
    abgaenge: abgaenge.map((b) => [b.datum, b.flaschen, b.art]),
    schwund: schwund,
    // Kosten aus Lexware (seit v38) für den vorläufigen Gewinn; null, solange es den Tab nicht gibt
    kosten: kosten,
    verkaufListe: verkaufListeBauen(vk.verkaeufe, e, heute),
    hinweise: hinweise.length > MAX_HINWEISE
      ? hinweise.slice(0, MAX_HINWEISE - 1).concat(['… und ' + (hinweise.length - MAX_HINWEISE + 1) + ' weitere Hinweise.'])
      : hinweise,
  };
}
