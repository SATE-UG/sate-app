/**
 * Baut aus den Rohwerten der Tabs (getValues) die Antwort der Aktion `uebersicht` (rein, unter Node testbar).
 */

/** Tab Abfüllungen (A Abfüllung, B Monat, C Flaschen, erste Zeile Kopf) → [{abfuellung, monat, flaschen}]. */
function abfuellungenLesen(zeilen, formatieren) {
  return (zeilen || []).slice(1).filter((z) => z && String(z[0] || '').trim()).map((z) => ({
    abfuellung: String(z[0]).trim(), monat: zelleMonat(z[1], formatieren), flaschen: betragLesen(z[2]),
  }));
}

/**
 * `roh`: { verkaeufe, lagerLog, einstellungen, abfuellungen } (2D-Arrays ganzer Tabs) und `uebersicht`
 * (Übersicht!B8:B13 als 6×1). `formatieren(date)` → `JJJJ-MM-TT` in Europe/Berlin, `jetzt` = Date.
 * Antwort ohne ok/name: { stand, heute, kennzahlen, bestellung, lager, verkaeufe, abfuellungen, verkaufListe, hinweise }.
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
  return {
    stand: jetzt.toISOString(),
    heute: heute,
    kennzahlen: {
      abgefuellt: u[0] === undefined ? null : u[0], verkauft: verkauft, bestandRechnerisch: rechnerisch,
      gesamtbestand: gesamt.wert, gesamtQuelle: gesamt.quelle, bestandGezaehlt: gesamt.summeBekannt,
      kisten: kiste(gesamt.wert), flaschenProKiste: e.flaschenProKiste, mindestbestand: e.mindestbestand,
      abverkaufProMonat: ab.wert, abverkaufVon: ab.von, abverkaufBis: ab.bis,
    },
    bestellung: Object.assign(bestellung, { vorlaufMonate: e.vorlaufMonate, pufferWochen: e.pufferWochen }),
    lager: lager.standorte.map((s) => ({
      standort: s.standort, bestand: s.bestand, kisten: kiste(s.bestand), letzteInventur: s.letzteInventur, schwund: s.schwund,
      gezaehlt: s.gezaehlt, seitInventur: s.seitInventur,
    })),
    verkaeufe: verkaeufeAuswerten(vk.verkaeufe, heute),
    abfuellungen: abfuellungenLesen(roh.abfuellungen, formatieren),
    verkaufListe: verkaufListeBauen(vk.verkaeufe, e, heute),
    hinweise: hinweise.length > MAX_HINWEISE
      ? hinweise.slice(0, MAX_HINWEISE - 1).concat(['… und ' + (hinweise.length - MAX_HINWEISE + 1) + ' weitere Hinweise.'])
      : hinweise,
  };
}
