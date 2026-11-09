// Ansichten Übersicht, Verkäufe und Lager: bauen ihren Inhalt bei jeder neuen Antwort komplett neu (nur DOM-Knoten, kein HTML-Text).
// Aufbau als Karten (dunkelgraue Flächen), Kennzahl-Kacheln und Listen; Breiten von Balken per CSSOM (mit der CSP erlaubt).
(function () {
  'use strict';

  const S = window.SATE;
  const H = S.H;
  const Z = S.zustand;
  const h = S.h;
  const s = S.s;

  const flaschen = (z) => H.zahlFormat(z, 0) + (z === 1 ? ' Flasche' : ' Flaschen');
  const standorte = () => (Z.daten ? Z.daten.lager.map((l) => l.standort) : []);
  const ART_ICON = { Inventur: 'inventur', Umlagerung: 'umlagerung', Promo: 'promo', Eigenverbrauch: 'eigenverbrauch', Bruch: 'bruch',
    'Abfüllung': 'abfuellung', Storno: 'storno' };

  /** Inhalt eines Bereichs leeren und zurückgeben. */
  function leeren(id) {
    const e = S.el(id);
    e.replaceChildren();
    return e;
  }

  /** Breite (bzw. `left`) in Prozent setzen, auf 0–100 begrenzt. */
  function prozent(e, wert, eigenschaft) {
    e.style[eigenschaft || 'width'] = Math.max(0, Math.min(100, wert || 0)) + '%';
    return e;
  }

  /** Kleiner Balken (z. B. Anteil eines Standorts oder Kanals). */
  function anteil(wert) {
    return h('div', { class: 'anteil', 'aria-hidden': 'true' }, prozent(h('div', { class: 'anteil-fuell' }), wert));
  }

  /** Freundlicher leerer Zustand als Karte, optional mit Knopf. */
  function leerKarte(titel, text, knopfText, beiKlick) {
    return h('div', { class: 'karte leer-karte' },
      S.icon('info', 'leer-icon'),
      h('p', { class: 'leer-titel', text: titel }),
      text ? h('p', { class: 'leer', text: text }) : null,
      knopfText ? h('button', { type: 'button', class: 'knopf klein', text: knopfText, onclick: beiKlick }) : null);
  }

  /** Graue Platzhalter-Flächen, solange geladen wird (Skeleton). `formen` z. B. ['gross', 'reihe', 'zeile']. */
  function skelett(formen) {
    return h('div', { class: 'skelett-gruppe' },
      h('p', { class: 'nur-vorlesen', text: 'Lädt …' }),
      formen.map((f) => h('div', { class: 'skelett skelett-' + f, 'aria-hidden': 'true' })));
  }

  /** Ohne Daten: beim Laden Skeleton, sonst Hinweis mit Knopf zum Laden. */
  function platzhalter(ziel, formen) {
    if (Z.laedt) return ziel.append(skelett(formen || ['gross', 'reihe', 'zeile']));
    ziel.append(leerKarte('Noch keine Daten da', 'Sobald die App Verbindung hat, steht hier alles. Probier es gleich nochmal.',
      'Jetzt laden', () => S.laden()));
  }

  /**
   * Kennzahl-Kachel: kleines Label, große Zahl, darunter Einheit und Zusatz in einer Zeile („Flaschen · geschätzt“),
   * optional eine zweite kleine Zeile (`extra`, z. B. „≈ 335 Kisten“).
   */
  function kachel(label, wert, einheit, zusatz, icon, extra) {
    const unten = [einheit, zusatz].filter(Boolean).join(' · ');
    return h('div', { class: 'kachel' },
      h('p', { class: 'kachel-label' }, icon ? S.icon(icon, 'label-icon') : null, label),
      h('p', { class: 'kachel-wert', text: wert }),
      unten ? h('p', { class: 'kachel-zusatz', text: unten }) : null,
      extra ? h('p', { class: 'kachel-zusatz', text: extra }) : null);
  }

  /** Überschrift im Slide-Stil: erstes Wort fett, Rest normal (z. B. „**Top 10** Kunden“). */
  function ueberschrift(tag, fett, rest) {
    return h(tag, {}, h('strong', { text: fett }), rest ? ' ' + rest : null);
  }

  /** Segmented Control (iOS): zwei oder drei Knöpfe in einer Pille, gewählter hell. `wahl` = [[wert, text], …]. */
  function umschalter(gruppe, wahl, aktuell, beiWahl) {
    return h('div', { class: 'segment', role: 'group', 'aria-label': gruppe },
      wahl.map(([wert, text]) => h('button', {
        type: 'button', 'aria-pressed': wert === aktuell ? 'true' : 'false', 'data-gruppe': gruppe, 'data-wert': wert, text: text,
        onclick: () => {
          if (wert === aktuell) return;
          beiWahl(wert);
          const neu = document.querySelector('[data-gruppe="' + gruppe + '"][data-wert="' + wert + '"]');
          if (neu) neu.focus();
        },
      })));
  }

  // Trends ------------------------------------------------------------------------------------------------------

  /**
   * Kleiner Trend-Chip: Pfeil ↑/↓ (für Vorleseprogramme versteckt, das Vorzeichen sagt es schon), „+12 %“ und wozu.
   * Farbe dezent: Grün hoch, Rot runter, sonst grau (Kontraste in style.css).
   */
  function trendChip(v, wozu) {
    const r = H.richtung(v.prozent);
    return h('span', { class: 'trend trend-' + r },
      h('span', { class: 'trend-pfeil', 'aria-hidden': 'true', text: r === 'hoch' ? '↑' : r === 'runter' ? '↓' : '→' }),
      h('span', { class: 'trend-zahl', text: H.prozentText(v.prozent) }),
      wozu ? h('span', { class: 'trend-wozu', text: ' ' + wozu }) : null);
  }

  // Start (seit v23 neu gedacht) ------------------------------------------------------------------------------------
  // Nur das Wichtigste auf einen Blick: Bestellstatus mit Prognose, vier Kennzahlen (jede springt in ihre Details),
  // Kunden-Hinweis, „Zuletzt passiert“ (Rechnungen und Buchungen gemischt). Lager-Liste und Verkaufs-Details stehen in
  // ihren Reitern, damit hier nichts doppelt steht.

  /** `JJJJ-MM-TT` → fortlaufende Tageszahl (für Abstände auf der Zeitachse). */
  const tagNr = (t) => Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10))) / 86400000;

  /**
   * Bestandsprognose als Liniendiagramm (seit v24 nur eine Linie): der Bestand von heute bis „leer“ nach
   * H.bestellPrognose (im Winter flach, im Sommer steil), senkrecht gestrichelt der Bestelltermin, dahinter als Band die
   * Abfüllung (Vorlauf), bis die neuen Flaschen da sind. So sieht man, warum so früh bestellt werden muss. Ohne Verlauf: null.
   */
  function prognoseDiagramm(p, heute) {
    if (!p || !(p.bestand > 0) || !Array.isArray(p.punkte) || p.punkte.length < 2) return null;
    const M = { breite: 340, hoehe: 126, links: 6, rechts: 10, oben: 24, unten: 20 };
    const letzter = p.punkte[p.punkte.length - 1].datum;
    const ende = H.tagePlus(p.ankunft && p.ankunft > letzter ? p.ankunft : letzter, 18);
    const x0 = tagNr(heute);
    const breite = Math.max(tagNr(ende) - x0, 1);
    const rund = (z) => Math.round(z * 100) / 100;
    const X = (t) => rund(M.links + ((Math.min(tagNr(t), tagNr(ende)) - x0) / breite) * (M.breite - M.links - M.rechts));
    const Y = (w) => rund(M.oben + (1 - Math.max(0, Math.min(w, p.bestand)) / p.bestand) * (M.hoehe - M.oben - M.unten));
    const svg = s('svg', { viewBox: '0 0 ' + M.breite + ' ' + M.hoehe, class: 'diagramm prognose', 'aria-hidden': 'true', focusable: 'false' });
    const basis = Y(0);
    // Bestelltermin (überfällig: heute) und Abfüllung als Band bis zur Ankunft der neuen Flaschen
    const start = H.datumGueltig(p.spaetestensBestellen) ? (p.spaetestensBestellen < heute ? heute : p.spaetestensBestellen) : null;
    if (start && p.ankunft && start <= ende) {
      const xa = X(start);
      const xb = X(p.ankunft);
      svg.append(s('rect', { x: xa, y: M.oben, width: Math.max(rund(xb - xa), 1), height: rund(basis - M.oben), class: 'band-abfuellung' }));
      if (xb - xa >= 58) svg.append(s('text', { x: rund((xa + xb) / 2), y: basis - 6, 'text-anchor': 'middle', class: 'band-text', text: 'Abfüllung' }));
    }
    svg.append(s('line', { x1: M.links, x2: M.breite - M.rechts, y1: basis, y2: basis, class: 'achse' }));
    // Monatsanfänge als kleine Striche, höchstens sieben beschriftet
    const monate = [];
    for (let m = H.monatPlus(heute.slice(0, 7), 1); m + '-01' <= ende; m = H.monatPlus(m, 1)) monate.push(m);
    const jeder = Math.max(1, Math.ceil(monate.length / 7));
    monate.forEach((m, i) => {
      const x = X(m + '-01');
      svg.append(s('line', { x1: x, x2: x, y1: basis, y2: basis + 3, class: 'achse' }));
      if (i % jeder === 0) svg.append(s('text', { x: x, y: M.hoehe - 4, 'text-anchor': 'middle', class: 'monat', text: H.monatFormat(m) }));
    });
    if (start && start <= ende) {
      const x = X(start);
      svg.append(s('line', { x1: x, x2: x, y1: M.oben - 4, y2: basis, class: 'marke-bestellen' }));
      svg.append(s('text', { x: Math.min(Math.max(x, 36), M.breite - 36), y: M.oben - 9, 'text-anchor': 'middle', class: 'marke-text',
        text: p.spaetestensBestellen < heute ? 'jetzt bestellen' : 'bestellen' }));
    }
    svg.append(s('path', { d: p.punkte.map((q, i) => (i ? 'L' : 'M') + X(q.datum) + ' ' + Y(q.bestand)).join(' '), class: 'linie-dieses' }));
    if (p.leerAm && p.leerAm > heute && p.leerAm <= ende) {
      const x = X(p.leerAm);
      svg.append(s('circle', { cx: x, cy: Y(p.mindest), r: 3.5, class: 'punkt-dieses' }));
      svg.append(s('text', { x: Math.min(x + 6, M.breite - 20), y: Y(p.mindest) - 6, class: 'leer-text', text: 'leer' }));
    }
    svg.append(s('circle', { cx: X(heute), cy: Y(p.bestand), r: 4, class: 'punkt-heute' }));
    // Startwert oben links, außer die Beschriftung „bestellen“ steht gleich daneben
    if (!start || X(start) - X(heute) > 76) {
      svg.append(s('text', { x: X(heute) + 8, y: Y(p.bestand) - 7, class: 'wert-label start-wert', text: H.zahlFormat(p.bestand, 0) }));
    }
    return svg;
  }

  /** Tage bis zum Bestelltermin in Worten: „in 135 Tagen“, „morgen“, „heute“, „seit 3 Tagen überfällig“. */
  function fristText(t) {
    if (t > 1) return 'in ' + H.zahlFormat(t, 0) + ' Tagen';
    if (t === 1) return 'morgen';
    if (t === 0) return 'heute';
    return 'seit ' + H.zahlFormat(-t, 0) + (t === -1 ? ' Tag' : ' Tagen') + ' überfällig';
  }

  /** Annahme hinter „reicht bis“: Saison mit Wachstum (z. B. „jeder Monat wie im Vorjahr +35 % (Wachstum letzte 12 Monate)“) oder der Ø. */
  function annahmeText(p) {
    // Ab 12 Monaten „letzte 12 Monate“ („Nov–Okt“ wäre verwirrend), darunter „Mai–Okt“
    const zeitraum = H.monateAnzahl(p.von, p.bis) >= 12 ? H.zeitraumKurz(p.von, p.bis)
      : p.von === p.bis ? H.monatFormat(p.bis) : H.monatFormat(p.von) + '–' + H.monatFormat(p.bis);
    // Klammerteil am Stück, damit nicht „Monate)“ allein in die zweite Zeile rutscht
    const klammer = (t) => h('span', { class: 'am-stueck', text: '(' + t + ')' });
    if (p.art === 'saison') {
      const pz = Math.round((p.wachstum - 1) * 100);
      return ['jeder Monat wie im Vorjahr' + (pz === 0 ? '' : ' ' + H.prozentText(pz)) + ' ', klammer('Wachstum ' + zeitraum)];
    }
    return typeof p.proMonat === 'number' ? ['Ø ' + H.zahlFormat(p.proMonat, 0) + ' Flaschen pro Monat ', klammer(zeitraum)] : '';
  }

  /**
   * „So kommt das Datum zustande“ (seit v24): Bestand heute → reicht bis etwa (mit Annahme) → minus Abfüllung und
   * Puffer → spätestens bestellen, darunter wann die neuen Flaschen da wären. Gleicher Aufbau wie der Rechenweg im Lager.
   */
  function bestellRechenweg(p, u, heute) {
    const k = u.kennzahlen;
    // Zeile: Text | Wert, die Annahme klein und über die ganze Breite darunter
    const zeile = (dt, dd, notiz, summe) => h('div', { class: 'rw-zeile' + (summe ? ' rw-summe' : '') },
      h('dt', { text: dt }), h('dd', { text: dd }), notiz && notiz.length ? h('dd', { class: 'rw-notiz' }, notiz) : null);
    const gezaehlt = u.lager.filter((l) => l.bestand !== null).length;
    const monate = (n) => H.kistenFormat(n) + (n === 1 ? ' Monat' : ' Monate');
    const wochen = (n) => H.kistenFormat(n) + (n === 1 ? ' Woche' : ' Wochen');
    const zeilen = [zeile('Bestand heute', H.zahlFormat(p.bestand, 0) + ' Flaschen', k.gesamtQuelle === 'inventur' ? 'gezählt'
      : 'geschätzt' + (u.lager.length ? ', ' + gezaehlt + ' von ' + u.lager.length + ' Lagern gezählt' : ''))];
    if (p.mindest > 0) zeilen.push(zeile('Mindestbestand bleibt liegen', '− ' + H.zahlFormat(p.mindest, 0) + ' Flaschen'));
    if (p.leerAm) {
      zeilen.push(zeile('reicht bis etwa', p.leerAm > heute ? H.datumText(p.leerAm) : p.leerAm === heute ? 'heute' : 'schon vorbei', annahmeText(p)));
    } else if (p.reichtUeber) zeilen.push(zeile('reicht über', H.monatFormat(p.reichtUeber, true) + ' hinaus', annahmeText(p)));
    if (p.spaetestensBestellen) {
      if (typeof p.vorlaufMonate === 'number') zeilen.push(zeile('Abfüllung dauert', '− ' + monate(p.vorlaufMonate)));
      if (p.pufferWochen > 0) zeilen.push(zeile('Puffer', '− ' + wochen(p.pufferWochen)));
      const ankunft = !p.ankunft ? ''
        : p.tage < 0 ? 'heute bestellt: neue Flaschen am ' + H.datumText(p.ankunft) + (p.luecke > 0 ? ', ' + H.zahlFormat(p.luecke, 0) + (p.luecke === 1 ? ' Tag' : ' Tage') + ' nach „leer“' : '')
          : 'neue Flaschen dann ab ' + H.datumText(p.ankunft);
      zeilen.push(zeile('spätestens bestellen', H.datumText(p.spaetestensBestellen), ankunft, true));
    }
    return [h('p', { class: 'rw-titel', text: 'So rechnet die App' }), h('dl', { class: 'rechenweg bestell-rechenweg' }, zeilen)];
  }

  /** Bestell-Karte (seit v24): Status, Termin groß mit „in … Tagen“, eine Prognose-Linie, darunter der Rechenweg. */
  function bestellKarte(u, a) {
    const p = a.prognose;
    const st = H.bestellStufe(p ? p.status : null);
    const stufe = st.stufe || 'leer';
    const termin = p && H.datumGueltig(p.spaetestensBestellen) ? p.spaetestensBestellen : null;
    const pill = h('span', { class: 'pill pill-' + stufe }, h('span', { class: 'punkt', 'aria-hidden': 'true' }), st.text);
    const kopf = (text) => h('div', { class: 'bestellung-kopf' }, text ? h('p', { class: 'kachel-label', text: text }) : null, pill);
    return h('section', { class: 'karte bestellung stufe-' + stufe, 'aria-label': 'Bestellstatus' },
      termin
        ? [kopf('Spätestens bestellen bis'), h('p', { class: 'bestellung-datum', text: H.datumText(termin) }),
          h('p', { class: 'bestellung-frist', text: fristText(p.tage) })]
        : p && p.reichtUeber
          ? [kopf('Nächste Bestellung'), h('p', { class: 'bestellung-datum', text: 'nicht in Sicht' }),
            h('p', { class: 'bestellung-frist', text: 'Bestand reicht über ' + H.monatFormat(p.reichtUeber, true) + ' hinaus' })]
          : [kopf(''), h('p', { class: 'bestellung-fehlt', text: 'Dafür fehlen Bestand oder Verkäufe der letzten Monate.' })],
      prognoseDiagramm(p, a.heute),
      p && (termin || p.leerAm || p.reichtUeber) ? bestellRechenweg(p, u, a.heute) : null);
  }

  /** Kennzahl als Knopf (springt in die Details): Label mit Pfeil, große Zahl, Zusatz, optional Chip oder Balken. */
  function kennzahl(label, wert, zusatz, extra, beiKlick, vorlesen) {
    return h('button', { type: 'button', class: 'kachel kachel-knopf', onclick: beiKlick, 'aria-label': vorlesen },
      h('span', { class: 'kachel-label' }, label, h('span', { class: 'kachel-pfeil', 'aria-hidden': 'true', text: '›' })),
      h('span', { class: 'kachel-wert', text: wert }),
      zusatz ? h('span', { class: 'kachel-zusatz', text: zusatz }) : null,
      extra);
  }

  /** Verkäufe öffnen, optional mit einem Monat (dann zur Karte „Pro Monat“ scrollen). */
  function zuVerkaeufen(monat) {
    Z.diagramm = 'flaschen';
    if (monat) Z.monatWahl = monat;
    S.ansichten.verkaeufe();
    S.ansichtZeigen('verkaeufe');
    if (monat) {
      const ziel = S.el('monate-anker');
      if (ziel) ziel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else {
      S.nachOben('verkaeufe');
    }
  }

  function kennzahlen(u, a) {
    const k = u.kennzahlen;
    const jv = a.jv;
    const proKiste = typeof k.flaschenProKiste === 'number' && k.flaschenProKiste > 0 ? k.flaschenProKiste : null;
    const geschaetzt = k.gesamtQuelle !== 'inventur';
    const gezaehlt = u.lager.filter((l) => l.bestand !== null).length;
    const vg = jv && jv.vergleich;
    const pJahr = vg ? H.veraenderung(vg.dieses.flaschen, vg.vorjahr.flaschen) : null;
    const laufend = jv ? jv.monate.find((m) => m.laufend) : null;
    // Letzter voller Monat: in diesem Jahr, im Januar der Dezember aus dem Vorjahr
    const lfm = H.monatPlus(a.heute.slice(0, 7), -1);
    const lm = (jv ? jv.monate.find((m) => m.monat === lfm) : null) || (a.jvVorjahr ? a.jvVorjahr.monate.find((m) => m.monat === lfm) : null);
    const pMonat = lm && lm.dieses && lm.vorjahr ? H.veraenderung(lm.dieses.flaschen, lm.vorjahr.flaschen) : null;
    const bisher = laufend && laufend.dieses ? laufend.dieses.flaschen : 0;
    const vjMonat = laufend && laufend.vorjahr ? laufend.vorjahr.flaschen : null;
    const fortschritt = vjMonat > 0 ? h('span', { class: 'mini-fortschritt', 'aria-hidden': 'true' }, prozent(h('span', { class: 'mini-fuell' + (bisher >= vjMonat ? ' voll' : '') }), (bisher / vjMonat) * 100)) : null;
    const zuLager = () => { S.ansichtZeigen('lager'); S.nachOben('lager'); };
    return h('div', { class: 'kacheln' },
      kennzahl('Bestand', H.zahlFormat(k.gesamtbestand, 0), 'Flaschen · ' + (geschaetzt ? 'geschätzt' : 'gezählt'),
        h('span', { class: 'kachel-zusatz' }, verteilungMini(u.lager) || (u.lager.length ? gezaehlt + ' von ' + u.lager.length + ' Lagern gezählt' : H.kistenKurz(k.gesamtbestand, proKiste, geschaetzt))),
        zuLager, 'Bestand ' + flaschen(k.gesamtbestand) + (geschaetzt ? ', geschätzt' : ', gezählt') + '. Lager öffnen'),
      jv ? kennzahl('Dieses Jahr', H.zahlFormat(jv.bisher.flaschen, 0), 'Flaschen',
        pJahr !== null ? h('span', { class: 'trend-zeile' }, trendChip({ prozent: pJahr }, 'zum Vorjahr'))
          : jv.vorjahrGesamt ? h('span', { class: 'kachel-zusatz', text: 'Vorjahr gesamt ' + H.zahlFormat(jv.vorjahrGesamt.flaschen, 0) }) : null,
        () => zuVerkaeufen(null), 'Dieses Jahr ' + flaschen(jv.bisher.flaschen) + (pJahr === null ? '' : ', ' + H.prozentText(pJahr) + ' zum Vorjahr') + '. Verkäufe öffnen') : null,
      lm && lm.dieses ? kennzahl(H.monatName(lm.monat), H.zahlFormat(lm.dieses.flaschen, 0), 'Flaschen',
        pMonat !== null ? h('span', { class: 'trend-zeile' }, trendChip({ prozent: pMonat }, 'zum Vorjahr')) : null,
        () => zuVerkaeufen(lm.monat), H.monatName(lm.monat) + ': ' + flaschen(lm.dieses.flaschen) + (pMonat === null ? '' : ', ' + H.prozentText(pMonat) + ' zum Vorjahresmonat') + '. Monat öffnen') : null,
      laufend ? kennzahl(H.monatName(laufend.monat) + ' bisher', H.zahlFormat(bisher, 0), 'Flaschen bis heute',
        vjMonat !== null ? h('span', { class: 'kachel-zusatz fortschritt-text' }, fortschritt, 'Vorjahr: ' + H.zahlFormat(vjMonat, 0) + ' im ganzen Monat') : null,
        () => zuVerkaeufen(laufend.monat), H.monatName(laufend.monat) + ' bisher ' + flaschen(bisher) + (vjMonat !== null ? ', Vorjahr ganzer Monat ' + flaschen(vjMonat) : '') + '. Monat öffnen') : null);
  }

  /** Bestand nach Lager als kleiner geteilter Balken (ab zwei gezählten Lagern), sonst null. */
  function verteilungMini(lager) {
    if (!H.anteileSinnvoll(lager)) return null;
    const mit = lager.filter((l) => typeof l.bestand === 'number' && l.bestand > 0);
    const summe = mit.reduce((x, l) => x + l.bestand, 0);
    return h('span', { class: 'verteilung-balken mini', 'aria-hidden': 'true' }, mit.map((l, i) => prozent(h('span', { class: 'vt-teil vt-' + (i % 4) }), (l.bestand / summe) * 100)));
  }

  /** Hinweis auf den Kunden-Reiter: Kunden dieses Jahr, neue, „lange nichts bestellt“ (nur mit Verkaufszeilen). */
  function kundenHinweis(a) {
    if (!a.zeilen || !a.jv) return null;
    const jahr = a.heute.slice(0, 4);
    const z = H.zeitraumAuswerten(a.zeilen, jahr + '-01', a.heute.slice(0, 7));
    const neu = z.kunden.filter((x) => x.erster >= jahr + '-01').length;
    const lange = H.nachfassen(a.zeilen, a.heute).length;
    if (!z.kunden.length && !lange) return null;
    const teile = [z.kunden.length ? '' : 'noch keine Bestellung dieses Jahr', neu && neu < z.kunden.length ? neu + ' neu' : '',
      lange ? lange + (lange === 1 ? ' bestellt lange nichts' : ' bestellen lange nichts') : ''].filter(Boolean);
    return h('button', { type: 'button', class: 'karte zeilen-karte', onclick: () => { S.ansichtZeigen('kunden'); S.nachOben('kunden'); } },
      h('span', { class: 'karte-symbol', 'aria-hidden': 'true' }, S.icon('kunden')),
      h('span', { class: 'zeilen-karte-text' },
        h('strong', { text: z.kunden.length ? z.kunden.length + (z.kunden.length === 1 ? ' Kunde' : ' Kunden') + ' dieses Jahr' : 'Kunden' }),
        teile.length ? h('span', { text: teile.join(' · ') }) : null),
      h('span', { class: 'chevron', 'aria-hidden': 'true', text: '›' }));
  }

  /**
   * Dezember und Januar, solange nicht alle Lager zum 31.12. gezählt sind: Karte „Jahresinventur: 1 von 4 gezählt“,
   * antippen öffnet das Lager. Gleiche Regel wie dort (Inventur mit Datum 31.12.).
   */
  function inventurHinweis(u, heute) {
    const stichtag = H.jahresStichtag(heute);
    if (!stichtag || !u.lager.length) return null;
    const fertig = u.lager.filter((l) => !!H.inventurAm(l, stichtag)).length;
    if (fertig === u.lager.length) return null;
    return h('button', { type: 'button', class: 'karte hinweis-karte', onclick: () => { S.ansichtZeigen('lager'); S.nachOben('lager'); } },
      h('span', { class: 'hinweis-symbol', 'aria-hidden': 'true' }, S.icon('inventur')),
      h('span', { class: 'hinweis-text' }, h('strong', { text: 'Jahresinventur zum 31.12.' + stichtag.slice(0, 4) }),
        h('span', { text: fertig + ' von ' + u.lager.length + ' Lagern gezählt' + (heute >= stichtag ? ' – jetzt zählen und eintragen.' : ' – am 1.1. zählen.') })),
      h('span', { class: 'chevron', 'aria-hidden': 'true', text: '›' }));
  }

  /** Eine Zeile „Zuletzt passiert“: Rechnung (Kunde, Flaschen) oder Buchung (Art, Lager, wer). */
  function aktivitaetZeile(x) {
    if (x.typ === 'rechnung') {
      return h('li', { class: 'aktiv-zeile' },
        h('span', { class: 'verlauf-icon rechnung-icon' }, S.icon('rechnung')),
        h('span', { class: 'aktiv-text' }, h('span', { class: 'aktiv-titel', text: x.kunde || 'Rechnung' }),
          h('span', { class: 'nebenzeile', text: ['Rechnung', x.kanal, H.datumKurz(x.datum)].filter(Boolean).join(' · ') })),
        h('span', { class: 'aktiv-wert', text: H.zahlFormat(x.flaschen, 0) + ' Fl.' }));
    }
    return h('li', { class: 'aktiv-zeile' + (x.storniert ? ' storniert' : '') },
      h('span', { class: 'verlauf-icon' }, S.icon(ART_ICON[x.art] || 'info')),
      h('span', { class: 'aktiv-text' }, h('span', { class: 'aktiv-titel' }, x.art || '?', x.storniert ? h('span', { class: 'badge badge-storno', text: 'storniert' }) : null),
        h('span', { class: 'nebenzeile', text: [x.art === 'Umlagerung' ? x.standort + ' → ' + (x.nach || '?') : x.standort, H.datumKurz(x.datum), x.wer ? 'von ' + x.wer : '']
          .filter(Boolean).join(' · ') })),
      typeof x.flaschen === 'number' ? h('span', { class: 'aktiv-wert', text: H.zahlFormat(x.flaschen, 0) + ' Fl.' }) : null);
  }

  /** „Zuletzt passiert“ auf dem Start: die letzten fünf Rechnungen und Buchungen (lädt den Verlauf mit). */
  S.aktivitaetZeigen = function () {
    const ziel = S.el('aktivitaet-inhalt');
    if (!ziel) return;
    const u = Z.daten;
    if (!u) return ziel.replaceChildren();
    const liste = H.aktivitaet(u.verkaufListe, Z.verlauf ? Z.verlauf.eintraege : [], 5, auswertung().heute);
    S.fuellen(ziel,
      h('div', { class: 'h2-zeile' }, ueberschrift('h2', 'Zuletzt', 'passiert'),
        h('button', { type: 'button', class: 'text-link h2-link', text: 'Alle Buchungen ›', onclick: () => { S.ansichtZeigen('lager'); S.verlaufZeigenOben(); } })),
      liste.length
        ? h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste', role: 'list' }, liste.map(aktivitaetZeile)))
        : Z.verlaufLaedt ? skelett(['zeile']) : h('p', { class: 'hinweis', text: 'Noch nichts passiert in den letzten Wochen.' }),
      Z.verlaufFehler ? h('p', { class: 'hinweis', text: 'Buchungen gerade nicht geladen, gezeigt werden nur Rechnungen.' }) : null);
  };

  S.ansichten.uebersicht = function () {
    S.el('name').textContent = Z.name || '';
    const ziel = leeren('uebersicht-inhalt');
    const u = Z.daten;
    S.el('datum-zeile').textContent = u && H.datumGueltig(u.heute) ? H.wochentagText(u.heute) : '';
    if (!u) return platzhalter(ziel, ['gross', 'reihe', 'reihe', 'zeile']);
    const a = auswertung();
    const hw = H.hinweiseOrdnen(u.hinweise);
    S.fuellen(ziel,
      bestellKarte(u, a),
      kennzahlen(u, a),
      inventurHinweis(u, a.heute),
      kundenHinweis(a),
      h('div', { id: 'aktivitaet-inhalt' }),
      // Übrige Hinweise aus dem Sheet (z. B. unlesbare Zeilen) klein und dezent am Ende
      hw.andere.length
        ? h('div', { class: 'karte info-karte', role: 'note', 'aria-label': 'Hinweise aus dem Sheet' }, S.icon('info', 'info-icon'),
          h('div', {}, h('p', { class: 'info-titel', text: 'Aus dem Sheet' }), h('ul', { class: 'hinweise', role: 'list' }, hw.andere.map((t) => h('li', { text: t })))))
        : null);
    S.aktivitaetZeigen();
  };

  // Verkäufe ----------------------------------------------------------------------------------------------------
  // Seit 2026-11-09: Karte „Dieses Jahr“ (Summe bis heute, Vergleich mit dem Vorjahr, Verlauf als Linien), Monate als
  // Balkenpaare Dieses Jahr/Vorjahr, Kanäle mit Veränderung, alle Kunden mit Details, „Lange nichts bestellt“.
  // Gerechnet wird aus `verkaeufe.zeilen`; ältere Schnittstellen ohne Zeilen: Monate aus den 25 Monatswerten, Kanäle
  // und Top 10 wie von der Schnittstelle geliefert.

  /** Auswertung der gezeigten Daten, einmal pro Antwort gerechnet. */
  let memo = { daten: null, wert: null };
  function auswertung() {
    const u = Z.daten;
    if (!u) return null;
    if (memo.daten === u) return memo.wert;
    const heute = H.datumGueltig(u.heute) ? u.heute : H.heuteBerlin();
    const zeilen = H.verkaufZeilen(u.verkaeufe, heute);
    const werte = H.monatsWerte(u.verkaeufe, zeilen);
    const jv = H.jahresVergleich(werte, heute);
    const vorjahr = jv ? H.jahresVergleich(werte, heute, jv.jahr - 1) : null;
    const prognose = H.bestellPrognose(u, werte, heute, H.ersterVerkaufsmonat(u.verkaeufe, zeilen), H.bekannteRechnungen(u.verkaeufe, heute));
    memo = { daten: u, wert: { zeilen: zeilen, heute: heute, werte: werte, jv: jv, jvVorjahr: vorjahr, prognose: prognose } };
    return memo.wert;
  }
  S.auswertung = auswertung;

  /**
   * Animation beim ersten Zeigen: ein Diagramm wächst bzw. blendet ein, wenn es in dieser Form (Flaschen/Umsatz, Jahr)
   * zum ersten Mal zu sehen ist – nicht bei jedem Neuladen im Hintergrund und nicht unsichtbar im Hintergrund-Reiter.
   * Zeichnet die App es kurz danach nochmal (gespeicherter Stand, dann frischer), läuft sie in den ersten 700 ms weiter.
   * „Bewegung reduzieren“ schaltet das in style.css ab.
   */
  const gezeigt = Object.create(null);
  function animieren(svg, schluessel) {
    svg.setAttribute('data-anim', schluessel);
    if (Z.ansicht === 'verkaeufe') animierenJetzt(svg, schluessel); // sonst beim ersten Wechsel in die Verkäufe
    return svg;
  }
  function animierenJetzt(svg, schluessel) {
    const jetzt = Date.now();
    if (!gezeigt[schluessel]) gezeigt[schluessel] = jetzt;
    if (jetzt - gezeigt[schluessel] < 700) svg.classList.add('rein-anim');
  }
  /** Beim Wechsel in die Verkäufe (app.js): Diagramme, die noch nie zu sehen waren, jetzt wachsen lassen. */
  S.diagrammeZeigen = function () {
    document.querySelectorAll('#verkaeufe-inhalt svg[data-anim]').forEach((svg) => animierenJetzt(svg, svg.getAttribute('data-anim')));
  };

  /** Zahl mit Einheit der gewählten Größe: „1.234 Flaschen“ bzw. „2.345 €“. */
  function mitEinheit(z, g) {
    if (g === 'umsatz') return H.euroFormat(z);
    return flaschen(z);
  }
  /** Große Zahl plus kleine Einheit dahinter (für Karten-Köpfe). */
  function grosseZahl(klasse, z, g) {
    return h('p', { class: klasse }, H.zahlFormat(z, 0),
      h('span', { class: 'einheit', text: g === 'umsatz' ? ' €' : (z === 1 ? ' Flasche' : ' Flaschen') }));
  }
  /** „Jan – Okt“ (gleicher Monat: „Januar“). */
  function monateVonBis(von, bis) {
    return von === bis ? H.monatName(von) : H.monatFormat(von) + ' – ' + H.monatFormat(bis);
  }

  /**
   * Gemeinsame Achse und Spalten für die Jahres-Diagramme (12 Monate nebeneinander). `werte` = alle gezeichneten Zahlen;
   * negative (Gutschriften) bekommen Platz unter der Nulllinie. Rückgabe { striche, oben, null0 (y der Nulllinie),
   * basis (unterer Rand), platz, y(w) }.
   */
  function jahresRaster(M, werte, striche) {
    const r = H.achseMitMinus(werte, striche || 4);
    const flaeche = M.hoehe - M.oben - M.unten;
    const y = (w) => M.oben + ((r.oben - (typeof w === 'number' && isFinite(w) ? w : 0)) / (r.oben - r.unten)) * flaeche;
    return { striche: r.striche, oben: r.oben, null0: y(0), basis: M.oben + flaeche, platz: (M.breite - M.links) / 12, y: y };
  }
  function gitter(svg, M, r) {
    r.striche.forEach((w) => {
      const yy = Math.round(r.y(w) * 100) / 100;
      svg.append(s('line', { x1: M.links, x2: M.breite, y1: yy, y2: yy, class: w === 0 ? 'achse' : 'gitter' }));
      svg.append(s('text', { x: M.links - 6, y: yy + 3, 'text-anchor': 'end', class: 'achsen-text',
        text: w < 0 ? '−' + H.achsenText(-w, r.oben) : H.achsenText(w, r.oben) }));
    });
  }

  // Karte „Dieses Jahr“: Summe Januar bis heute, Vergleich volle Monate, Linien kumuliert -------------------------

  const KM = { breite: 340, hoehe: 150, links: 30, unten: 20, oben: 14 };

  function kumulDiagramm(jv, g) {
    const d = H.kumuliert(jv.monate, 'dieses', g);
    const v = H.kumuliert(jv.monate, 'vorjahr', g);
    const r = jahresRaster(KM, d.concat(v), 3);
    const x = (i) => Math.round((KM.links + (i + 0.5) * r.platz) * 100) / 100;
    const punkte = (reihe) => reihe.map((w, i) => (w === null ? null : [x(i), Math.round(r.y(w) * 100) / 100])).filter(Boolean);
    const pfad = (p) => p.map((q, i) => (i ? 'L' : 'M') + q[0] + ' ' + q[1]).join(' ');
    const pd = punkte(d);
    const pv = punkte(v);
    const svg = s('svg', { viewBox: '0 0 ' + KM.breite + ' ' + KM.hoehe, class: 'diagramm kumul', 'aria-hidden': 'true', focusable: 'false' });
    svg.append(s('defs', {}, s('linearGradient', { id: 'kumul-flaeche', x1: 0, y1: 0, x2: 0, y2: 1 },
      s('stop', { offset: 0, 'stop-color': '#E8C547', 'stop-opacity': 0.26 }),
      s('stop', { offset: 1, 'stop-color': '#E8C547', 'stop-opacity': 0 }))));
    gitter(svg, KM, r);
    [0, 3, 6, 9, 11].forEach((i) => {
      svg.append(s('text', { x: x(i), y: r.basis + 14, 'text-anchor': 'middle', class: 'monat', text: H.monatFormat(jv.monate[i].monat) }));
    });
    if (pv.length > 1) svg.append(s('path', { d: pfad(pv), class: 'linie-vorjahr' }));
    if (pd.length) {
      if (pd.length > 1) {
        const n = Math.round(r.null0 * 100) / 100;
        svg.append(s('path', { d: pfad(pd) + ' L' + pd[pd.length - 1][0] + ' ' + n + ' L' + pd[0][0] + ' ' + n + ' Z', class: 'flaeche-dieses' }));
        svg.append(s('path', { d: pfad(pd), class: 'linie-dieses' }));
      }
      const ende = pd[pd.length - 1];
      const i = d.filter((w) => w !== null).length - 1;
      if (v[i] !== null && v[i] !== undefined) svg.append(s('circle', { cx: ende[0], cy: Math.round(r.y(v[i]) * 100) / 100, r: 3, class: 'punkt-vorjahr' }));
      svg.append(s('circle', { cx: ende[0], cy: ende[1], r: 4.5, class: 'punkt-dieses' }));
      svg.append(s('text', {
        x: Math.min(ende[0], KM.breite - 4), y: Math.max(ende[1] - 9, 9), 'text-anchor': ende[0] > KM.breite - 40 ? 'end' : 'middle',
        class: 'wert-label', text: H.achsenText(Math.round(d[i])) + (g === 'umsatz' ? ' €' : ''),
      }));
    }
    return svg;
  }

  function jahrKarte(a, g) {
    const jv = a.jv;
    const jetzt = a.heute.slice(0, 7);
    const vg = jv.vergleich;
    const p = vg ? H.veraenderung(vg.dieses[g], vg.vorjahr[g]) : null;
    const vorleser = 'Dieses Jahr bis heute ' + mitEinheit(jv.bisher[g], g) +
      (vg ? '. ' + monateVonBis(jahrAnfang(jetzt), vg.bis) + ': ' + mitEinheit(vg.dieses[g], g) + ', im Vorjahr ' + mitEinheit(vg.vorjahr[g], g) : '') + '.';
    return h('section', { class: 'karte jahr-karte', 'aria-label': 'Dieses Jahr' },
      h('p', { class: 'kachel-label', text: 'Dieses Jahr · ' + monateVonBis(jahrAnfang(jetzt), jetzt) }),
      grosseZahl('info-wert', jv.bisher[g], g),
      vg
        ? h('p', { class: 'trend-zeile' }, p === null ? null : trendChip({ prozent: p }, 'zum Vorjahr'),
          h('span', { class: 'trend-hinweis', text: monateVonBis(jahrAnfang(jetzt), vg.bis) + ': ' + mitEinheit(vg.dieses[g], g) +
            ', im Vorjahr ' + mitEinheit(vg.vorjahr[g], g) }))
        : h('p', { class: 'trend-zeile trend-hinweis', text: 'Der Vergleich mit dem Vorjahr startet, sobald der erste Monat vorbei ist.' }),
      h('p', { class: 'nur-vorlesen', text: vorleser }),
      animieren(kumulDiagramm(jv, g), 'kumul|' + g),
      h('div', { class: 'legende' },
        h('span', {}, h('span', { class: 'zeichen zeichen-linie', 'aria-hidden': 'true' }), 'Dieses Jahr'),
        h('span', {}, h('span', { class: 'zeichen zeichen-linie-vorjahr', 'aria-hidden': 'true' }), 'Vorjahr'),
        jv.vorjahrGesamt ? h('span', { class: 'legende-tipp', text: 'Vorjahr gesamt ' + H.zahlFormat(jv.vorjahrGesamt[g], 0) + (g === 'umsatz' ? ' €' : '') }) : null));
  }
  function jahrAnfang(monat) { return monat.slice(0, 4) + '-01'; }

  // Monate: Balkenpaare Vorjahr (links, grau) | Dieses Jahr (rechts, hell; gewählt gelb) ---------------------------

  const GM = { breite: 340, hoehe: 184, links: 30, unten: 20, oben: 20 };

  /**
   * Gewählter Monat als `JJJJ-MM`: gemerkt (dieses Jahr oder Vorjahr), sonst der letzte volle Monat – im Januar also der
   * Dezember des Vorjahrs.
   */
  function gewaehlterMonatText(a) {
    const jahr = a.jv.jahr;
    if (typeof Z.monatWahl === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(Z.monatWahl)) {
      const j = Number(Z.monatWahl.slice(0, 4));
      if (j === jahr || (j === jahr - 1 && a.jvVorjahr)) return Z.monatWahl;
    }
    const letzter = H.monatPlus(a.heute.slice(0, 7), -1);
    return letzter.slice(0, 4) === String(jahr) || a.jvVorjahr ? letzter : jahr + '-01';
  }

  /**
   * Gezeigtes Jahr im Monatsdiagramm = das Jahr des gewählten Monats: normal dieses Jahr gegen das Vorjahr; blättert man
   * vor den Januar zurück (oder ist im Januar noch kein Monat voll), das Vorjahr gegen das Jahr davor. Kein Umschalter
   * (Mark 2026-11-09: zwei Ansichten waren doppelt, die Vorjahresbalken stehen ja schon daneben).
   */
  function monatsJahr(a) {
    const text = gewaehlterMonatText(a);
    const vorjahr = !!a.jvVorjahr && text.slice(0, 4) === String(a.jvVorjahr.jahr);
    return { jv: vorjahr ? a.jvVorjahr : a.jv, haupt: vorjahr ? 'Vorjahr' : 'Dieses Jahr', vergleich: vorjahr ? 'Jahr davor' : 'Vorjahr',
      vorjahr: vorjahr, index: Number(text.slice(5, 7)) - 1 };
  }

  /** Vergleichs-Zelle: kleines Label, Pfeil und Prozent farbig, darunter der Vergleichswert. */
  function vergleichZelle(label, p, wert, g) {
    const r = H.richtung(p);
    return h('div', { class: 'vg-zelle' },
      h('span', { class: 'vg-label', text: label }),
      h('span', { class: 'vg-wert trend-' + r },
        h('span', { class: 'trend-pfeil', 'aria-hidden': 'true', text: r === 'hoch' ? '↑ ' : r === 'runter' ? '↓ ' : '→ ' }),
        h('span', { class: 'trend-zahl', text: H.prozentText(p) })),
      h('span', { class: 'vg-basis', text: mitEinheit(wert, g) }));
  }

  function monatInfo(info, a, mj, i, g) {
    const m = mj.jv.monate[i];
    const vorMonat = a.werte(H.monatPlus(m.monat, -1));
    const zellen = [];
    let vorjahrInZelle = false;
    if (m.dieses && !m.laufend) {
      const pj = m.vorjahr ? H.veraenderung(m.dieses[g], m.vorjahr[g]) : null;
      const pm = vorMonat ? H.veraenderung(m.dieses[g], vorMonat[g]) : null;
      if (pj !== null) zellen.push(vergleichZelle(mj.vorjahr ? 'zum Monat im Jahr davor' : 'zum Vorjahresmonat', pj, m.vorjahr[g], g));
      if (pm !== null) zellen.push(vergleichZelle('zum Vormonat', pm, vorMonat[g], g));
      vorjahrInZelle = pj !== null;
    }
    const andere = g === 'umsatz' ? 'flaschen' : 'umsatz';
    // Unter der großen Zahl: die andere Größe; der Vorjahreswert nur, wenn ihn keine Kachel schon zeigt
    const vj = m.vorjahr ? mj.vergleich + (m.laufend ? ' ganzer Monat ' : ' ') + mitEinheit(m.vorjahr[g], g) : mj.vergleich + ' ohne Daten';
    const zusatz = [m.dieses ? mitEinheit(m.dieses[andere], andere) : '', vorjahrInZelle ? '' : vj].filter(Boolean).join(' · ');
    S.fuellen(info,
      h('p', { class: 'kachel-label' }, H.monatName(m.monat),
        mj.vorjahr ? h('span', { class: 'badge klein-badge', text: 'Vorjahr' }) : null,
        m.laufend ? h('span', { class: 'badge klein-badge', text: 'bisher' }) : null,
        m.zukunft ? h('span', { class: 'badge klein-badge', text: 'kommt noch' }) : null),
      m.dieses ? grosseZahl('info-wert', m.dieses[g], g) : h('p', { class: 'info-wert info-leer', text: '–' }),
      zusatz ? h('p', { class: 'kachel-zusatz', text: zusatz }) : null,
      zellen.length ? h('div', { class: 'vergleich-raster' }, zellen)
        : m.laufend ? h('p', { class: 'trend-zeile trend-hinweis', text: 'Läuft noch, verglichen wird, sobald der Monat vorbei ist.' })
          : m.zukunft ? h('p', { class: 'trend-zeile trend-hinweis', text: 'So viel war es im Vorjahr – gut zum Planen.' }) : null);
  }

  function monatsText(m, mj, g) {
    return H.monatName(m.monat) + ' ' + m.monat.slice(0, 4) + ': ' +
      (m.zukunft ? 'kommt noch' : (m.dieses ? mitEinheit(m.dieses[g], g) : 'keine Daten') + (m.laufend ? ' bisher' : '')) +
      ', ' + mj.vergleich + ' ' + (m.vorjahr ? mitEinheit(m.vorjahr[g], g) : 'ohne Daten');
  }

  function monatsDiagramm(a, mj, g, info) {
    const jv = mj.jv;
    const alle = [];
    jv.monate.forEach((m) => { if (m.dieses) alle.push(m.dieses[g]); if (m.vorjahr) alle.push(m.vorjahr[g]); });
    const r = jahresRaster(GM, alle, 4);
    const bb = Math.min(9, (r.platz - 7) / 2);
    const svg = s('svg', { viewBox: '0 0 ' + GM.breite + ' ' + GM.hoehe, class: 'diagramm paare', role: 'group',
      'aria-label': (g === 'umsatz' ? 'Umsatz' : 'Flaschen') + ' pro Monat, ' + mj.haupt + ' und ' + mj.vergleich });
    gitter(svg, GM, r);
    const gruppen = [];
    const rund = (z) => Math.round(z * 100) / 100;
    jv.monate.forEach((m, i) => {
      const x0 = GM.links + i * r.platz;
      const mitte = x0 + r.platz / 2;
      const gewaehlt = i === mj.index;
      const gr = s('g', { class: 'paar' + (m.laufend ? ' laufend' : '') + (gewaehlt ? ' gewaehlt' : '') });
      gr.append(s('rect', { x: rund(x0 + 1), y: GM.oben - 8, width: rund(r.platz - 2), height: rund(r.basis - GM.oben + 8), rx: 6, class: 'spalte' }));
      const balken = (wert, x, klasse) => {
        const yy = r.y(wert);
        const hh = Math.abs(r.null0 - yy);
        if (hh > 0.5) {
          gr.append(s('rect', { x: rund(x), y: rund(Math.min(yy, r.null0)), width: rund(bb), height: rund(hh), rx: Math.min(3, bb / 2, hh / 2),
            class: klasse + (wert < 0 ? ' negativ' : '') }));
        }
      };
      if (m.vorjahr) balken(m.vorjahr[g], mitte - bb - 1, 'balken-vorjahr');
      if (m.dieses) balken(m.dieses[g], mitte + 1, 'balken-dieses');
      const oben = m.dieses ? Math.min(r.y(m.dieses[g]), r.null0) : r.basis;
      gr.append(s('text', {
        x: rund(Math.max(GM.links + 14, Math.min(GM.breite - 14, mitte + bb / 2 + 1))), y: rund(Math.max(oben - 5, 9)), 'text-anchor': 'middle',
        class: 'wert-label', text: m.dieses ? H.achsenText(Math.round(m.dieses[g])) : '', hidden: !gewaehlt || !m.dieses,
      }));
      gr.append(s('text', { x: rund(mitte), y: r.basis + 14, 'text-anchor': 'middle', class: 'monat', text: H.monatFormat(m.monat) }));
      const treffer = s('rect', { x: rund(x0), y: 0, width: rund(r.platz), height: GM.hoehe, class: 'treffer', tabindex: 0, role: 'button',
        'aria-label': monatsText(m, mj, g), 'aria-pressed': gewaehlt ? 'true' : 'false' });
      treffer.addEventListener('click', () => waehle(i));
      treffer.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); waehle(i); } });
      gr.append(treffer);
      gruppen.push(gr);
      svg.append(gr);
    });
    /** Monat `i` wählen: Info oben neu, gelb markieren, Wert über dem Balken; `nachher(i)` z. B. für die Pfeile. */
    function waehle(i) {
      if (!(i >= 0 && i < jv.monate.length)) return;
      Z.monatWahl = jv.monate[i].monat;
      monatInfo(info, a, mj, i, g);
      gruppen.forEach((x, j) => {
        x.classList.toggle('gewaehlt', j === i);
        const l = x.querySelector('.wert-label');
        if (j === i && l.textContent) l.removeAttribute('hidden'); else l.setAttribute('hidden', '');
        x.querySelector('.treffer').setAttribute('aria-pressed', j === i ? 'true' : 'false');
      });
      if (typeof svg.nachher === 'function') svg.nachher(i);
    }
    svg.waehle = waehle;
    return svg;
  }

  function monateKarte(a, g) {
    const mj = monatsJahr(a);
    let i = mj.index;
    const info = h('div', { class: 'balken-info', 'aria-live': 'polite' });
    monatInfo(info, a, mj, i, g);
    const svg = monatsDiagramm(a, mj, g, info);
    // Über den Jahreswechsel blättern: Jahr wechseln, alles neu zeichnen, Fokus zurück auf denselben Pfeil
    const ueberJahr = (monat, label) => {
      Z.monatWahl = monat;
      S.ansichten.verkaeufe();
      const k = document.querySelector('#verkaeufe-inhalt .monat-schritte [aria-label="' + label + '"]');
      if (k && !k.disabled) k.focus({ preventScroll: true });
      // Die Live-Region wurde mit neu gezeichnet: den neuen Monat ausdrücklich ansagen (VoiceOver)
      S.ansagen(H.monatName(monat) + ' ' + monat.slice(0, 4) + (monat.slice(0, 4) === String(a.jv.jahr) ? ', dieses Jahr' : ', Vorjahr'));
    };
    // Pfeile ‹ › zum Blättern: große Tippflächen (die Monate im Diagramm sind bei 12 Spalten nur ~25 px breit)
    const zurueck = h('button', { type: 'button', class: 'rund', 'aria-label': 'Monat davor',
      onclick: () => (i > 0 ? svg.waehle(i - 1) : !mj.vorjahr && a.jvVorjahr ? ueberJahr(a.jvVorjahr.jahr + '-12', 'Monat davor') : null) },
    h('span', { class: 'pfeil-text', 'aria-hidden': 'true', text: '‹' }));
    const weiter = h('button', { type: 'button', class: 'rund', 'aria-label': 'Monat danach',
      onclick: () => (i < 11 ? svg.waehle(i + 1) : mj.vorjahr ? ueberJahr(a.jv.jahr + '-01', 'Monat danach') : null) },
    h('span', { class: 'pfeil-text', 'aria-hidden': 'true', text: '›' }));
    const knoepfe = (j) => {
      i = j;
      zurueck.disabled = j <= 0 && (mj.vorjahr || !a.jvVorjahr);
      weiter.disabled = j >= 11 && !mj.vorjahr;
    };
    svg.nachher = knoepfe;
    knoepfe(i);
    return [
      h('section', { class: 'karte diagramm-karte', 'aria-label': 'Pro Monat, ' + mj.haupt },
        h('div', { class: 'monat-schritte' }, zurueck, weiter),
        info,
        animieren(svg, 'monate|' + g + '|' + mj.haupt),
        h('div', { class: 'legende' },
          h('span', {}, h('span', { class: 'zeichen zeichen-dieses', 'aria-hidden': 'true' }), mj.haupt),
          h('span', {}, h('span', { class: 'zeichen zeichen-vorjahr', 'aria-hidden': 'true' }), mj.vergleich),
          h('span', { class: 'legende-tipp', text: 'Monat antippen' }))),
    ];
  }

  // Kanäle und Kunden -------------------------------------------------------------------------------------------

  /** Rangliste der Schnittstelle (ältere Version ohne Zeilen): Name | Flaschen + Umsatz. */
  function rangliste(zeilen, mitAnteil, nummeriert) {
    if (!zeilen.length) return h('div', { class: 'karte' }, h('p', { class: 'leer', text: 'Keine Verkäufe in diesem Zeitraum.' }));
    const max = Math.max.apply(null, zeilen.map((z) => z.flaschen).concat([1]));
    return h('div', { class: 'karte liste-karte' }, h(nummeriert ? 'ol' : 'ul', { class: 'liste rangliste', role: 'list' }, zeilen.map((z, i) => h('li', { class: 'rang-zeile' },
      nummeriert ? h('span', { class: 'rang-nr' + (i < 3 ? ' vorne' : ''), text: String(i + 1) }) : null,
      h('div', { class: 'rang-name' }, h('span', { class: 'rang-titel', text: z.name }), mitAnteil ? anteil((z.flaschen / max) * 100) : null),
      h('div', { class: 'rang-zahlen' }, h('span', { class: 'rang-flaschen', text: flaschen(z.flaschen) }),
        h('span', { class: 'rang-umsatz', text: H.euroFormat(z.umsatz) }))))));
  }

  /** Summen eines Zeitraums kompakt in einer Karte: [[Label, Wert, Prozent oder null], …] nebeneinander. */
  function summenZeile(werte) {
    return h('div', { class: 'karte summen' }, werte.map(([label, wert, p]) => h('div', { class: 'summe-zelle' },
      h('span', { class: 'kachel-label', text: label }),
      h('span', { class: 'summe-wert', text: wert }),
      p === null || p === undefined ? null : trendChip({ prozent: p }, ''))));
  }

  /** Zeitraum des Umschalters: von/bis (Monate) und womit verglichen wird (gleiche Monate im Jahr davor). */
  function zeitraumGrenzen(a, welcher) {
    const jetzt = a.heute.slice(0, 7);
    const jahr = Number(jetzt.slice(0, 4));
    if (welcher === 'vorjahr') {
      return { von: (jahr - 1) + '-01', bis: (jahr - 1) + '-12', vgl: { von: (jahr - 1) + '-01', bis: (jahr - 1) + '-12', vonVor: (jahr - 2) + '-01', bisVor: (jahr - 2) + '-12',
        text: 'Veränderung gegenüber dem Jahr davor' } };
    }
    if (welcher === 'gesamt') {
      const erster = a.zeilen.reduce((x, z) => (z.monat < x ? z.monat : x), jetzt);
      return { von: erster, bis: jetzt, vgl: null };
    }
    const bis = H.monatPlus(jetzt, -1);
    return { von: jahr + '-01', bis: jetzt, vgl: bis.slice(0, 4) === String(jahr)
      ? { von: jahr + '-01', bis: bis, vonVor: (jahr - 1) + '-01', bisVor: (jahr - 1) + bis.slice(4), text: 'Veränderung ' + monateVonBis(jahr + '-01', bis) + ' gegenüber dem Vorjahr' }
      : null };
  }

  /** Chip „+12 %“ (ohne Zusatz; auch −100 % und weniger), „neu“, wenn es im Vergleichszeitraum nichts gab. */
  function kleinerTrend(jetzt, vorher) {
    const j = typeof jetzt === 'number' ? jetzt : 0;
    if (vorher > 0) return trendChip({ prozent: H.veraenderung(j, vorher) }, '');
    return j > 0 ? h('span', { class: 'badge badge-neu', text: 'neu' }) : null;
  }

  function kanalListe(z, vgl) {
    const vorher = vgl ? Object.create(null) : null;
    const jetzt = vgl ? Object.create(null) : null;
    let kanaele = z.kanaele;
    if (vgl) {
      vgl.vor.kanaele.forEach((k) => { vorher[k.kanal] = k.flaschen; });
      vgl.jetzt.kanaele.forEach((k) => { jetzt[k.kanal] = k.flaschen; });
      // Kanäle, die im Vergleichszeitraum verkauft haben und jetzt fehlen, mit 0 zeigen (sonst verschwinden Verluste)
      const da = Object.create(null);
      z.kanaele.forEach((k) => { da[k.kanal] = true; });
      kanaele = kanaele.concat(vgl.vor.kanaele.filter((k) => !da[k.kanal] && k.flaschen > 0).map((k) => ({ kanal: k.kanal, flaschen: 0, umsatz: 0 })));
    }
    if (!kanaele.length) return h('div', { class: 'karte' }, h('p', { class: 'leer', text: 'Keine Verkäufe in diesem Zeitraum.' }));
    const max = Math.max.apply(null, kanaele.map((k) => k.flaschen).concat([1]));
    return h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste rangliste', role: 'list' }, kanaele.map((k) => h('li', { class: 'rang-zeile' },
      h('div', { class: 'rang-name' }, h('span', { class: 'rang-titel' }, k.kanal, vgl ? kleinerTrend(jetzt[k.kanal], vorher[k.kanal]) : null),
        anteil((k.flaschen / max) * 100)),
      h('div', { class: 'rang-zahlen' }, h('span', { class: 'rang-flaschen', text: flaschen(k.flaschen) }),
        h('span', { class: 'rang-umsatz', text: H.euroFormat(k.umsatz) }))))));
  }

  /** Kanäle eines Zeitraums für die Verkäufe (Umschalter, Summen, Liste); die Kunden haben seit v23 einen eigenen Reiter. */
  function kanaeleTeil(a) {
    const u = Z.daten;
    if (Z.zeitraum !== 'vorjahr' && Z.zeitraum !== 'gesamt') Z.zeitraum = 'jahr';
    const teile = [
      ueberschrift('h2', 'Kanäle'),
      umschalter('Zeitraum', [['jahr', 'Dieses Jahr'], ['vorjahr', 'Vorjahr'], ['gesamt', 'Gesamt']], Z.zeitraum,
        (w) => { Z.zeitraum = w; S.ansichten.verkaeufe(); }),
    ];
    const zuKunden = h('button', { type: 'button', class: 'karte zeilen-karte', onclick: () => { S.ansichtZeigen('kunden'); S.nachOben('kunden'); } },
      h('span', { class: 'karte-symbol', 'aria-hidden': 'true' }, S.icon('kunden')),
      h('span', { class: 'zeilen-karte-text' }, h('strong', { text: 'Kunden' }), h('span', { text: 'Alle Kunden, Suche und Details' })),
      h('span', { class: 'chevron', 'aria-hidden': 'true', text: '›' }));
    if (!a.zeilen) {
      // Ältere Schnittstelle: fertige Summen und Kanäle wie geliefert
      const z = u.verkaeufe[Z.zeitraum];
      return teile.concat([
        h('p', { class: 'zeitraum-text', text: Z.zeitraum === 'gesamt' ? 'Seit ' + H.monatFormat(z.von, true) : H.zeitraumFormat(z.von, z.bis) }),
        summenZeile([['Flaschen', H.zahlFormat(z.flaschen, 0), null], ['Umsatz', H.euroFormat(z.umsatz), null]]),
        rangliste(z.kanaele.map((x) => ({ name: x.kanal, flaschen: x.flaschen, umsatz: x.umsatz })).sort((x, y) => y.flaschen - x.flaschen), true, false),
        zuKunden]);
    }
    const gr = zeitraumGrenzen(a, Z.zeitraum);
    const z = H.zeitraumAuswerten(a.zeilen, gr.von, gr.bis);
    const vgl = gr.vgl ? { jetzt: H.zeitraumAuswerten(a.zeilen, gr.vgl.von, gr.vgl.bis), vor: H.zeitraumAuswerten(a.zeilen, gr.vgl.vonVor, gr.vgl.bisVor) } : null;
    const mitVergleich = vgl && vgl.vor.flaschen > 0 ? vgl : null;
    if (Z.zeitraum === 'jahr' && !z.kanaele.length && !(vgl && vgl.vor.kanaele.length)) {
      // Anfang Januar: noch nichts in diesem Jahr, das Vorjahr ist dann die interessante Ansicht
      return teile.concat([h('p', { class: 'zeitraum-text', text: H.zeitraumFormat(z.von, z.bis) }),
        leerKarte('Noch keine Verkäufe in diesem Jahr', 'Sobald die ersten Rechnungen im Sheet stehen, siehst du sie hier.', 'Vorjahr zeigen',
          () => { Z.zeitraum = 'vorjahr'; S.ansichten.verkaeufe(); }), zuKunden]);
    }
    const chip = (g) => (mitVergleich ? H.veraenderung(mitVergleich.jetzt[g], mitVergleich.vor[g]) : null);
    return teile.concat([
      h('p', { class: 'zeitraum-text', text: Z.zeitraum === 'gesamt' ? 'Seit ' + H.monatFormat(z.von, true) : H.zeitraumFormat(z.von, z.bis) }),
      summenZeile([['Flaschen', H.zahlFormat(z.flaschen, 0), chip('flaschen')], ['Umsatz', H.euroFormat(z.umsatz), chip('umsatz')],
        ['Kunden', H.zahlFormat(z.kunden.length, 0), null]]),
      mitVergleich ? h('p', { class: 'hinweis vergleich-text', text: gr.vgl.text + ' (volle Monate).' }) : null,
      kanalListe(z, mitVergleich),
      zuKunden]);
  }

  S.ansichten.verkaeufe = function () {
    const ziel = leeren('verkaeufe-inhalt');
    const u = Z.daten;
    if (!u) return platzhalter(ziel, ['segment', 'gross', 'diagramm', 'zeile']);
    const a = auswertung();
    if (!a.jv) return ziel.append(leerKarte('Keine Verkäufe lesbar', 'Die Antwort der Schnittstelle enthält keine Monate.'));
    const g = Z.diagramm === 'umsatz' ? 'umsatz' : 'flaschen';
    S.fuellen(ziel,
      umschalter('Diagramm', [['flaschen', 'Flaschen'], ['umsatz', 'Umsatz']], g, (w) => { Z.diagramm = w; S.ansichten.verkaeufe(); }),
      jahrKarte(a, g),
      h('h2', { id: 'monate-anker' }, h('strong', { text: 'Pro' }), ' Monat'),
      monateKarte(a, g),
      kanaeleTeil(a));
  };

  // Kunden (eigener Reiter seit v23) --------------------------------------------------------------------------------
  // Oben „Nachfassen“, dann Zeitraum, Suche, Sortierung, Kanal-Filter und die Liste aller Kunden (mit Veränderung zum
  // Vorjahr, „neu“, zuletzt bestellt). Antippen öffnet das Kunden-Blatt. Die Liste wird beim Tippen in der Suche allein
  // neu gezeichnet, damit die Tastatur offen bleibt.

  const KUNDEN_ANFANG = 20;

  /** „Lange nichts bestellt“ als Karte mit den ersten drei (aufklappbar). */
  function nachfassenKarte(a) {
    const liste = H.nachfassen(a.zeilen, a.heute);
    if (!liste.length) return null;
    const alle = !!Z.alleNachfassen;
    const zeigen = alle ? liste : liste.slice(0, 3);
    return [
      h('div', { class: 'h2-zeile' }, ueberschrift('h2', 'Nachfassen')),
      h('p', { class: 'hinweis', text: 'Haben schon öfter bestellt, aber seit über drei Monaten nicht mehr. Vielleicht mal nachfragen?' }),
      h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste', role: 'list' }, zeigen.map((k) => h('li', { class: 'kunde-zeile' },
        h('button', { type: 'button', class: 'zeilen-knopf', 'data-kunde': k.schluessel, onclick: () => S.kundeZeigen(k.schluessel),
          'aria-label': k.kunde + ', zuletzt ' + H.wannText(k.letzte) + ', ' + k.bestellungen + ' Bestellungen. Details' },
        h('span', { class: 'rang-name' }, h('span', { class: 'rang-titel kunde-name', text: k.kunde }),
          h('span', { class: 'rang-unter', text: 'zuletzt ' + H.wannText(k.letzte) + ' · ' + H.abstandText(k.tage) })),
        h('span', { class: 'rang-zahlen' }, h('span', { class: 'rang-flaschen', text: k.bestellungen + ' Bestellungen' }),
          h('span', { class: 'rang-umsatz', text: flaschen(k.flaschen) + ' gesamt' })),
        h('span', { class: 'chevron klein', 'aria-hidden': 'true', text: '›' })))))),
      liste.length > 3
        ? h('button', { type: 'button', class: 'knopf mehr-knopf', 'aria-expanded': alle ? 'true' : 'false',
          text: alle ? 'Weniger zeigen' : 'Alle ' + liste.length + ' zeigen', onclick: () => { Z.alleNachfassen = !alle; S.ansichten.kunden(); } })
        : null,
    ];
  }

  /** Daten der Kundenliste für den gewählten Zeitraum: Kunden, Vergleich (Prozent je Kunde), neu ab, letzte Bestellung. */
  function kundenDaten(a) {
    const gr = zeitraumGrenzen(a, Z.kundenZeitraum);
    // Kanäle für die Chips aus allen Zeilen; mit Kanal-Filter zählt je Kunde nur, was über diesen Kanal lief
    const kanaele = H.zeitraumAuswerten(a.zeilen, gr.von, gr.bis).kanaele.map((k) => k.kanal);
    if (Z.kundenKanal && kanaele.indexOf(Z.kundenKanal) < 0) Z.kundenKanal = '';
    const basis = Z.kundenKanal ? a.zeilen.filter((x) => x.kanal === Z.kundenKanal) : a.zeilen;
    const z = H.zeitraumAuswerten(basis, gr.von, gr.bis);
    const vorher = Object.create(null);
    const jetzt = Object.create(null);
    if (gr.vgl) {
      H.zeitraumAuswerten(basis, gr.vgl.vonVor, gr.vgl.bisVor).kunden.forEach((k) => { vorher[k.schluessel] = k.flaschen; });
      H.zeitraumAuswerten(basis, gr.vgl.von, gr.vgl.bis).kunden.forEach((k) => { jetzt[k.schluessel] = k.flaschen; });
    }
    const neu = Z.kundenZeitraum !== 'gesamt' ? z.kunden.filter((k) => k.erster >= gr.von).length : 0;
    return { gr: gr, z: z, kanaele: kanaele, vorher: gr.vgl ? vorher : null, jetzt: jetzt, neuAb: neu > 0 && neu < z.kunden.length ? gr.von : null,
      letzte: H.letzteBestellungen(a.zeilen, a.heute) };
  }

  /** Nur die Liste neu zeichnen (Suche, Sortierung, Kanal, „alle zeigen“). */
  function kundenListeZeigen(a, d) {
    const ziel = S.el('kunden-liste');
    if (!ziel) return;
    const suche = H.kundeSchluessel(Z.kundenSuche);
    let liste = d.z.kunden.filter((k) => !suche || k.schluessel.indexOf(suche) >= 0); // Kanal ist schon in kundenDaten gefiltert
    const rang = Object.create(null);
    d.z.kunden.forEach((k, i) => { rang[k.schluessel] = i + 1; });
    if (Z.kundenSortierung === 'zuletzt') {
      const tag = (k) => (d.letzte[k.schluessel] ? -d.letzte[k.schluessel].tage : -1e9);
      liste = liste.slice().sort((x, y) => tag(y) - tag(x) || y.flaschen - x.flaschen);
    } else if (Z.kundenSortierung === 'name') {
      liste = liste.slice().sort((x, y) => x.kunde.localeCompare(y.kunde, 'de'));
    }
    const summe = liste.reduce((x, k) => x + k.flaschen, 0);
    const alle = !!Z.alleKunden || !!suche;
    const zeigen = alle ? liste : liste.slice(0, KUNDEN_ANFANG);
    S.fuellen(ziel,
      h('p', { class: 'zeitraum-text', role: 'status', text: liste.length + (liste.length === 1 ? ' Kunde' : ' Kunden') + ' · ' + flaschen(summe) }),
      liste.length
        ? h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste rangliste', role: 'list' }, zeigen.map((k) => {
          const l = d.letzte[k.schluessel];
          const neu = d.neuAb && k.erster >= d.neuAb;
          const p = d.vorher && d.vorher[k.schluessel] > 0 ? H.veraenderung(d.jetzt[k.schluessel] || 0, d.vorher[k.schluessel]) : null;
          return h('li', { class: 'rang-zeile kunde-zeile' },
            h('button', { type: 'button', class: 'zeilen-knopf', 'data-kunde': k.schluessel, onclick: () => S.kundeZeigen(k.schluessel),
              'aria-label': k.kunde + ', ' + flaschen(k.flaschen) + ', ' + H.euroFormat(k.umsatz) + (l ? ', zuletzt ' + H.wannText(l) : '') + '. Details' },
            Z.kundenSortierung === 'menge' && !suche
              ? h('span', { class: 'rang-nr' + (rang[k.schluessel] <= 3 ? ' vorne' : ''), text: String(rang[k.schluessel]), 'aria-hidden': 'true' }) : null,
            h('span', { class: 'rang-name' }, h('span', { class: 'rang-titel kunde-name', text: k.kunde }),
              h('span', { class: 'rang-unter' }, [k.kanal, l ? H.abstandText(l.tage) : ''].filter(Boolean).join(' · '),
                neu ? h('span', { class: 'badge badge-neu', text: 'neu' }) : null)),
            h('span', { class: 'rang-zahlen' }, h('span', { class: 'rang-flaschen', text: flaschen(k.flaschen) }),
              p !== null ? trendChip({ prozent: p }, '') : h('span', { class: 'rang-umsatz', text: H.euroFormat(k.umsatz) })),
            h('span', { class: 'chevron klein', 'aria-hidden': 'true', text: '›' })));
        })))
        : h('div', { class: 'karte' }, h('p', { class: 'leer', text: suche ? 'Kein Kunde passt zu „' + Z.kundenSuche + '“.' : 'Keine Verkäufe in diesem Zeitraum.' })),
      !alle && liste.length > KUNDEN_ANFANG
        ? h('button', { type: 'button', class: 'knopf mehr-knopf', text: 'Alle ' + liste.length + ' Kunden zeigen',
          onclick: () => { Z.alleKunden = true; kundenListeZeigen(a, d); } })
        : null,
      d.vorher ? h('p', { class: 'hinweis liste-fuss', text: 'Prozent: ' + d.gr.vgl.text + ' (volle Monate).' }) : null);
  }

  S.ansichten.kunden = function () {
    const ziel = leeren('kunden-inhalt');
    const u = Z.daten;
    if (!u) return platzhalter(ziel, ['segment', 'zeile', 'zeile', 'zeile']);
    const a = auswertung();
    if (['jahr', 'vorjahr', 'gesamt'].indexOf(Z.kundenZeitraum) < 0) Z.kundenZeitraum = 'jahr';
    const umschalten = umschalter('Kunden-Zeitraum', [['jahr', 'Dieses Jahr'], ['vorjahr', 'Vorjahr'], ['gesamt', 'Gesamt']], Z.kundenZeitraum,
      (w) => { Z.kundenZeitraum = w; Z.alleKunden = false; S.ansichten.kunden(); });
    if (!a.zeilen) {
      // Ältere Schnittstelle: nur die Top 10 wie geliefert
      const z = u.verkaeufe[Z.kundenZeitraum];
      return S.fuellen(ziel, umschalten,
        h('p', { class: 'notiz' }, S.icon('info', 'notiz-icon'), h('span', { text: 'Suche, alle Kunden und Kunden-Details kommen mit dem nächsten Update der Schnittstelle.' })),
        h('h3', { class: 'gruppe', text: 'Top 10' }),
        rangliste(z.kunden.map((x) => ({ name: x.kunde, flaschen: x.flaschen, umsatz: x.umsatz })), false, true));
    }
    const d = kundenDaten(a);
    const kanaele = d.kanaele;
    const suche = h('input', { type: 'search', id: 'kunden-suche', class: 'suche', placeholder: 'Kunde suchen', autocomplete: 'off', autocorrect: 'off',
      spellcheck: 'false', enterkeyhint: 'search', 'aria-label': 'Kunde suchen', value: Z.kundenSuche || '' });
    suche.addEventListener('input', () => { Z.kundenSuche = suche.value; kundenListeZeigen(a, d); });
    const chips = h('div', { class: 'filter-chips', role: 'group', 'aria-label': 'Nach Kanal filtern' },
      [''].concat(kanaele).map((k) => h('button', { type: 'button', class: 'chip', 'aria-pressed': (Z.kundenKanal || '') === k ? 'true' : 'false', text: k || 'Alle',
        'data-kanal': k, onclick: () => {
          Z.kundenKanal = k;
          Z.alleKunden = false;
          S.ansichten.kunden();
          // Die Ansicht ist neu gebaut: Fokus zurück auf denselben Chip (Tastatur, VoiceOver)
          const neu = Array.from(document.querySelectorAll('#kunden-inhalt .filter-chips .chip')).find((x) => x.getAttribute('data-kanal') === k);
          if (neu) neu.focus({ preventScroll: true });
        } })));
    S.fuellen(ziel,
      nachfassenKarte(a),
      h('h2', {}, h('strong', { text: 'Alle' }), ' Kunden'),
      umschalten,
      h('div', { class: 'such-zeile' }, suche,
        h('label', { class: 'nur-vorlesen', for: 'kunden-sortierung', text: 'Sortieren nach' }),
        h('select', { id: 'kunden-sortierung', class: 'sortierung', onchange: (ev) => { Z.kundenSortierung = ev.currentTarget.value; kundenListeZeigen(a, d); } },
          [['menge', 'Meiste Flaschen'], ['zuletzt', 'Zuletzt bestellt'], ['name', 'A–Z']].map(([w, t]) => h('option', { value: w, text: t })))),
      chips,
      h('div', { id: 'kunden-liste' }));
    S.el('kunden-sortierung').value = Z.kundenSortierung || 'menge';
    kundenListeZeigen(a, d);
  };

  // Kunden-Details (Blatt von unten) ----------------------------------------------------------------------------

  /** Kleines Balkendiagramm (Kunden-Blatt): Flaschen der Monate, Gutschrift-Monate rot unter der Nulllinie. */
  function miniDiagramm(monate) {
    const M = { breite: 320, hoehe: 96, links: 4, unten: 16, oben: 14 };
    const r = H.achseMitMinus(monate.map((m) => m.flaschen), 2);
    const flaeche = M.hoehe - M.oben - M.unten;
    const unten = M.oben + flaeche;
    const y = (w) => M.oben + ((r.oben - w) / (r.oben - r.unten)) * flaeche;
    const null0 = Math.round(y(0) * 100) / 100;
    const rund = (z) => Math.round(z * 100) / 100;
    const platz = (M.breite - M.links) / monate.length;
    const bb = Math.min(14, platz - 6);
    const svg = s('svg', { viewBox: '0 0 ' + M.breite + ' ' + M.hoehe, class: 'diagramm mini', 'aria-hidden': 'true', focusable: 'false' });
    svg.append(s('line', { x1: M.links, x2: M.breite, y1: null0, y2: null0, class: 'achse' }));
    monate.forEach((m, i) => {
      const mitte = M.links + (i + 0.5) * platz;
      const w = typeof m.flaschen === 'number' && isFinite(m.flaschen) ? m.flaschen : 0;
      const yy = y(w);
      const hh = Math.abs(null0 - yy);
      const letzter = i === monate.length - 1;
      if (hh > 0.5) {
        svg.append(s('rect', { x: rund(mitte - bb / 2), y: rund(Math.min(yy, null0)), width: bb, height: rund(hh),
          rx: Math.min(3, hh / 2), class: (letzter ? 'balken-laufend' : 'balken-dieses') + (w < 0 ? ' negativ' : '') }));
        svg.append(s('text', { x: mitte, y: rund(w < 0 ? Math.min(null0 + hh + 9, unten - 1) : Math.max(yy - 4, 9)), 'text-anchor': 'middle',
          class: 'mini-wert', text: (w < 0 ? '−' : '') + H.achsenText(Math.round(Math.abs(w))) }));
      }
      if (i % 3 === 0 || letzter) svg.append(s('text', { x: mitte, y: unten + 12, 'text-anchor': 'middle', class: 'monat', text: H.monatFormat(m.monat) }));
    });
    return svg;
  }

  S.kundeZeigen = function (schluessel) {
    const a = auswertung();
    const d = a && a.zeilen ? H.kundeDetails(a.zeilen, schluessel, a.heute) : null;
    if (!d) return;
    const her = d.letzte ? H.tageZwischen(d.letzte.datum || zeilenEnde(d.letzte.monat), a.heute) : null;
    const summe = (label, x) => h('div', { class: 'blatt-zahl' }, h('p', { class: 'kachel-label', text: label }),
      h('p', { class: 'blatt-wert', text: H.zahlFormat(x.flaschen, 0) }), h('p', { class: 'kachel-zusatz', text: x.flaschen === 1 ? 'Flasche' : 'Flaschen' }),
      h('p', { class: 'kachel-zusatz blatt-euro', text: H.euroFormat(x.umsatz) }));
    const fakten = [
      ['Bestellungen', String(d.bestellungen)],
      ['Ø pro Bestellung', d.proBestellung === null ? '–' : flaschen(d.proBestellung)],
      ['Letzte Bestellung', H.wannText(d.letzte) + (her !== null && her >= 0 ? ' · ' + H.abstandText(her) : '')],
      ['Kunde seit', H.wannText(d.erste)],
    ];
    // Nach dem Schließen zurück auf den Knopf dieses Kunden, auch wenn die Liste inzwischen neu gebaut wurde
    const zurueck = () => Array.from(document.querySelectorAll('#app [data-kunde]')).find((x) => x.dataset.kunde === schluessel) || null;
    S.blattZeigen(d.kunde, [
      h('p', { class: 'blatt-unter', text: d.kanaele.join(', ') }),
      h('div', { class: 'blatt-zahlen' }, summe('Dieses Jahr', d.jahr), summe('Vorjahr', d.vorjahr), summe('Gesamt', d.gesamt)),
      h('p', { class: 'blatt-titel-klein', text: 'Flaschen, letzte 13 Monate' }),
      miniDiagramm(d.monate),
      h('dl', { class: 'fakten' }, fakten.map(([k, w]) => h('div', { class: 'fakt' }, h('dt', { text: k }), h('dd', { text: w })))),
      h('p', { class: 'blatt-titel-klein', text: 'Letzte Bestellungen' }),
      h('ul', { class: 'liste blatt-liste', role: 'list' }, d.liste.map((x) => h('li', { class: 'zeile' },
        h('span', { text: H.wannText(x) }),
        h('span', {}, h('strong', { text: flaschen(x.flaschen) }), h('span', { class: 'zeile-leise', text: ' · ' + H.euroFormat(x.umsatz) }))))),
    ], zurueck);
  };
  function zeilenEnde(monat) {
    return H.tagePlus(H.monatPlus(monat, 1) + '-01', -1);
  }

  // Lager -------------------------------------------------------------------------------------------------------
  // Seit 2026-11-09: Karte „Bestand gesamt“ (geschätzt/gezählt, wie viele Lager gezählt, Verteilung), im Dezember und
  // Januar „Jahresinventur zum 31.12.“, pro Standort „So kommt die Zahl zustande“, Abfüllungen als Liste.

  function schwundText(l) {
    if (l.schwund === null) return 'Schwund: erst ab der zweiten Inventur';
    if (l.schwund === 0) return 'Kein Schwund seit der Inventur davor';
    if (l.schwund < 0) return flaschen(-l.schwund) + ' mehr gezählt als erwartet';
    return 'Schwund seit der Inventur davor: ' + flaschen(l.schwund);
  }

  /** Aus dem Lager in „Eintragen“ springen: Art Inventur, Standort (und ggf. Datum) vorgewählt, Ansicht oben. */
  function inventurStarten(standort, datum) {
    if (!S.eintragenVorbelegen || !S.eintragenVorbelegen('Inventur', standort, datum)) return;
    S.ansichtZeigen('eintragen');
    S.nachOben('eintragen');
  }

  /** Vorzeichen und Betrag: (+12) → „+ 12“, (−5) → „− 5“. */
  function mitZeichen(z) {
    return (z < 0 ? '− ' : '+ ') + H.zahlFormat(Math.abs(z), 0);
  }

  /** „So kommt die Zahl zustande“: gezählt, Verkäufe, Zugänge und Abgänge seit der Inventur, Bestand jetzt. */
  function rechenweg(l) {
    const s = l.seitInventur;
    if (!s || typeof l.gezaehlt !== 'number' || typeof l.bestand !== 'number') return null;
    const zeilen = [];
    if (s.verkauft) zeilen.push(['Verkauft seitdem', -s.verkauft]);
    if (s.zugaenge) zeilen.push(['Zugänge (Abfüllung, Umlagerung)', s.zugaenge]);
    if (s.abgaenge) zeilen.push(['Abgänge (Promo, Bruch, Umlagerung …)', -s.abgaenge]);
    if (!zeilen.length) return h('p', { class: 'kachel-zusatz rechenweg-leer', text: 'Seit der Inventur keine Verkäufe und keine Bewegungen.' });
    return h('dl', { class: 'rechenweg' },
      h('div', { class: 'rw-zeile' }, h('dt', { text: 'Gezählt am ' + H.datumKurz(l.letzteInventur) }), h('dd', { text: H.zahlFormat(l.gezaehlt, 0) })),
      zeilen.map(([text, wert]) => h('div', { class: 'rw-zeile' }, h('dt', { text: text }), h('dd', { text: mitZeichen(wert) }))),
      h('div', { class: 'rw-zeile rw-summe' }, h('dt', { text: 'Bestand jetzt' }), h('dd', { text: '= ' + H.zahlFormat(l.bestand, 0) })));
  }

  /** Lager als Liste (seit v23): Name, Inventur bzw. „noch nicht gezählt“, Bestand; antippen öffnet das Lager-Blatt. */
  function lagerListe(u) {
    const pk = u.kennzahlen ? u.kennzahlen.flaschenProKiste : null;
    return h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste', role: 'list' }, u.lager.map((l) => {
      const kisten = H.kistenKurz(l.bestand, pk, false);
      return h('li', { class: 'kunde-zeile' },
        h('button', { type: 'button', class: 'zeilen-knopf', 'data-lager': l.standort, onclick: () => lagerZeigen(l.standort),
          'aria-label': l.standort + (l.bestand === null ? ', noch nicht gezählt' : ', ' + flaschen(l.bestand)) + '. Details' },
        h('span', { class: 'rang-name' }, h('span', { class: 'rang-titel', text: l.standort }),
          h('span', { class: 'rang-unter', text: l.bestand === null ? 'noch nicht gezählt' : 'Inventur ' + H.datumKurz(l.letzteInventur) + (kisten ? ' · ' + kisten : '') })),
        l.bestand === null
          ? h('span', { class: 'badge badge-zaehlen', text: 'zählen' })
          : h('span', { class: 'rang-zahlen' }, h('span', { class: 'rang-flaschen', text: flaschen(l.bestand) })),
        h('span', { class: 'chevron klein', 'aria-hidden': 'true', text: '›' })));
    })));
  }

  /** Eine Buchung kurz für Listen in Blättern: Art · Menge, darunter Weg/Datum/wer. */
  function buchungZeile(e) {
    return h('li', { class: 'aktiv-zeile' + (e.storniert ? ' storniert' : '') },
      h('span', { class: 'verlauf-icon' }, S.icon(ART_ICON[e.art] || 'info')),
      h('span', { class: 'aktiv-text' }, h('span', { class: 'aktiv-titel' }, e.art || '?', e.storniert ? h('span', { class: 'badge badge-storno', text: 'storniert' }) : null),
        h('span', { class: 'nebenzeile', text: [e.art === 'Umlagerung' ? e.standort + ' → ' + (e.nach || '?') : '', H.datumKurz(e.datum), e.wer ? 'von ' + e.wer : '']
          .filter(Boolean).join(' · ') })),
      typeof e.flaschen === 'number' ? h('span', { class: 'aktiv-wert', text: H.zahlFormat(e.flaschen, 0) + ' Fl.' }) : null);
  }

  /** Lager-Blatt: Bestand, letzte Inventur, Schwund, Rechenweg, Knöpfe „Neu zählen“/„Umlagerung von hier“, letzte Buchungen. */
  function lagerZeigen(standort) {
    const l = Z.daten ? Z.daten.lager.find((x) => x.standort === standort) : null;
    if (!l) return;
    const pk = Z.daten.kennzahlen ? Z.daten.kennzahlen.flaschenProKiste : null;
    const buchungen = (Z.verlauf ? H.verlaufOhneStorno(Z.verlauf.eintraege) : []).filter((e) => e.standort === standort || e.nach === standort).slice(0, 6);
    const eintragen = (art) => {
      S.blattSchliessen();
      if (!S.eintragenVorbelegen || !S.eintragenVorbelegen(art, standort)) return;
      S.ansichtZeigen('eintragen');
      S.nachOben('eintragen');
    };
    const zahl = (label, wert, zusatz) => h('div', { class: 'blatt-zahl' }, h('p', { class: 'kachel-label', text: label }),
      h('p', { class: 'blatt-wert', text: wert }), zusatz ? h('p', { class: 'kachel-zusatz', text: zusatz }) : null);
    S.blattZeigen(standort, [
      l.bestand === null
        ? h('p', { class: 'blatt-unter', text: 'Noch nicht gezählt. Einmal zählen und als Inventur eintragen, dann rechnet die App hier den Bestand.' })
        : [h('div', { class: 'blatt-zahlen zwei' }, zahl('Bestand', H.zahlFormat(l.bestand, 0), 'Flaschen' + (H.kistenKurz(l.bestand, pk, false) ? ' · ' + H.kistenKurz(l.bestand, pk, false) : '')),
          zahl('Letzte Inventur', H.datumText(l.letzteInventur), schwundText(l))),
        rechenweg(l)],
      h('div', { class: 'blatt-knoepfe' },
        h('button', { type: 'button', class: 'knopf haupt', text: l.bestand === null ? 'Inventur eintragen' : 'Neu zählen', onclick: () => eintragen('Inventur') }),
        l.bestand === null ? null : h('button', { type: 'button', class: 'knopf', text: 'Umlagerung von hier', onclick: () => eintragen('Umlagerung') })),
      buchungen.length ? [h('p', { class: 'blatt-titel-klein', text: 'Letzte Buchungen' }), h('ul', { class: 'liste blatt-liste', role: 'list' }, buchungen.map(buchungZeile))] : null,
    ], () => Array.from(document.querySelectorAll('#app [data-lager]')).find((x) => x.dataset.lager === standort) || null);
  }

  /** Anteile der gezählten Lager als ein geteilter Balken mit Legende (ab zwei Lagern mit Bestand). */
  function verteilung(lager) {
    if (!H.anteileSinnvoll(lager)) return null;
    const mit = lager.filter((l) => typeof l.bestand === 'number' && l.bestand > 0);
    const summe = mit.reduce((x, l) => x + l.bestand, 0);
    return h('div', { class: 'verteilung' },
      h('div', { class: 'verteilung-balken', 'aria-hidden': 'true' }, mit.map((l, i) => prozent(h('span', { class: 'vt-teil vt-' + (i % 4) }), (l.bestand / summe) * 100))),
      h('ul', { class: 'verteilung-legende', role: 'list' }, mit.map((l, i) => h('li', {},
        h('span', { class: 'vt-punkt vt-' + (i % 4), 'aria-hidden': 'true' }), l.standort,
        h('span', { class: 'vt-wert', text: ' ' + H.zahlFormat((l.bestand / summe) * 100, 0) + ' %' })))));
  }

  /** Karte „Bestand gesamt“: Zahl, ob geschätzt oder gezählt, wie viele Lager gezählt sind, Verteilung. */
  function gesamtKarte(u) {
    const k = u.kennzahlen;
    const geschaetzt = k.gesamtQuelle !== 'inventur';
    const n = u.lager.length;
    const gezaehlt = u.lager.filter((l) => l.bestand !== null).length;
    const zahl = (x) => typeof x === 'number' && isFinite(x);
    const formel = geschaetzt && zahl(k.abgefuellt) && zahl(k.verkauft) && zahl(k.bestandRechnerisch) &&
      Math.abs(k.abgefuellt - k.verkauft - k.bestandRechnerisch) < 1;
    return h('section', { class: 'karte gesamt-karte', 'aria-label': 'Bestand gesamt' },
      h('div', { class: 'karte-kopf' }, h('p', { class: 'kachel-label', text: 'Bestand gesamt' }),
        h('span', { class: 'badge' + (geschaetzt ? '' : ' badge-gut'), text: geschaetzt ? 'geschätzt' : 'gezählt' })),
      grosseZahl('info-wert', k.gesamtbestand, 'flaschen'),
      formel
        ? h('p', { class: 'kachel-zusatz', text: 'Abgefüllt ' + H.zahlFormat(k.abgefuellt, 0) + ' minus verkauft ' + H.zahlFormat(k.verkauft, 0) +
          '. Promo, Eigenverbrauch und Bruch fehlen darin, den echten Bestand zeigt die Inventur.' })
        : geschaetzt ? h('p', { class: 'kachel-zusatz', text: 'Aus Abfüllungen minus Verkäufe – den echten Bestand zeigt die Inventur.' }) : null,
      n ? h('div', { class: 'inventur-stand' },
        h('div', { class: 'inventur-schritte', 'aria-hidden': 'true' }, u.lager.map((l) => h('span', { class: 'schritt-punkt' + (l.bestand !== null ? ' fertig' : '') }))),
        h('p', { class: 'kachel-zusatz', text: gezaehlt + ' von ' + n + (n === 1 ? ' Lager' : ' Lagern') + ' gezählt' +
          (gezaehlt === n ? ', der Bestand ist echt.' : '.') })) : null,
      verteilung(u.lager));
  }

  /**
   * Dezember und Januar: Karte „Jahresinventur zum 31.12.“ – welche Lager haben eine Inventur genau mit Datum 31.12.
   * (H.inventurAm, auch wenn danach nochmal gezählt wurde)? Knopf trägt ab dem 31.12. gleich dieses Datum ein.
   */
  function jahresinventurKarte(u, heute) {
    const stichtag = H.jahresStichtag(heute);
    if (!stichtag) return null;
    const jahr = stichtag.slice(0, 4);
    const fertig = (l) => !!H.inventurAm(l, stichtag);
    const erledigt = u.lager.filter(fertig).length;
    const datum = heute >= stichtag ? stichtag : null;
    return h('section', { class: 'karte jahresinventur', 'aria-label': 'Jahresinventur' },
      h('div', { class: 'karte-kopf' }, h('h3', { text: 'Jahresinventur zum 31.12.' + jahr }),
        h('span', { class: 'badge' + (erledigt === u.lager.length ? ' badge-gut' : ''), text: erledigt + ' von ' + u.lager.length })),
      h('p', { class: 'kachel-zusatz', text: erledigt === u.lager.length
        ? 'Alle Lager sind gezählt. Danke! Der Bestand für den Jahresabschluss steht.'
        : 'Jedes Lager zählen und als Inventur mit Datum 31.12.' + jahr + ' eintragen' + (datum ? '' : ' (geht ab dem 31.12.)') + '.' }),
      h('ul', { class: 'liste', role: 'list' }, u.lager.map((l) => h('li', { class: 'offen-zeile' },
        h('span', { class: 'zeile-name' }, h('span', { class: 'haken' + (fertig(l) ? ' fertig' : ''), 'aria-hidden': 'true', text: fertig(l) ? '✓' : '' }),
          l.standort, fertig(l) ? h('span', { class: 'nur-vorlesen', text: ': gezählt' }) : null),
        fertig(l)
          ? h('span', { class: 'zeile-leise', text: flaschen(H.inventurAm(l, stichtag).flaschen) })
          : h('button', { type: 'button', class: 'knopf klein', text: datum ? 'Eintragen' : 'ab 31.12.', disabled: !datum,
            'aria-label': datum ? 'Jahresinventur eintragen: ' + l.standort : 'Jahresinventur ' + l.standort + ': eintragen ab dem 31.12.',
            onclick: () => inventurStarten(l.standort, datum) })))));
  }

  /** Abfüllungen (Tab Abfüllungen), neueste zuerst, darunter die Summe. */
  function abfuellungenZeigen() {
    const ziel = leeren('abfuellungen-inhalt');
    const u = Z.daten;
    const liste = u && Array.isArray(u.abfuellungen) ? u.abfuellungen.filter((a) => a && typeof a.flaschen === 'number' && isFinite(a.flaschen)) : [];
    if (!liste.length) return;
    const summe = liste.reduce((x, a) => x + a.flaschen, 0);
    const sortiert = liste.slice().sort((a, b) => ((b.monat || '') < (a.monat || '') ? -1 : (b.monat || '') > (a.monat || '') ? 1 : 0));
    ziel.append(ueberschrift('h2', 'Abfüllungen'),
      h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste', role: 'list' }, sortiert.map((a) => h('li', { class: 'zeile' },
        h('span', { class: 'zeile-name' }, String(a.abfuellung || 'Abfüllung'),
          h('span', { class: 'zeile-unter', text: a.monat ? H.monatFormat(a.monat, true) : 'Monat unbekannt' })),
        h('span', { class: 'zeile-wert', text: flaschen(a.flaschen) }))))),
      h('p', { class: 'hinweis liste-fuss', text: 'Zusammen ' + flaschen(summe) + ' abgefüllt.' }));
  }

  const VERLAUF_ANFANG = 10;
  const VERLAUF_SERVER_MAX = 30; // so viele Zeilen schickt die Aktion `verlauf` höchstens (api/src/Konfig.js VERLAUF_ANZAHL)

  /** Eine Zeile im Verlauf in Worten, z. B. „48 Flaschen: Lager Süd → Lager Nord“. */
  function verlaufText(e) {
    const fl = typeof e.flaschen === 'number' ? flaschen(e.flaschen) : '';
    if (e.art === 'Storno') return e.kommentar || ('Storno ' + (e.stornoVon || ''));
    if (e.art === 'Umlagerung') return fl + ': ' + e.standort + ' → ' + (e.nach || '?');
    return fl + (fl ? ' · ' : '') + e.standort;
  }

  async function stornieren(e, knopf) {
    const was = e.art + ', ' + verlaufText(e) + ', ' + H.datumFormat(e.datum);
    const ja = await S.frage('Diesen Eintrag stornieren?\n\n' + was +
      '\n\nEr bleibt im Lager-Log stehen, eine Storno-Zeile hebt ihn auf.', 'Stornieren', 'Abbrechen');
    if (!ja) return;
    knopf.disabled = true;
    knopf.textContent = 'Storniert …';
    const r = await S.schreiben('stornieren', { id: e.id });
    if (r.art === 'ok') {
      S.melden(r.daten.wiederholt ? 'War schon storniert.' : 'Storniert: ' + was, false, r.daten.hinweise);
      S.verlaufLaden();
    } else {
      if (r.art === 'fehler') S.melden(r.meldung, true);
      S.ansichten.lager();
    }
  }

  function verlaufZeigen() {
    const ziel = leeren('verlauf-inhalt');
    const v = Z.verlauf;
    if (Z.verlaufLaedt && !v) return ziel.append(skelett(['zeile', 'zeile', 'zeile']));
    if (Z.verlaufLaedt) ziel.append(h('p', { class: 'status-zeile laedt', text: 'Lädt neu …' }));
    if (Z.verlaufFehler) ziel.append(h('p', { class: 'fehler', text: 'Verlauf nicht geladen: ' + Z.verlaufFehler }));
    if (!v) return ziel.append(h('button', { type: 'button', class: 'knopf', text: 'Verlauf laden', onclick: () => S.verlaufLaden() }));
    // Storno-Gegenzeilen nicht als eigene Einträge: das Original trägt „storniert“
    const liste = H.verlaufOhneStorno(v.eintraege);
    if (!liste.length) {
      // Der Server schickt die letzten 30 Zeilen; bestehen sie nur aus Stornos, stehen die Originale weiter oben im Lager-Log
      return ziel.append(v.eintraege.length
        ? leerKarte('Zuletzt nur Stornos', 'Die stornierten Einträge sind älter und stehen im Sheet (Tab Lager-Log).')
        : leerKarte('Noch nichts eingetragen', 'Sobald jemand etwas unter „Eintragen“ speichert, steht es hier.'));
    }
    const alle = !!Z.verlaufAlle;
    const zeigen = alle ? liste : liste.slice(0, VERLAUF_ANFANG);
    ziel.append(h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste verlauf', role: 'list' }, zeigen.map((e) => h('li', {
      class: 'verlauf-zeile' + (e.storniert ? ' storniert' : ''),
    },
      h('span', { class: 'verlauf-icon' }, S.icon(ART_ICON[e.art] || 'info')),
      h('div', { class: 'verlauf-mitte' },
        h('p', { class: 'verlauf-kopf' },
          h('strong', { class: 'verlauf-art', text: e.art || '?' }),
          e.storniert ? h('span', { class: 'badge badge-storno', text: 'storniert' }) : null),
        h('p', { class: 'eintrag-text', text: verlaufText(e) }),
        // Datum, wer und Kommentar in einer leisen Zeile
        h('p', { class: 'nebenzeile', text: [H.datumKurz(e.datum), e.wer ? 'von ' + e.wer : '', e.kommentar ? '„' + e.kommentar + '“' : '']
          .filter(Boolean).join(' · ') })),
      e.stornierbar && e.id ? h('button', {
        type: 'button', class: 'knopf klein storno-knopf', text: 'Storno', 'aria-label': 'Storno: ' + e.art + ' ' + verlaufText(e),
        onclick: (ev) => stornieren(e, ev.currentTarget),
      }) : null)))));
    if (liste.length > VERLAUF_ANFANG) {
      ziel.append(h('button', { type: 'button', class: 'knopf mehr-knopf', 'aria-expanded': alle ? 'true' : 'false',
        text: alle ? 'Weniger zeigen' : 'Alle ' + liste.length + ' Einträge zeigen', onclick: () => { Z.verlaufAlle = !alle; verlaufZeigen(); } }));
    }
    const voll = v.eintraege.length >= VERLAUF_SERVER_MAX; // dann gibt es vermutlich ältere Zeilen
    ziel.append(h('p', { class: 'hinweis liste-fuss', text: (zeigen.length === 1 ? 'Der letzte Eintrag.' : 'Die letzten ' + zeigen.length + ' Einträge, neueste zuerst.') +
      (voll ? ' Ältere stehen im Sheet (Tab Lager-Log).' : '') }));
  }

  async function zuordnen(r, standort, auswahl) {
    auswahl.disabled = true;
    const e = await S.schreiben('verkaufStandort', { rechnung: r.rechnung, standort: standort });
    if (e.art === 'ok') {
      S.melden('Rechnung ' + r.rechnung + ': ' + (standort ? 'zählt jetzt bei ' + standort : 'zählt wieder beim Standard-Standort') + '.',
        false, (e.daten.hinweise || []).filter((t) => t.indexOf('zählt wieder beim Standard') < 0));
    } else if (e.art === 'fehler') {
      S.melden(e.meldung, true);
    }
    S.ansichten.lager(); // bei Fehler oder Abbruch die alte Auswahl wiederherstellen
  }

  /**
   * Standort einer Rechnung als kleines tappbares Feld (natives <select>, sieht aus wie eine Pille). Ohne eigene Zuordnung
   * zeigt es den Standard-Standort grau; gewählte Standorte weiß. Option '' = Standard.
   */
  function standortWahl(r, i, orte) {
    const gesetzt = r.standortGesetzt ? r.standort : '';
    const liste = orte.concat(gesetzt && orte.indexOf(gesetzt) < 0 ? [gesetzt] : [])
      .filter((o) => r.standortGesetzt || o !== r.standort); // ohne eigene Zuordnung steht der Standard schon oben
    const auswahl = h('select', { id: 'vk-' + i, class: 'ort-wahl' + (gesetzt ? ' gesetzt' : ''),
      onchange: (ev) => zuordnen(r, ev.currentTarget.value, ev.currentTarget) },
    h('option', { value: '', text: r.standortGesetzt ? 'Standard (zurücksetzen)' : r.standort }),
    liste.map((o) => h('option', { value: o, text: o })));
    auswahl.value = gesetzt;
    if (Z.schreibt) auswahl.disabled = true;
    return auswahl;
  }

  function zuordnenZeigen() {
    const ziel = leeren('zuordnen-inhalt');
    const u = Z.daten;
    if (!u) return; // ohne Daten zeigt schon das Lager oben den leeren Zustand
    const n = u.verkaufListe.length;
    if (!n) {
      return ziel.append(h('h2', { class: 'klapp-h2' }, h('div', { class: 'karte klapp-kopf ohne-pfeil' },
        h('span', { class: 'klapp-text' }, h('span', { class: 'klapp-titel', text: 'Verkäufe zuordnen' }),
          h('span', { class: 'klapp-zusatz', text: 'Keine Rechnungen in den letzten 60 Tagen' })))));
    }
    const offen = !!Z.zuordnenOffen;
    ziel.append(h('h2', { class: 'klapp-h2' }, h('button', {
      type: 'button', id: 'zuordnen-kopf', class: 'karte klapp-kopf', 'aria-expanded': offen ? 'true' : 'false', 'aria-controls': 'zuordnen-liste',
      onclick: () => { Z.zuordnenOffen = !offen; zuordnenZeigen(); S.el('zuordnen-kopf').focus({ preventScroll: true }); },
    },
    h('span', { class: 'klapp-text' }, h('span', { class: 'klapp-titel', text: 'Verkäufe zuordnen' }),
      h('span', { class: 'klapp-zusatz', text: n + (n === 1 ? ' Rechnung' : ' Rechnungen') + ' der letzten 60 Tage' })),
    h('span', { class: 'chevron klapp-pfeil', 'aria-hidden': 'true', text: '›' }))));
    if (!offen) return;
    const orte = standorte();
    ziel.append(h('div', { id: 'zuordnen-liste', class: 'klapp-inhalt' },
      h('p', { class: 'hinweis', text: 'Kamen die Flaschen aus einem anderen Lager? Auf den Standort tippen und ändern. Grau = Standard.' }),
      h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste zuordnen', role: 'list' }, u.verkaufListe.map((r, i) => h('li', { class: 'zuordnen-zeile' },
        h('div', { class: 'zeile' }, h('strong', { class: 'zuordnen-kunde', text: r.kunde }), h('span', { class: 'zeile-wert', text: flaschen(r.flaschen) })),
        h('div', { class: 'zuordnen-unten' },
          h('span', { class: 'nebenzeile', text: r.rechnung + ' · ' + H.datumKurz(r.datum) }),
          // Beschriftung nur für Vorleseprogramme, sichtbar stehen Rechnung und Kunde schon daneben
          h('label', { for: 'vk-' + i, class: 'nur-vorlesen', text: 'Standort für Rechnung ' + r.rechnung + ', ' + r.kunde }),
          standortWahl(r, i, orte)),
        r.gemischt ? h('p', { class: 'nebenzeile warnung', text: 'Achtung: Teile dieser Rechnung zählen bei verschiedenen Standorten.' }) : null))))));
  }

  /** Vom Start („Alle Buchungen“) direkt zum Verlauf im Lager. */
  S.verlaufZeigenOben = function () {
    const ziel = S.el('verlauf-anker');
    if (ziel) setTimeout(() => ziel.scrollIntoView({ block: 'start', behavior: 'smooth' }), 350);
  };

  S.ansichten.lager = function () {
    const ziel = leeren('lager-inhalt');
    if (!Z.daten) platzhalter(ziel, ['gross', 'gross']);
    else {
      // Seit v23: Gesamt-Karte, im Dezember/Januar die Jahresinventur, dann die Lager als Liste (Details im Blatt)
      S.fuellen(ziel, gesamtKarte(Z.daten), jahresinventurKarte(Z.daten, auswertung().heute),
        h('h2', {}, h('strong', { text: 'Lager' })), lagerListe(Z.daten));
    }
    verlaufZeigen();
    abfuellungenZeigen();
    zuordnenZeigen();
  };
})();
