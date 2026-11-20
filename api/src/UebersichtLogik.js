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
 * Tab Lexware-Kosten (seit v38, getValues, erste Zeile Kopf) → { zeilen, belege, offen, neuestes, aeltestes, fehler }
 * für die App: `zeilen` = [[Monat `JJJJ-MM`, Art (`Ware`, `Sonstiges` oder '' = noch ohne Kategorie), Kategorie, netto]],
 * je Monat, Art und Kategorie zusammengefasst (Belegdatum, netto auf den Cent, Summe 0 fällt weg), ohne stornierte Belege.
 * `belege` = Anzahl Belege, die zählen, `offen` = davon in Lexware noch zu prüfen (blank/unchecked), `neuestes` und
 * `aeltestes` (seit v39) = das neueste und älteste Belegdatum (oder null; auch Belege, die sich auf 0 aufheben, zählen:
 * daraus liest die App, welche Zeit der Tab abdeckt). Fehlt der Tab (`zeilen` null): null. Passt die Kopfzeile nicht:
 * null mit Hinweis. Leere Zeilen (das Skript überschreibt alte Reste mit leeren Zeilen) fallen still weg, Zeilen ohne
 * lesbares Datum oder ohne lesbaren Betrag mit einem Hinweis; seit v39 steht ihre Anzahl in `fehler` (die App zeigt den
 * Gewinn dann als unvollständig). Belege mit Datum nach `heute` (`JJJJ-MM-TT`, seit v39) zählen noch nicht.
 * Seit v40 dazu `lieferanten` = [[Jahr `JJJJ`, Lieferant ('' = ohne Namen), netto, Belege, davon Art `Ware` netto]]
 * je Jahr und Lieferant (Beträge auf den Cent, Summe 0 fällt weg, Belege = verschiedene Lexware-IDs), sortiert nach
 * Jahr und größtem Betrag. Nur wenn die Kopfzeile in B „Lieferant“ hat, sonst fehlt das Feld (ältere Tabs bleiben lesbar).
 */
function lexwareKostenLesen(zeilen, formatieren, hinweise, heute) {
  if (!Array.isArray(zeilen)) return null;
  const kopf = zeilen[0] || [];
  if (Object.keys(LK_KOPF).some((i) => String(kopf[i] || '').trim() !== LK_KOPF[i])) {
    hinweise.push('Tab ' + LEXWARE_KOSTEN_TAB + ': Kopfzeile passt nicht, Kosten und Gewinn fehlen in der App.');
    return null;
  }
  const leer = (w) => w === '' || w === null || w === undefined || (typeof w === 'string' && !w.trim());
  const mitLieferant = String(kopf[LK.LIEFERANT] || '').trim() === LK_LIEFERANT_KOPF;
  const summen = Object.create(null);
  const jeLieferant = Object.create(null);
  const belege = Object.create(null);
  const offen = Object.create(null);
  let neuestes = null;
  let aeltestes = null;
  let kaputt = 0;
  for (let i = 1; i < zeilen.length; i++) {
    const z = zeilen[i] || [];
    if ([LK.DATUM, LK.KATEGORIE, LK.ART, LK.NETTO, LK.STATUS, LK.ID].every((sp) => leer(z[sp]))) continue;
    const status = String(z[LK.STATUS] === undefined || z[LK.STATUS] === null ? '' : z[LK.STATUS]).trim();
    if (KOSTEN_STATUS_ZAEHLT_NICHT.test(status)) continue;
    const datum = zelleDatum(z[LK.DATUM], formatieren);
    const netto = betragLesen(z[LK.NETTO]);
    if (!datum || netto === null) { kaputt++; continue; }
    if (heute && datum > heute) continue; // Beleg aus der Zukunft: zählt erst an seinem Tag
    const artText = String(z[LK.ART] || '').trim().toLowerCase();
    const art = KOSTEN_ARTEN.find((a) => a.toLowerCase() === artText) || '';
    const kategorie = String(z[LK.KATEGORIE] || '').trim();
    const schluessel = datum.slice(0, 7) + '\u0000' + art + '\u0000' + kategorie;
    summen[schluessel] = (summen[schluessel] || 0) + netto;
    // Ein Beleg kann mehrere Zeilen haben (eine je Kategorie); ohne ID zählt die Zeile für sich
    const id = String(z[LK.ID] === undefined || z[LK.ID] === null ? '' : z[LK.ID]).trim() || 'Zeile ' + (i + 1);
    belege[id] = true;
    if (mitLieferant) {
      const lieferant = String(z[LK.LIEFERANT] === undefined || z[LK.LIEFERANT] === null ? '' : z[LK.LIEFERANT]).trim();
      const lk = datum.slice(0, 4) + '\u0000' + lieferant;
      const l = jeLieferant[lk] || (jeLieferant[lk] = { netto: 0, ware: 0, ids: Object.create(null) });
      l.netto += netto;
      if (art === 'Ware') l.ware += netto;
      l.ids[id] = true;
    }
    if (KOSTEN_STATUS_OFFEN.test(status)) offen[id] = true;
    if (!neuestes || datum > neuestes) neuestes = datum;
    if (!aeltestes || datum < aeltestes) aeltestes = datum;
  }
  if (kaputt) {
    hinweise.push('Tab ' + LEXWARE_KOSTEN_TAB + ': ' + kaputt + (kaputt === 1 ? ' Zeile' : ' Zeilen') + ' ohne lesbares Datum oder Betrag, zählt nicht.');
  }
  const aus = {
    zeilen: Object.keys(summen).sort().map((k) => k.split('\u0000').concat([runde_(summen[k], 2)])).filter((x) => x[3] !== 0),
    belege: Object.keys(belege).length,
    offen: Object.keys(offen).length,
    neuestes: neuestes,
    aeltestes: aeltestes,
    fehler: kaputt,
  };
  if (mitLieferant) {
    aus.lieferanten = Object.keys(jeLieferant).map((k) => {
      const l = jeLieferant[k];
      return k.split('\u0000').concat([runde_(l.netto, 2), Object.keys(l.ids).length, runde_(l.ware, 2)]);
    }).filter((x) => x[2] !== 0)
      .sort((a, b) => (a[0] !== b[0] ? (a[0] < b[0] ? -1 : 1) : b[2] - a[2] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)));
  }
  return aus;
}

/** Kundenname zum Abgleich mit Lexware: klein, ohne Akzente und Satzzeichen, ohne Rechtsform am Ende („Kultursphäre GmbH“ → „kultursphare“). */
function kundeVergleich_(name) {
  const t = String(name === undefined || name === null ? '' : name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss').replace(/\./g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  // Nur Rechtsformen am Ende fallen weg („Müller GmbH & Co. KG“ → „muller“), der übrige Name bleibt, wie er ist
  const w = t.split(' ').filter(Boolean);
  while (w.length > 1 && KUNDE_RECHTSFORMEN.indexOf(w[w.length - 1]) >= 0) w.pop();
  return w.join(' ');
}

/** Rechnungsnummer zum Abgleich: ohne Positions-Zusatz („#2“), ohne Leerzeichen, groß. */
function rechnungVergleich_(nr) {
  return rechnungOhnePosition(nr).replace(/\s+/g, '').toUpperCase();
}

/**
 * Tab Lexware-Rechnungen (seit v41, getValues, erste Zeile Kopf) → offene Forderungen für die App:
 * { offen, ueberfaellig, anzahl, kunden: [{ kunde, lexware, offen, ueberfaellig, belege }] }. Es zählen nur Belege mit
 * Status `open` oder `overdue` und einem offenen Betrag ≠ 0 (offene Gutschriften negativ, sie mindern `offen`).
 * Überfällig ist ein Beleg mit Status `overdue` oder mit „Fällig am“ vor `heute` (falls Lexware den Status nicht selbst
 * setzt), Gutschriften nie. `belege` = [[Belegnr., Datum, Fällig am ('' ohne), offen, `overdue`/`open`, Tage seit
 * Fälligkeit (negativ: noch nicht fällig, null ohne Fälligkeit)]], nach Fälligkeit. `kunde` = Name des Kunden wie im Tab
 * Verkäufe ('' = keiner passt, dann steht `lexware` da). Zuordnung ohne Raten, in dieser Reihenfolge: dieselbe
 * Rechnungsnummer steht in Verkäufe; eine andere Rechnung derselben Lexware-Kunden-ID steht dort (nur wenn alle zum
 * selben Kunden führen und keine ihrer Nummern mehrdeutig ist); der Name passt bis auf Groß/klein, Akzente, Satzzeichen
 * und Rechtsform am Ende (nur eindeutig).
 * Kunden mit Überfälligem zuerst. Fehlt der Tab: null. Passt die Kopfzeile nicht: null mit Hinweis.
 */
function forderungenLesen(zeilen, verkaeufe, formatieren, hinweise, heute) {
  if (!Array.isArray(zeilen)) return null;
  const kopf = zeilen[0] || [];
  if (Object.keys(LR_KOPF).some((i) => String(kopf[i] || '').trim() !== LR_KOPF[i])) {
    hinweise.push('Tab ' + LEXWARE_RECHNUNGEN_TAB + ': Kopfzeile passt nicht, offene Rechnungen fehlen in der App.');
    return null;
  }
  const text = (w) => String(w === undefined || w === null ? '' : w).trim();
  // Kunde je Rechnungsnummer und je Name aus Verkäufe; führen zwei Zeilen zu verschiedenen Kunden: mehrdeutig (false)
  const merken = (karte, k, v) => {
    if (!k) return;
    const s = kundeSchluessel(v.kunde);
    if (karte[k] === undefined) karte[k] = { kunde: v.kunde, schluessel: s };
    else if (karte[k] && karte[k].schluessel !== s) karte[k] = false;
    else if (karte[k]) karte[k].kunde = v.kunde; // gleicher Kunde: der jüngste Name
  };
  const nachNr = Object.create(null);
  const nachName = Object.create(null);
  (verkaeufe || []).forEach((v) => {
    if (!v.kunde) return;
    if (v.rechnung) merken(nachNr, rechnungVergleich_(v.rechnung), v);
    merken(nachName, kundeVergleich_(v.kunde), v);
  });
  const treffer = (karte, k) => (k && karte[k] ? karte[k] : null);
  // Kunden-ID → Kunde über alle Belege des Tabs (auch bezahlte), deren Nummer in Verkäufe steht
  const nachId = Object.create(null);
  const belege = [];
  let kaputt = 0;
  let fremd = 0;
  for (let i = 1; i < zeilen.length; i++) {
    const z = zeilen[i] || [];
    const nr = text(z[LR.NR]);
    const status = text(z[LR.STATUS]);
    if (!nr && !status && text(z[LR.OFFEN]) === '' && !text(z[LR.KUNDE])) continue; // leere Zeile über alten Resten
    const kid = text(z[LR.KUNDE_ID]);
    const nrSchluessel = rechnungVergleich_(nr);
    const t = treffer(nachNr, nrSchluessel);
    if (kid && t) merken(nachId, kid, t);
    else if (kid && nrSchluessel && nachNr[nrSchluessel] === false) nachId[kid] = false; // Nummer mehrdeutig: ID nicht sicher
    if (!RECHNUNG_STATUS_OFFEN.test(status)) continue;
    const offen = betragLesen(z[LR.OFFEN]);
    if (offen === null) { kaputt++; continue; }
    if (runde_(offen, 2) === 0) continue;
    const waehrung = text(z[LR.WAEHRUNG]).toUpperCase();
    if (waehrung && waehrung !== 'EUR') { fremd++; continue; }
    const faellig = zelleDatum(z[LR.FAELLIG], formatieren) || '';
    const tage = faellig && heute ? tageZwischen(faellig, heute) : null;
    belege.push({
      nr: nr, datum: zelleDatum(z[LR.DATUM], formatieren) || '', faellig: faellig, offen: runde_(offen, 2), tage: tage,
      ueber: offen > 0 && (RECHNUNG_STATUS_UEBERFAELLIG.test(status) || (tage !== null && tage > 0)),
      lexware: text(z[LR.KUNDE]), kid: kid, treffer: t,
    });
  }
  if (kaputt) hinweise.push('Tab ' + LEXWARE_RECHNUNGEN_TAB + ': ' + kaputt + (kaputt === 1 ? ' offene Rechnung' : ' offene Rechnungen') + ' ohne lesbaren Betrag, zählt nicht.');
  if (fremd) hinweise.push('Tab ' + LEXWARE_RECHNUNGEN_TAB + ': ' + fremd + (fremd === 1 ? ' offene Rechnung' : ' offene Rechnungen') + ' nicht in Euro, zählt nicht.');
  const gruppen = Object.create(null);
  const reihe = [];
  belege.forEach((b) => {
    const k = b.treffer || treffer(nachId, b.kid) || treffer(nachName, kundeVergleich_(b.lexware));
    const schluessel = k ? 'k:' + k.schluessel : b.kid ? 'id:' + b.kid : 'n:' + kundeSchluessel(b.lexware);
    let g = gruppen[schluessel];
    if (!g) {
      g = gruppen[schluessel] = { kunde: k ? k.kunde : '', lexware: b.lexware, offen: 0, ueberfaellig: 0, belege: [] };
      reihe.push(g);
    }
    if (!g.lexware) g.lexware = b.lexware;
    g.offen += b.offen;
    if (b.ueber) g.ueberfaellig += b.offen;
    g.belege.push(b);
  });
  // Nach Fälligkeit (ohne Fälligkeit, z. B. Gutschriften, nach dem Belegdatum ans Ende)
  const vorher = (a, b) => (!a.faellig !== !b.faellig ? (a.faellig ? -1 : 1)
    : a.faellig !== b.faellig ? (a.faellig < b.faellig ? -1 : 1) : a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0);
  const kunden = reihe.map((g) => ({
    kunde: g.kunde, lexware: g.lexware, offen: runde_(g.offen, 2), ueberfaellig: runde_(g.ueberfaellig, 2),
    belege: g.belege.sort(vorher).map((b) => [b.nr, b.datum, b.faellig, b.offen, b.ueber ? 'overdue' : 'open', b.tage]),
  })).sort((a, b) => b.ueberfaellig - a.ueberfaellig || b.offen - a.offen || ((a.kunde || a.lexware) < (b.kunde || b.lexware) ? -1 : 1));
  return {
    offen: runde_(belege.reduce((x, b) => x + b.offen, 0), 2),
    ueberfaellig: runde_(belege.reduce((x, b) => x + (b.ueber ? b.offen : 0), 0), 2),
    anzahl: belege.length,
    kunden: kunden,
  };
}

/**
 * Einnahmen netto aus dem Tab Lexware-Rechnungen (seit v42, für den Gewinn laut Lexware): `zeilen` ganzer Tab (oder null)
 * → { zeilen: [[Monat `JJJJ-MM`, netto]] (je Belegmonat, auf den Cent, Summe 0 fällt weg), belege, fehler } oder null,
 * wenn der Tab, seine Kopfzeile (die Übersicht meldet sie schon bei den offenen Rechnungen) oder Spalte M „netto (€)“
 * fehlt. Es zählen Rechnungen, Gutschriften und Einnahme-Belege mit Status außer `voided`, nur in Euro, bis `heute`;
 * Gutschriften immer negativ. Zeilen ohne lesbares Datum oder ohne lesbaren Betrag zählen nicht (`fehler`, Hinweis).
 */
function einnahmenLesen(zeilen, formatieren, hinweise, heute) {
  if (!Array.isArray(zeilen)) return null;
  const kopf = zeilen[0] || [];
  if (Object.keys(LR_KOPF).some((i) => String(kopf[i] || '').trim() !== LR_KOPF[i])) return null;
  if (String(kopf[LR.NETTO] || '').trim() !== LR_NETTO_KOPF) return null;
  const text = (w) => String(w === undefined || w === null ? '' : w).trim();
  const summen = Object.create(null);
  let belege = 0;
  let fehler = 0;
  let fremd = 0;
  for (let i = 1; i < zeilen.length; i++) {
    const z = zeilen[i] || [];
    if (!text(z[LR.NR]) && !text(z[LR.STATUS]) && !text(z[LR.NETTO]) && !text(z[LR.DATUM])) continue; // leere Zeile über alten Resten
    if (RECHNUNG_STATUS_STORNIERT.test(text(z[LR.STATUS]))) continue;
    const waehrung = text(z[LR.WAEHRUNG]).toUpperCase();
    if (waehrung && waehrung !== 'EUR') { fremd++; continue; }
    const datum = zelleDatum(z[LR.DATUM], formatieren);
    const netto = betragLesen(z[LR.NETTO]);
    if (!datum || netto === null) { fehler++; continue; }
    if (heute && datum > heute) continue;
    const monat = datum.slice(0, 7);
    summen[monat] = (summen[monat] || 0) + (RECHNUNG_TYP_GUTSCHRIFT.test(text(z[LR.TYP])) ? -Math.abs(netto) : netto);
    belege++;
  }
  if (fehler) hinweise.push('Tab ' + LEXWARE_RECHNUNGEN_TAB + ': ' + fehler + (fehler === 1 ? ' Beleg' : ' Belege') + ' ohne lesbares Datum oder Netto, fehlt im Gewinn.');
  if (fremd) hinweise.push('Tab ' + LEXWARE_RECHNUNGEN_TAB + ': ' + fremd + (fremd === 1 ? ' Beleg' : ' Belege') + ' nicht in Euro, fehlt im Gewinn.');
  return {
    zeilen: Object.keys(summen).sort().map((m) => [m, runde_(summen[m], 2)]).filter((x) => x[1] !== 0),
    belege: belege,
    fehler: fehler,
  };
}

/**
 * Tab Lexware-GuV (seit v42, ganzer Tab oder null) → [{ jahr, stand (`JJJJ-MM-TT` oder null), umsatz, ertraege,
 * material, aufwand, zinsen, ergebnis }] nach Jahr, Beträge auf den Cent (fehlende Positionen null). `ergebnis` muss
 * lesbar sein, sonst zählt die Zeile nicht (Hinweis); gibt es ein Jahr doppelt, gilt die untere Zeile (Hinweis).
 * Fehlt der Tab: null; passt die Kopfzeile nicht: null mit Hinweis.
 */
function lexwareGuvLesen(zeilen, formatieren, hinweise) {
  if (!Array.isArray(zeilen)) return null;
  const kopf = zeilen[0] || [];
  if (GUV_KOPF.some((t, i) => String(kopf[i] || '').trim() !== t)) {
    hinweise.push('Tab ' + LEXWARE_GUV_TAB + ': Kopfzeile passt nicht, der Gewinn kommt nur aus den Belegen.');
    return null;
  }
  const leer = (w) => w === '' || w === null || w === undefined || (typeof w === 'string' && !w.trim());
  const je = Object.create(null);
  for (let i = 1; i < zeilen.length; i++) {
    const z = zeilen[i] || [];
    if (z.slice(0, 8).every(leer)) continue;
    const jahr = zahlLesen(z[0]);
    const ergebnis = betragLesen(z[7]);
    if (jahr === null || Math.floor(jahr) !== jahr || jahr < 2000 || jahr > 2100 || ergebnis === null) {
      hinweise.push('Tab ' + LEXWARE_GUV_TAB + ' Zeile ' + (i + 1) + ': Jahr oder Ergebnis unlesbar, zählt nicht.');
      continue;
    }
    if (je[jahr]) hinweise.push('Tab ' + LEXWARE_GUV_TAB + ': ' + jahr + ' steht doppelt, es gilt Zeile ' + (i + 1) + '.');
    const zahl = (w) => { const x = leer(w) ? null : betragLesen(w); return x === null ? null : runde_(x, 2); };
    je[jahr] = { jahr: jahr, stand: zelleDatum(z[1], formatieren) || null, umsatz: zahl(z[2]), ertraege: zahl(z[3]), material: zahl(z[4]),
      aufwand: zahl(z[5]), zinsen: zahl(z[6]), ergebnis: runde_(ergebnis, 2) };
  }
  return Object.keys(je).map(Number).sort((a, b) => a - b).map((j) => je[j]);
}

/**
 * Bestand zum Jahresende je Jahr (seit v42): `euro` aus den Einstellungen ([{ jahr, euro }], Jahresabschluss),
 * `inventuren` aus lagerBerechnen ([{ jahr, flaschen, inventur, zaehltage }]) → [{ jahr, euro, flaschen, inventur, zaehltage }] nach Jahr,
 * fehlende Teile null.
 */
function jahresendeBauen(euro, inventuren) {
  const je = Object.create(null);
  const eintrag = (j) => je[j] || (je[j] = { jahr: j, euro: null, flaschen: null, inventur: null, zaehltage: null });
  (euro || []).forEach((x) => { eintrag(x.jahr).euro = x.euro; });
  (inventuren || []).forEach((x) => { const z = eintrag(x.jahr); z.flaschen = x.flaschen; z.inventur = x.inventur; z.zaehltage = x.zaehltage || null; });
  return Object.keys(je).map(Number).sort((a, b) => a - b).map((j) => je[j]);
}

/**
 * `roh`: { verkaeufe, lagerLog, einstellungen, abfuellungen } (2D-Arrays ganzer Tabs), `uebersicht`
 * (Übersicht!B8:B13 als 6×1), `lexwareKosten`, `lexwareRechnungen` und `lexwareGuv` (ganzer Tab oder null, wenn es ihn nicht gibt).
 * `formatieren(date)` → `JJJJ-MM-TT` in Europe/Berlin, `jetzt` = Date.
 * Antwort ohne ok/name: { stand, heute, kennzahlen, bestellung, lager, verkaeufe, abfuellungen, abgaenge, schwund, kosten,
 * forderungen, jahresende, einnahmen, guv, verkaufListe, hinweise }.
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
  const kosten = lexwareKostenLesen(roh.lexwareKosten, formatieren, hinweise, heute);
  const forderungen = forderungenLesen(roh.lexwareRechnungen, vk.verkaeufe, formatieren, hinweise, heute);
  const einnahmen = einnahmenLesen(roh.lexwareRechnungen, formatieren, hinweise, heute);
  const guv = lexwareGuvLesen(roh.lexwareGuv, formatieren, hinweise);
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
    // Offene Rechnungen aus Lexware (seit v41); null, solange es den Tab nicht gibt
    forderungen: forderungen,
    // Bestand zum Jahresende (seit v42, Lagerabgleich im Gewinn): je Jahr der Wert laut Jahresabschluss (Einstellung
    // „Bestand 31.12.JJJJ (€)“) und/oder die Flaschen laut Inventur zwischen 31.12. und 15.01.
    jahresende: jahresendeBauen(e.bestandJahresende, lager.jahresende),
    // Einnahmen netto laut Lexware je Belegmonat (seit v42, Gewinn laut Lexware); null ohne Spalte M „netto (€)“
    einnahmen: einnahmen,
    // GuV laut Lexware je Jahr (seit v42, Tab Lexware-GuV); null ohne den Tab
    guv: guv,
    verkaufListe: verkaufListeBauen(vk.verkaeufe, e, heute),
    hinweise: hinweise.length > MAX_HINWEISE
      ? hinweise.slice(0, MAX_HINWEISE - 1).concat(['… und ' + (hinweise.length - MAX_HINWEISE + 1) + ' weitere Hinweise.'])
      : hinweise,
  };
}
