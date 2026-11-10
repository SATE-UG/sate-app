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
 * `roh`: { verkaeufe, lagerLog, einstellungen, abfuellungen } (2D-Arrays ganzer Tabs) und `uebersicht`
 * (Übersicht!B8:B13 als 6×1). `formatieren(date)` → `JJJJ-MM-TT` in Europe/Berlin, `jetzt` = Date.
 * Antwort ohne ok/name: { stand, heute, kennzahlen, bestellung, lager, verkaeufe, abfuellungen, abgaenge, schwund, verkaufListe, hinweise }.
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
    verkaufListe: verkaufListeBauen(vk.verkaeufe, e, heute),
    hinweise: hinweise.length > MAX_HINWEISE
      ? hinweise.slice(0, MAX_HINWEISE - 1).concat(['… und ' + (hinweise.length - MAX_HINWEISE + 1) + ' weitere Hinweise.'])
      : hinweise,
  };
}
