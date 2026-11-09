/**
 * Reine Verkaufs-Logik ohne Google-Dienste (unter Node testbar, siehe test/verkauf.test.js):
 * Tab Verkäufe lesen und auswerten (Monate, Kanäle, Top-Kunden). Datumshilfen stehen in LagerLogik.js.
 */

/** Kanal wie im Tab Übersicht (Groß/klein egal); Leeres oder Unbekanntes → „Sonstiges“. */
function kanalName(kanal) {
  const k = String(kanal || '').trim().toLowerCase();
  return KANAELE.find((x) => x.toLowerCase() === k) || KANAL_UNBEKANNT;
}

/** Schlüssel, unter dem gleich benannte Kunden zusammengefasst werden: getrimmt, Leerzeichen einfach, klein. */
function kundeSchluessel(kunde) {
  return String(kunde || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Tab Verkäufe (Zeilen A–L, erste Zeile Kopf) → [{zeile, monat, datum, kanal, kunde, flaschen, umsatz, standort, rechnung}].
 * monat = Rechnungsmonat aus A (sonst aus B), datum = B oder null (Altliste). Gutschriften bleiben negativ.
 * Zeilen ohne Flaschen fallen still weg, Zeilen ohne lesbaren Monat mit Hinweis.
 */
function verkaeufeLesen(zeilen, formatieren) {
  const kopf = (zeilen && zeilen[0]) || [];
  Object.keys(VK_KOPF).forEach((i) => {
    if (String(kopf[i] || '').trim() !== VK_KOPF[i]) throw new Error('Tab ' + VERKAEUFE_TAB + ': Spaltenkopf ' + VK_KOPF[i] + ' fehlt');
  });
  const verkaeufe = [];
  const hinweise = [];
  for (let i = 1; i < zeilen.length; i++) {
    const z = zeilen[i] || [];
    const flaschen = betragLesen(z[VK.FLASCHEN]);
    if (flaschen === null || flaschen === 0) {
      if (z[VK.FLASCHEN] !== '' && z[VK.FLASCHEN] !== undefined && z[VK.FLASCHEN] !== null && flaschen === null) {
        hinweise.push('Verkäufe Zeile ' + (i + 1) + ': Flaschen unlesbar, zählt nicht.');
      }
      continue;
    }
    const datum = zelleDatum(z[VK.DATUM], formatieren);
    const monat = zelleMonat(z[VK.MONAT], formatieren) || (datum ? datum.slice(0, 7) : null);
    if (!monat) { hinweise.push('Verkäufe Zeile ' + (i + 1) + ': kein Monat lesbar, zählt nicht.'); continue; }
    verkaeufe.push({
      zeile: i + 1, monat: monat, datum: datum, kanal: kanalName(z[VK.KANAL]), kunde: String(z[VK.KUNDE] || '').trim(),
      flaschen: flaschen, umsatz: betragLesen(z[VK.UMSATZ]) || 0, standort: String(z[VK.STANDORT] || '').trim(),
      rechnung: String(z[VK.RECHNUNG] === undefined || z[VK.RECHNUNG] === null ? '' : z[VK.RECHNUNG]).trim(),
    });
  }
  return { verkaeufe: verkaeufe, hinweise: hinweise };
}

/** Frühester Monat mit Verkäufen (nicht nach `jetzt`); ohne Verkäufe `jetzt`. */
function ersterMonat_(verkaeufe, jetzt) {
  let erster = jetzt;
  verkaeufe.forEach((v) => { if (v.monat < erster) erster = v.monat; });
  return erster;
}

/** Summe über Verkäufe in [von, bis] (Monate `JJJJ-MM`, beide inklusive). */
function zeitraumAuswerten_(verkaeufe, von, bis) {
  // Ohne Prototyp: Kundennamen wie „constructor“ oder „__proto__“ sind normale Schlüssel.
  const kanaele = Object.create(null);
  const kunden = Object.create(null);
  let flaschen = 0;
  let umsatz = 0;
  verkaeufe.forEach((v) => {
    if (v.monat < von || v.monat > bis) return;
    flaschen += v.flaschen;
    umsatz += v.umsatz;
    const k = kanaele[v.kanal] = kanaele[v.kanal] || { kanal: v.kanal, flaschen: 0, umsatz: 0 };
    k.flaschen += v.flaschen;
    k.umsatz += v.umsatz;
    const s = kundeSchluessel(v.kunde) || '(ohne Name)';
    const c = kunden[s] = kunden[s] || { namen: Object.create(null), flaschen: 0, umsatz: 0 };
    c.flaschen += v.flaschen;
    c.umsatz += v.umsatz;
    const n = v.kunde || '(ohne Name)';
    c.namen[n] = (c.namen[n] || 0) + 1;
  });
  const fertig = (x) => Object.assign(x, { flaschen: runde_(x.flaschen, 2), umsatz: runde_(x.umsatz, 2) });
  // Angezeigter Name: die häufigste Schreibweise, bei Gleichstand die alphabetisch erste.
  const name = (namen) => Object.keys(namen).sort((a, b) => namen[b] - namen[a] || (a < b ? -1 : a > b ? 1 : 0))[0];
  return {
    von: von, bis: bis, flaschen: runde_(flaschen, 2), umsatz: runde_(umsatz, 2),
    kanaele: KANAELE.filter((k) => kanaele[k]).map((k) => fertig(kanaele[k])),
    kunden: Object.keys(kunden).map((s) => fertig({ kunde: name(kunden[s].namen), flaschen: kunden[s].flaschen, umsatz: kunden[s].umsatz }))
      .sort((a, b) => b.flaschen - a.flaschen || b.umsatz - a.umsatz || (a.kunde < b.kunde ? -1 : 1)).slice(0, TOP_KUNDEN),
  };
}

/**
 * Regel 8: Flaschen und Umsatz pro Monat (letzte 13 Monate inkl. laufendem, auch leere Monate), dazu pro Kanal und
 * Top-Kunden für das laufende Jahr (Januar bis laufender Monat), das Vorjahr (Januar bis Dezember) und gesamt (erster
 * Monat mit Verkäufen bis laufender Monat). `letzte12` (12 volle Monate) bleibt für ältere App-Versionen in der Antwort.
 * `zeilen` (seit 2026-11-09): alle Verkäufe kompakt für Auswertungen in der App (Jahresvergleich, Kunden-Details), je
 * [Monat `JJJJ-MM`, Datum `JJJJ-MM-TT` oder '', Kanal, Kunde, Flaschen, Umsatz, Rechnung oder ''], nach Monat und Datum
 * sortiert.
 */
function verkaeufeAuswerten(verkaeufe, heute) {
  const jetzt = heute.slice(0, 7);
  const monate = [];
  for (let i = 12; i >= 0; i--) {
    const m = monatPlus(jetzt, -i);
    const z = zeitraumAuswerten_(verkaeufe, m, m);
    monate.push({ monat: m, flaschen: z.flaschen, umsatz: z.umsatz });
  }
  // Die 12 Monate davor, nur für den Vergleich mit dem Vorjahresmonat (das Diagramm zeigt weiter 13 Monate).
  const vergleichsmonate = [];
  for (let i = 24; i >= 13; i--) {
    const m = monatPlus(jetzt, -i);
    const z = zeitraumAuswerten_(verkaeufe, m, m);
    vergleichsmonate.push({ monat: m, flaschen: z.flaschen, umsatz: z.umsatz });
  }
  return {
    monate: monate,
    vergleichsmonate: vergleichsmonate,
    letzte12: zeitraumAuswerten_(verkaeufe, monatPlus(jetzt, -12), monatPlus(jetzt, -1)),
    jahr: zeitraumAuswerten_(verkaeufe, jetzt.slice(0, 4) + '-01', jetzt),
    vorjahr: zeitraumAuswerten_(verkaeufe, (Number(jetzt.slice(0, 4)) - 1) + '-01', (Number(jetzt.slice(0, 4)) - 1) + '-12'),
    gesamt: zeitraumAuswerten_(verkaeufe, ersterMonat_(verkaeufe, jetzt), jetzt),
    zeilen: verkaufZeilenKompakt(verkaeufe),
  };
}

/** Verkäufe → [[Monat, Datum oder '', Kanal, Kunde, Flaschen, Umsatz, Rechnung oder ''], …], sortiert nach Monat, Datum, Zeile. */
function verkaufZeilenKompakt(verkaeufe) {
  return verkaeufe.slice().sort((a, b) => (a.monat < b.monat ? -1 : a.monat > b.monat ? 1 : 0) ||
    ((a.datum || '') < (b.datum || '') ? -1 : (a.datum || '') > (b.datum || '') ? 1 : 0) || (a.zeile || 0) - (b.zeile || 0))
    .map((v) => [v.monat, v.datum || '', v.kanal, v.kunde, runde_(v.flaschen, 2), runde_(v.umsatz || 0, 2), v.rechnung || '']);
}
