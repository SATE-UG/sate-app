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

  /** Trend-Zeile für einen Monat (Vormonat, Vorjahresmonat). Laufender Monat: nur Hinweis, kein unfairer Vergleich. */
  function trendZeile(t) {
    if (!t) return null;
    if (t.laufend) return h('p', { class: 'trend-zeile trend-hinweis', text: 'Bisher, Stand bis heute. Vergleich, sobald der Monat vorbei ist.' });
    const chips = [];
    if (t.vormonat) chips.push(trendChip(t.vormonat, 'zum Vormonat (' + H.monatFormat(t.vormonat.monat) + ')'));
    if (t.vorjahr) chips.push(trendChip(t.vorjahr, 'zum Vorjahresmonat'));
    if (!chips.length) return h('p', { class: 'trend-zeile trend-hinweis', text: 'Kein Vergleich möglich (Vergleichsmonat ohne Verkäufe oder nicht in den Daten).' });
    return h('p', { class: 'trend-zeile' }, chips);
  }

  // Übersicht ---------------------------------------------------------------------------------------------------

  /**
   * Zeitstrahl in der Bestell-Karte: Heute → Spätestens bestellen → Leer (nach Datum geordnet, gleich verteilt), auf den
   * Strecken dazwischen die Dauer. Vor dem Bestelltermin ist die erste Strecke hell, danach (überfällig) gelb.
   */
  function zeitstrahl(b, heute) {
    if (!H.datumGueltig(b.leerAm) || !H.datumGueltig(b.spaetestensBestellen) || !H.datumGueltig(heute)) return null;
    const punkte = [
      { art: 'heute', name: 'Heute', datum: heute },
      { art: 'bestellen', name: 'Bestellen', datum: b.spaetestensBestellen },
      { art: 'leer', name: 'Leer', datum: b.leerAm },
    ].sort((x, y) => (x.datum < y.datum ? -1 : x.datum > y.datum ? 1 : (x.art === 'heute' ? -1 : 1)));
    const strecken = [0, 1].map((i) => {
      const von = punkte[i];
      const bis = punkte[i + 1];
      const tage = H.tageZwischen(von.datum, bis.datum);
      const klasse = von.art === 'heute' ? 'strecke-jetzt' : bis.art === 'heute' ? 'strecke-vorbei' : 'strecke-vorlauf';
      return { klasse: klasse, text: H.dauerText(tage) };
    });
    return h('div', { class: 'zeitstrahl', 'aria-hidden': 'true' },
      h('div', { class: 'zeitstrahl-linie' },
        punkte.map((p, i) => [
          h('span', { class: 'zs-punkt zs-' + p.art }),
          i < 2 ? h('span', { class: 'zs-strecke ' + strecken[i].klasse }, h('span', { class: 'zs-dauer', text: strecken[i].text })) : null,
        ])),
      h('div', { class: 'zeitstrahl-namen' }, punkte.map((p) => h('span', { class: 'zs-name zs-name-' + p.art },
        h('strong', { text: p.name }), h('span', { text: H.datumKurz(p.datum) })))));
  }

  /** Monate vor dem Diagramm-Zeitraum (für den Vorjahresmonat), fehlt bei älteren Server-Versionen. */
  function vergleichsmonate() {
    const v = Z.daten && Z.daten.verkaeufe ? Z.daten.verkaeufe.vergleichsmonate : null;
    return Array.isArray(v) ? v : null;
  }

  /** Kleine Balken (Sparkline) der Monate, Monat `i` gelb, der laufende gestrichelt. */
  function sparkline(monate, i) {
    const B = 104;
    const HH = 40;
    const werte = monate.map((m) => (typeof m.flaschen === 'number' && isFinite(m.flaschen) ? m.flaschen : 0));
    const max = Math.max.apply(null, [1].concat(werte));
    const min = Math.min.apply(null, [0].concat(werte));
    const massstab = (HH - 2) / (max - min);
    const null0 = 1 + max * massstab; // Nulllinie; Gutschrift-Monate (negativ) gehen nach unten
    const platz = B / monate.length;
    const bb = Math.max(platz - 2.5, 2);
    const rund = (z) => Math.round(z * 100) / 100;
    return s('svg', { viewBox: '0 0 ' + B + ' ' + HH, class: 'sparkline', 'aria-hidden': 'true', focusable: 'false' },
      werte.map((w, j) => {
        const hh = Math.max(Math.abs(w) * massstab, w !== 0 ? 2 : 1);
        return s('rect', { x: rund(j * platz + (platz - bb) / 2), y: rund(w < 0 ? null0 : null0 - hh),
          width: rund(bb), height: rund(hh), rx: Math.min(1.5, bb / 2),
          class: w < 0 ? 'spark-minus' : j === i ? 'spark-gewaehlt' : j === monate.length - 1 ? 'spark-laufend' : 'spark' });
      }));
  }

  /** Karte „Letzter voller Monat: N Flaschen, ±x % …“ mit Sparkline; antippen öffnet Verkäufe mit diesem Monat. */
  function letzterMonatKarte(monate) {
    if (monate.length < 2) return null;
    const i = monate.length - 2;
    const t = H.monatsTrend(monate, i, 'flaschen', vergleichsmonate());
    if (!t) return null;
    const vergleich = t.vorjahr || t.vormonat;
    return h('button', {
      type: 'button', class: 'karte trend-karte',
      onclick: () => {
        Z.monatWahl = t.monat;
        Z.diagramm = 'flaschen';
        S.ansichten.verkaeufe();
        S.ansichtZeigen('verkaeufe');
        const ziel = S.el('monate-anker');
        if (ziel) ziel.scrollIntoView({ block: 'start', behavior: 'smooth' });
      },
    },
    h('span', { class: 'trend-karte-text' },
      h('span', { class: 'kachel-label', text: 'Letzter voller Monat · ' + H.monatFormat(t.monat, true) }),
      h('span', { class: 'trend-karte-reihe' },
        h('span', { class: 'trend-karte-wert' }, H.zahlFormat(t.wert, 0), h('span', { class: 'einheit', text: t.wert === 1 ? ' Flasche' : ' Flaschen' })),
        sparkline(monate, i)),
      vergleich
        ? h('span', { class: 'trend-zeile' }, trendChip(vergleich, t.vorjahr ? 'zum Vorjahresmonat' : 'zum Vormonat'))
        : h('span', { class: 'trend-zeile trend-hinweis', text: 'Kein Vergleich möglich.' })),
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

  /** Kachel als Knopf (öffnet eine Ansicht); sonst wie kachel(). */
  function kachelKnopf(inhalt, beiKlick, vorlesen) {
    return h('button', { type: 'button', class: 'kachel kachel-knopf', onclick: beiKlick, 'aria-label': vorlesen }, inhalt);
  }

  S.ansichten.uebersicht = function () {
    S.el('name').textContent = Z.name || '';
    const ziel = leeren('uebersicht-inhalt');
    const u = Z.daten;
    S.el('datum-zeile').textContent = u && H.datumGueltig(u.heute) ? H.wochentagText(u.heute) : '';
    if (!u) return platzhalter(ziel, ['gross', 'reihe', 'reihe', 'zeile']);
    const k = u.kennzahlen;
    const b = u.bestellung;
    const st = H.bestellStufe(b.status);
    const stufe = st.stufe || 'leer';
    const a = auswertung();
    const heute = a.heute;
    const proKiste = typeof k.flaschenProKiste === 'number' && k.flaschenProKiste > 0 ? k.flaschenProKiste : null;
    const summe = u.lager.reduce((x, l) => x + (typeof l.bestand === 'number' && l.bestand > 0 ? l.bestand : 0), 0);
    const mitAnteil = H.anteileSinnvoll(u.lager); // ein einziger gezählter Standort hätte immer 100 %
    const geschaetzt = k.gesamtQuelle !== 'inventur';
    const hw = H.hinweiseOrdnen(u.hinweise);
    const jv = a.jv;
    const laufend = jv ? jv.monate.find((m) => m.laufend) : null;
    const bisher = H.monatBisher(u.verkaeufe.monate, heute);
    const bisBestellen = H.datumGueltig(b.spaetestensBestellen) ? H.tageZwischen(heute, b.spaetestensBestellen) : null;
    const vg = jv && jv.vergleich;
    const pJahr = vg ? H.veraenderung(vg.dieses.flaschen, vg.vorjahr.flaschen) : null;
    const zuVerkaeufen = () => { Z.diagramm = 'flaschen'; S.ansichten.verkaeufe(); S.ansichtZeigen('verkaeufe'); S.nachOben('verkaeufe'); };
    const annahme = 'Rechnet mit Ø ' + H.zahlFormat(k.abverkaufProMonat, 0) + ' Flaschen pro Monat (' +
      (H.zeitraumKurz(k.abverkaufVon, k.abverkaufBis) || 'letzte Monate') + '), ' + H.kistenFormat(b.vorlaufMonate) + ' Monaten Vorlauf beim Abfüller und ' +
      H.kistenFormat(b.pufferWochen) + ' Wochen Puffer.';

    // Fehlende Teile (null) überspringen, sonst schreibt append „null“ als Text
    ziel.append(...[
      h('section', { class: 'karte bestellung stufe-' + stufe, 'aria-label': 'Bestellstatus' },
        h('div', { class: 'bestellung-kopf' },
          h('span', { class: 'pill pill-' + stufe }, h('span', { class: 'punkt', 'aria-hidden': 'true' }), st.text),
          bisBestellen === null ? null : h('span', { class: 'bestellung-frist', text: bisBestellen > 1 ? 'noch ' + H.zahlFormat(bisBestellen, 0) + ' Tage'
            : bisBestellen === 1 ? 'bis morgen' : bisBestellen === 0 ? 'heute' : 'seit ' + H.zahlFormat(-bisBestellen, 0) + (bisBestellen === -1 ? ' Tag' : ' Tagen') + ' fällig' })),
        b.spaetestensBestellen
          ? [h('p', { class: 'kachel-label', text: 'Spätestens bestellen bis' }),
            h('p', { class: 'bestellung-datum', text: H.datumText(b.spaetestensBestellen) })]
          : h('p', { class: 'bestellung-fehlt', text: 'Dafür fehlen Bestand oder Verkäufe der letzten Monate.' }),
        zeitstrahl(b, heute),
        b.leerAm ? h('p', { class: 'nur-vorlesen', text: 'Leer etwa am ' + H.datumText(b.leerAm) + ', Reichweite ' + H.zahlFormat(b.reichweite, 1) + ' Monate.' }) : null,
        h('p', { class: 'kachel-zusatz', text: (typeof b.reichweite === 'number' ? 'Reichweite ' + H.zahlFormat(b.reichweite, 1) + ' Monate. ' : '') + annahme })),
      h('div', { class: 'kacheln' },
        kachel('Bestand', H.zahlFormat(k.gesamtbestand, 0), 'Flaschen', geschaetzt ? 'geschätzt' : 'gezählt', 'flasche',
          H.kistenKurz(k.gesamtbestand, proKiste, geschaetzt)),
        jv ? kachelKnopf([
          h('span', { class: 'kachel-label' }, 'Dieses Jahr', h('span', { class: 'kachel-pfeil', 'aria-hidden': 'true', text: '›' })),
          h('span', { class: 'kachel-wert', text: H.zahlFormat(jv.bisher.flaschen, 0) }),
          h('span', { class: 'kachel-zusatz', text: 'Flaschen' }),
          pJahr !== null ? h('span', { class: 'trend-zeile' }, trendChip({ prozent: pJahr }, 'zum Vorjahr'))
            : jv.vorjahrGesamt ? h('span', { class: 'kachel-zusatz', text: 'Vorjahr gesamt: ' + H.zahlFormat(jv.vorjahrGesamt.flaschen, 0) }) : null],
        zuVerkaeufen, 'Dieses Jahr ' + flaschen(jv.bisher.flaschen) + (pJahr === null ? '' : ', ' + H.prozentText(pJahr) + ' zum Vorjahr') + '. Verkäufe öffnen')
          : kachel('Reichweite', H.zahlFormat(b.reichweite, 1), 'Monate', 'ab heute'),
        kachel('Ø pro Monat', H.zahlFormat(k.abverkaufProMonat, 0), 'Flaschen',
          typeof k.abverkaufProMonat === 'number' ? H.zeitraumKurz(k.abverkaufVon, k.abverkaufBis) : 'noch unbekannt'),
        // Laufender Monat ohne Trend: er ist erst bis heute gezählt; zum Einordnen der ganze Vorjahresmonat
        kachel('Dieser Monat', bisher ? H.zahlFormat(bisher.flaschen, 0) : '–', bisher && bisher.flaschen === 1 ? 'Flasche' : 'Flaschen', 'bis heute', null,
          laufend && laufend.vorjahr ? 'Vorjahresmonat: ' + H.zahlFormat(laufend.vorjahr.flaschen, 0) : null)),
      // „Noch keine Inventur …“ der Schnittstelle als freundlicher Satz direkt unter dem Bestand
      hw.bestand ? h('p', { class: 'notiz' }, S.icon('info', 'notiz-icon'), h('span', { text: hw.bestand })) : null,
      inventurHinweis(u, heute),
      letzterMonatKarte(u.verkaeufe.monate),
      ueberschrift('h2', 'Standorte'),
      h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste', role: 'list' }, u.lager.map((l) => h('li', { class: 'standort-zeile' },
        h('div', { class: 'zeile' },
          h('span', { class: 'zeile-name' }, l.standort,
            h('span', { class: 'zeile-unter', text: l.bestand === null ? 'noch nicht gezählt' : 'Inventur ' + H.datumKurz(l.letzteInventur) +
              (H.kistenKurz(l.bestand, proKiste, false) ? ' · ' + H.kistenKurz(l.bestand, proKiste, false) : '') })),
          l.bestand === null ? h('span', { class: 'zeile-leise', text: '–' }) : h('span', { class: 'zeile-wert', text: flaschen(l.bestand) })),
        l.bestand === null || !mitAnteil ? null : anteil(summe > 0 ? (Math.max(l.bestand, 0) / summe) * 100 : 0))))),
      // Übrige Hinweise (z. B. unlesbare Zeilen im Sheet) unverändert, aber klein und dezent
      hw.andere.length
        ? h('div', { class: 'karte info-karte', role: 'note', 'aria-label': 'Hinweise aus dem Sheet' }, S.icon('info', 'info-icon'),
          h('div', {}, h('p', { class: 'info-titel', text: 'Aus dem Sheet' }), h('ul', { class: 'hinweise', role: 'list' }, hw.andere.map((t) => h('li', { text: t })))))
        : null].filter(Boolean));
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
    memo = { daten: u, wert: { zeilen: zeilen, heute: heute, werte: werte, jv: jv, jvVorjahr: vorjahr } };
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
          h('span', { class: 'trend-hinweis', text: monateVonBis(jahrAnfang(jetzt), vg.bis) + ' verglichen: ' + H.zahlFormat(vg.dieses[g], 0) +
            ' gegenüber ' + H.zahlFormat(vg.vorjahr[g], 0) + (g === 'umsatz' ? ' €' : '') }))
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

  function monatInfo(info, a, mj, i, g) {
    const m = mj.jv.monate[i];
    const vor = a.werte(H.monatPlus(m.monat, -1));
    const chips = [];
    if (m.dieses && !m.laufend) {
      const pj = m.vorjahr ? H.veraenderung(m.dieses[g], m.vorjahr[g]) : null;
      const pm = vor ? H.veraenderung(m.dieses[g], vor[g]) : null;
      if (pj !== null) chips.push(trendChip({ prozent: pj }, 'zum Vorjahresmonat'));
      if (pm !== null) chips.push(trendChip({ prozent: pm }, 'zum Vormonat'));
    }
    const andere = g === 'umsatz' ? 'flaschen' : 'umsatz';
    const vj = m.vorjahr ? mj.vergleich + ' ' + (m.laufend ? 'ganzer Monat ' : '') + mitEinheit(m.vorjahr[g], g) : mj.vergleich + ' ohne Daten';
    info.replaceChildren(
      h('p', { class: 'kachel-label' }, H.monatName(m.monat),
        mj.vorjahr ? h('span', { class: 'badge klein-badge', text: 'Vorjahr' }) : null,
        m.laufend ? h('span', { class: 'badge klein-badge', text: 'bisher' }) : null,
        m.zukunft ? h('span', { class: 'badge klein-badge', text: 'kommt noch' }) : null),
      m.dieses ? grosseZahl('info-wert', m.dieses[g], g) : h('p', { class: 'info-wert info-leer', text: '–' }),
      h('p', { class: 'kachel-zusatz', text: (m.dieses ? mitEinheit(m.dieses[andere], andere) + ' · ' : '') + vj }),
      chips.length ? h('p', { class: 'trend-zeile' }, chips)
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

  const KUNDEN_ANFANG = 10;

  /** Kundenliste (Top 10, aufklappbar auf alle). `neuAb` = ab diesem Monat gilt ein Kunde als neu (oder null). */
  function kundenListe(z, neuAb) {
    if (!z.kunden.length) return h('div', { class: 'karte' }, h('p', { class: 'leer', text: 'Keine Verkäufe in diesem Zeitraum.' }));
    const alle = !!Z.alleKunden;
    const liste = alle ? z.kunden : z.kunden.slice(0, KUNDEN_ANFANG);
    return [
      h('div', { class: 'karte liste-karte' }, h('ol', { class: 'liste rangliste', role: 'list' }, liste.map((k, i) => h('li', { class: 'rang-zeile kunde-zeile' },
        h('button', { type: 'button', class: 'zeilen-knopf', 'aria-label': k.kunde + ', ' + flaschen(k.flaschen) + ', ' + H.euroFormat(k.umsatz) + '. Details',
          'data-kunde': k.schluessel, onclick: () => S.kundeZeigen(k.schluessel) },
        h('span', { class: 'rang-nr' + (i < 3 ? ' vorne' : ''), text: String(i + 1), 'aria-hidden': 'true' }),
        h('span', { class: 'rang-name' }, h('span', { class: 'rang-titel kunde-name', text: k.kunde }),
          h('span', { class: 'rang-unter' }, k.kanal, neuAb && k.erster >= neuAb ? h('span', { class: 'badge badge-neu', text: 'neu' }) : null)),
        h('span', { class: 'rang-zahlen' }, h('span', { class: 'rang-flaschen', text: flaschen(k.flaschen) }),
          h('span', { class: 'rang-umsatz', text: H.euroFormat(k.umsatz) })),
        h('span', { class: 'chevron klein', 'aria-hidden': 'true', text: '›' })))))),
      z.kunden.length > KUNDEN_ANFANG
        ? h('button', { type: 'button', class: 'knopf mehr-knopf', 'aria-expanded': alle ? 'true' : 'false',
          text: alle ? 'Nur die Top 10 zeigen' : 'Alle ' + z.kunden.length + ' Kunden zeigen',
          onclick: () => { Z.alleKunden = !alle; S.ansichten.verkaeufe(); } })
        : null,
    ];
  }

  function nachfassenListe(a) {
    const liste = H.nachfassen(a.zeilen, a.heute);
    if (!liste.length) return null;
    const alle = !!Z.alleNachfassen;
    const zeigen = alle ? liste : liste.slice(0, 5);
    return [
      ueberschrift('h2', 'Lange', 'nichts bestellt'),
      h('p', { class: 'hinweis', text: 'Kunden mit mindestens zwei Bestellungen, die seit über drei Monaten nichts bestellt haben. Vielleicht mal nachfragen?' }),
      h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste', role: 'list' }, zeigen.map((k) => h('li', { class: 'kunde-zeile' },
        h('button', { type: 'button', class: 'zeilen-knopf', 'data-kunde': k.schluessel, onclick: () => S.kundeZeigen(k.schluessel),
          'aria-label': k.kunde + ', zuletzt ' + H.wannText(k.letzte) + ', ' + k.bestellungen + ' Bestellungen. Details' },
        h('span', { class: 'rang-name' }, h('span', { class: 'rang-titel kunde-name', text: k.kunde }),
          h('span', { class: 'rang-unter', text: 'zuletzt ' + H.wannText(k.letzte) + ' · ' + H.abstandText(k.tage) })),
        h('span', { class: 'rang-zahlen' }, h('span', { class: 'rang-flaschen', text: k.bestellungen + ' Bestellungen' }),
          h('span', { class: 'rang-umsatz', text: flaschen(k.flaschen) + ' gesamt' })),
        h('span', { class: 'chevron klein', 'aria-hidden': 'true', text: '›' })))))),
      liste.length > 5
        ? h('button', { type: 'button', class: 'knopf mehr-knopf', 'aria-expanded': alle ? 'true' : 'false',
          text: alle ? 'Weniger zeigen' : 'Alle ' + liste.length + ' zeigen', onclick: () => { Z.alleNachfassen = !alle; S.ansichten.verkaeufe(); } })
        : null,
    ];
  }

  function kanaeleUndKunden(a) {
    const u = Z.daten;
    if (Z.zeitraum !== 'vorjahr' && Z.zeitraum !== 'gesamt') Z.zeitraum = 'jahr';
    const teile = [
      ueberschrift('h2', 'Kanäle', 'und Kunden'),
      umschalter('Zeitraum', [['jahr', 'Dieses Jahr'], ['vorjahr', 'Vorjahr'], ['gesamt', 'Gesamt']], Z.zeitraum,
        (w) => { Z.zeitraum = w; Z.alleKunden = false; S.ansichten.verkaeufe(); }),
    ];
    if (!a.zeilen) {
      // Ältere Schnittstelle: fertige Summen, Top 10, keine Details
      const z = u.verkaeufe[Z.zeitraum];
      return teile.concat([
        h('p', { class: 'zeitraum-text', text: Z.zeitraum === 'gesamt' ? 'Seit ' + H.monatFormat(z.von, true) : H.zeitraumFormat(z.von, z.bis) }),
        h('div', { class: 'kacheln' }, kachel('Verkauft', H.zahlFormat(z.flaschen, 0), z.flaschen === 1 ? 'Flasche' : 'Flaschen', null),
          kachel('Umsatz', H.zahlFormat(z.umsatz, 0), 'Euro', null)),
        h('h3', { text: 'Kanäle' }),
        rangliste(z.kanaele.map((x) => ({ name: x.kanal, flaschen: x.flaschen, umsatz: x.umsatz })), true, false),
        h('h3', { text: 'Top 10 Kunden' }),
        rangliste(z.kunden.map((x) => ({ name: x.kunde, flaschen: x.flaschen, umsatz: x.umsatz })), false, true)]);
    }
    const gr = zeitraumGrenzen(a, Z.zeitraum);
    const z = H.zeitraumAuswerten(a.zeilen, gr.von, gr.bis);
    const vgl = gr.vgl ? { jetzt: H.zeitraumAuswerten(a.zeilen, gr.vgl.von, gr.vgl.bis), vor: H.zeitraumAuswerten(a.zeilen, gr.vgl.vonVor, gr.vgl.bisVor) } : null;
    const mitVergleich = vgl && vgl.vor.flaschen > 0 ? vgl : null;
    if (Z.zeitraum === 'jahr' && !z.kanaele.length && !(vgl && vgl.vor.kanaele.length)) {
      // Anfang Januar: noch nichts in diesem Jahr, das Vorjahr ist dann die interessante Ansicht
      return teile.concat([h('p', { class: 'zeitraum-text', text: H.zeitraumFormat(z.von, z.bis) }),
        leerKarte('Noch keine Verkäufe in diesem Jahr', 'Sobald die ersten Rechnungen im Sheet stehen, siehst du sie hier.', 'Vorjahr zeigen',
          () => { Z.zeitraum = 'vorjahr'; S.ansichten.verkaeufe(); })]);
    }
    // Neu = erster Kauf überhaupt in diesem Zeitraum; nur zeigen, wenn nicht ohnehin alle neu sind (Startjahr)
    const neu = Z.zeitraum !== 'gesamt' ? z.kunden.filter((k) => k.erster >= gr.von).length : 0;
    const neuAb = neu > 0 && neu < z.kunden.length ? gr.von : null;
    const chip = (g) => (mitVergleich ? H.veraenderung(mitVergleich.jetzt[g], mitVergleich.vor[g]) : null);
    const kpi = (label, wert, einheit, g) => {
      const p = chip(g);
      return h('div', { class: 'kachel' }, h('p', { class: 'kachel-label', text: label }), h('p', { class: 'kachel-wert', text: wert }),
        h('p', { class: 'kachel-zusatz', text: einheit }), p === null ? null : h('p', { class: 'trend-zeile' }, trendChip({ prozent: p }, '')));
    };
    return teile.concat([
      h('p', { class: 'zeitraum-text', text: Z.zeitraum === 'gesamt' ? 'Seit ' + H.monatFormat(z.von, true) : H.zeitraumFormat(z.von, z.bis) }),
      h('div', { class: 'kacheln' },
        kpi('Verkauft', H.zahlFormat(z.flaschen, 0), z.flaschen === 1 ? 'Flasche' : 'Flaschen', 'flaschen'),
        kpi('Umsatz', H.zahlFormat(z.umsatz, 0), 'Euro', 'umsatz')),
      mitVergleich ? h('p', { class: 'hinweis vergleich-text', text: gr.vgl.text + ' (volle Monate).' }) : null,
      h('h3', { text: 'Kanäle' }),
      kanalListe(z, mitVergleich),
      h('h3', {}, 'Kunden', h('span', { class: 'h3-zusatz', text: '· ' + z.kunden.length + (neuAb ? ', davon ' + neu + ' neu' : '') }))],
    kundenListe(z, neuAb));
  }

  S.ansichten.verkaeufe = function () {
    const ziel = leeren('verkaeufe-inhalt');
    const u = Z.daten;
    if (!u) return platzhalter(ziel, ['segment', 'gross', 'diagramm', 'zeile']);
    const a = auswertung();
    if (!a.jv) return ziel.append(leerKarte('Keine Verkäufe lesbar', 'Die Antwort der Schnittstelle enthält keine Monate.'));
    const g = Z.diagramm === 'umsatz' ? 'umsatz' : 'flaschen';
    ziel.append(...[
      umschalter('Diagramm', [['flaschen', 'Flaschen'], ['umsatz', 'Umsatz']], g, (w) => { Z.diagramm = w; S.ansichten.verkaeufe(); }),
      jahrKarte(a, g),
      h('h2', { id: 'monate-anker' }, h('strong', { text: 'Pro' }), ' Monat'),
    ].concat(monateKarte(a, g), kanaeleUndKunden(a), a.zeilen ? nachfassenListe(a) || [] : []).filter(Boolean));
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
    const zurueck = () => Array.from(document.querySelectorAll('#ansicht-verkaeufe [data-kunde]')).find((x) => x.dataset.kunde === schluessel) || null;
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

  /** Gezählter Standort: Bestand, Kisten, letzte Inventur, Schwund, Rechenweg; oben rechts klein „Neu zählen“. */
  function lagerKarte(l) {
    const pk = Z.daten && Z.daten.kennzahlen ? Z.daten.kennzahlen.flaschenProKiste : null;
    const kistenText = H.kistenKurz(l.bestand, pk, false);
    return h('div', { class: 'karte lager-karte' },
      h('div', { class: 'karte-kopf' }, h('h3', { text: l.standort }),
        h('button', { type: 'button', class: 'knopf klein leise-knopf', text: 'Neu zählen', 'aria-label': 'Neu zählen: ' + l.standort,
          onclick: () => inventurStarten(l.standort) })),
      h('div', { class: 'lager-werte' },
        h('div', {},
          h('p', { class: 'kachel-label', text: 'Bestand' }),
          h('p', { class: 'kachel-wert', text: H.zahlFormat(l.bestand, 0) }),
          h('p', { class: 'kachel-zusatz', text: 'Flaschen' + (kistenText ? ' · ' + kistenText : '') })),
        h('div', {},
          h('p', { class: 'kachel-label', text: 'Letzte Inventur' }),
          h('p', { class: 'lager-datum', text: H.datumText(l.letzteInventur) }),
          h('p', { class: 'kachel-zusatz', text: schwundText(l) }))),
      rechenweg(l));
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
          '. Promo, Eigenverbrauch und Bruch stecken da nicht drin – den echten Bestand zeigt die Inventur.' })
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

  /** Noch nicht gezählte Standorte: eine Erklärung, dann je eine Zeile mit „Inventur eintragen“. */
  function offeneLager(liste, keinerGezaehlt) {
    return [
      h('p', { class: 'hinweis offen-text', text: (keinerGezaehlt ? 'Noch kein Lager gezählt.' : 'Noch nicht gezählt:') +
        ' Einmal zählen und als Inventur eintragen, dann rechnet die App dort den Bestand.' }),
      h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste', role: 'list' }, liste.map((l) => h('li', { class: 'offen-zeile' },
        h('span', { class: 'zeile-name', text: l.standort }),
        h('button', { type: 'button', class: 'knopf klein', text: 'Inventur eintragen', 'aria-label': 'Inventur eintragen: ' + l.standort,
          onclick: () => inventurStarten(l.standort) }))))),
    ];
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
    ziel.append(h('p', { class: 'hinweis liste-fuss', text: zeigen.length === 1 ? 'Der letzte Eintrag.' : 'Die letzten ' + zeigen.length + ' Einträge, neueste zuerst. Ältere stehen im Sheet (Tab Lager-Log).' }));
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

  S.ansichten.lager = function () {
    const ziel = leeren('lager-inhalt');
    if (!Z.daten) platzhalter(ziel, ['gross', 'gross']);
    else {
      const gezaehlt = Z.daten.lager.filter((l) => l.bestand !== null);
      const offen = Z.daten.lager.filter((l) => l.bestand === null);
      const jahresinventur = jahresinventurKarte(Z.daten, auswertung().heute);
      ziel.append(...[gesamtKarte(Z.daten), jahresinventur].filter(Boolean), ...gezaehlt.map(lagerKarte));
      // Im Dezember/Januar listet die Jahresinventur schon alle Lager mit Knopf
      if (offen.length && !jahresinventur) ziel.append(...offeneLager(offen, !gezaehlt.length));
    }
    verlaufZeigen();
    abfuellungenZeigen();
    zuordnenZeigen();
  };
})();
