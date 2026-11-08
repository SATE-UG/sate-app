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

  /** Kennzahl-Kachel: kleines Label, große Zahl, darunter Einheit und Zusatz in einer Zeile („Flaschen · rechnerisch“). */
  function kachel(label, wert, einheit, zusatz, icon) {
    const unten = [einheit, zusatz].filter(Boolean).join(' · ');
    return h('div', { class: 'kachel' },
      h('p', { class: 'kachel-label' }, icon ? S.icon(icon, 'label-icon') : null, label),
      h('p', { class: 'kachel-wert', text: wert }),
      unten ? h('p', { class: 'kachel-zusatz', text: unten }) : null);
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
      h('span', { class: 'trend-wozu', text: ' ' + wozu }));
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

  /** Balken „Reichweite“ (0–12 Monate) mit Strich bei Vorlauf + Puffer. */
  function reichweiteLeiste(b, stufe) {
    const w = H.reichweiteBalken(b.reichweite, b.vorlaufMonate, b.pufferWochen);
    if (!w) return null;
    return h('div', { class: 'reichweite' },
      h('div', { class: 'reichweite-text' },
        h('span', {}, 'Reichweite ', h('strong', { text: H.zahlFormat(b.reichweite, 1) + ' Monate' })),
        h('span', { class: 'reichweite-legende' }, h('span', { class: 'grenze-zeichen', 'aria-hidden': 'true' }), 'Vorlauf + Puffer')),
      h('div', { class: 'fortschritt stufe-' + (stufe || 'leer'), 'aria-hidden': 'true' },
        prozent(h('div', { class: 'fortschritt-fuell' }), w.fuell),
        prozent(h('div', { class: 'fortschritt-grenze' }), w.grenze, 'left')),
      h('div', { class: 'reichweite-skala', 'aria-hidden': 'true' }, h('span', { text: 'heute' }), h('span', { text: '12 Monate' })));
  }

  /** Monate vor dem Diagramm-Zeitraum (für den Vorjahresmonat), fehlt bei älteren Server-Versionen. */
  function vergleichsmonate() {
    const v = Z.daten && Z.daten.verkaeufe ? Z.daten.verkaeufe.vergleichsmonate : null;
    return Array.isArray(v) ? v : null;
  }

  /** Karte „Letzter voller Monat: N Flaschen, ±x % …“; antippen öffnet Verkäufe mit diesem Monat. */
  function letzterMonatKarte(monate) {
    if (monate.length < 2) return null;
    const i = monate.length - 2;
    const t = H.monatsTrend(monate, i, 'flaschen', vergleichsmonate());
    if (!t) return null;
    const vergleich = t.vorjahr || t.vormonat;
    return h('button', {
      type: 'button', class: 'karte trend-karte',
      onclick: () => { Z.balken = i; Z.diagramm = 'flaschen'; S.ansichten.verkaeufe(); S.ansichtZeigen('verkaeufe'); },
    },
    h('span', { class: 'trend-karte-text' },
      h('span', { class: 'kachel-label', text: 'Letzter voller Monat · ' + H.monatFormat(t.monat, true) }),
      h('span', { class: 'trend-karte-wert' }, H.zahlFormat(t.wert, 0), h('span', { class: 'einheit', text: t.wert === 1 ? ' Flasche' : ' Flaschen' })),
      vergleich
        ? h('span', { class: 'trend-zeile' }, trendChip(vergleich, t.vorjahr ? 'zum Vorjahresmonat' : 'zum Vormonat'))
        : h('span', { class: 'trend-zeile trend-hinweis', text: 'Kein Vergleich möglich.' })),
    h('span', { class: 'chevron', 'aria-hidden': 'true', text: '›' }));
  }

  S.ansichten.uebersicht = function () {
    S.el('name').textContent = Z.name || '';
    const ziel = leeren('uebersicht-inhalt');
    const u = Z.daten;
    if (!u) return platzhalter(ziel, ['gross', 'reihe', 'reihe', 'zeile']);
    const k = u.kennzahlen;
    const b = u.bestellung;
    const st = H.bestellStufe(b.status);
    const stufe = st.stufe || 'leer';
    const proKiste = typeof k.flaschenProKiste === 'number' && k.flaschenProKiste > 0 ? k.flaschenProKiste : null;
    const summe = u.lager.reduce((x, l) => x + (typeof l.bestand === 'number' && l.bestand > 0 ? l.bestand : 0), 0);

    ziel.append(
      h('section', { class: 'karte bestellung stufe-' + stufe, 'aria-label': 'Bestellstatus' },
        h('div', { class: 'bestellung-kopf' },
          h('span', { class: 'pill pill-' + stufe }, h('span', { class: 'punkt', 'aria-hidden': 'true' }), st.text),
          b.leerAm ? h('span', { class: 'bestellung-leer-am', text: 'leer etwa am ' + H.datumText(b.leerAm) }) : null),
        b.spaetestensBestellen
          ? [h('p', { class: 'kachel-label', text: 'Spätestens bestellen bis' }),
            h('p', { class: 'bestellung-datum', text: H.datumText(b.spaetestensBestellen) })]
          : h('p', { class: 'bestellung-fehlt', text: 'Dafür fehlen Bestand oder Verkäufe der letzten Monate.' }),
        reichweiteLeiste(b, st.stufe),
        h('p', { class: 'kachel-zusatz', text: 'Rechnet mit ' + H.kistenFormat(b.vorlaufMonate) + ' Monaten Vorlauf beim Abfüller und ' +
          H.kistenFormat(b.pufferWochen) + ' Wochen Puffer.' })),
      h('div', { class: 'kacheln' },
        kachel('Bestand', H.zahlFormat(k.gesamtbestand, 0), 'Flaschen', k.gesamtQuelle === 'inventur' ? 'aus Inventur' : 'rechnerisch', 'flasche'),
        (() => {
          const t = H.kistenTeilen(k.gesamtbestand, proKiste);
          return kachel('Kisten', t ? H.zahlFormat(t.kisten, 0) : '–', t && t.rest ? '+ ' + H.zahlFormat(t.rest, 0) + ' Flaschen' : '',
            proKiste ? 'volle Kisten à ' + H.zahlFormat(proKiste, 0) : null);
        })(),
        kachel('Reichweite', H.zahlFormat(b.reichweite, 1), 'Monate',
          typeof k.mindestbestand === 'number' && k.mindestbestand > 0 ? 'bis zum Mindestbestand' : 'ab heute'),
        kachel('Ø pro Monat', H.zahlFormat(k.abverkaufProMonat, 0), 'Flaschen',
          typeof k.abverkaufProMonat === 'number' ? H.zeitraumFormat(k.abverkaufVon, k.abverkaufBis) : 'noch unbekannt')),
      letzterMonatKarte(u.verkaeufe.monate),
      ueberschrift('h2', 'Standorte'),
      h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste', role: 'list' }, u.lager.map((l) => h('li', { class: 'standort-zeile' },
        h('div', { class: 'zeile' }, h('span', { class: 'zeile-name', text: l.standort }),
          l.bestand === null ? h('span', { class: 'badge', text: 'noch keine Inventur' }) : h('span', { class: 'zeile-wert', text: flaschen(l.bestand) })),
        l.bestand === null ? null : anteil(summe > 0 ? (Math.max(l.bestand, 0) / summe) * 100 : 0))))),
      u.hinweise.length
        ? h('div', { class: 'karte info-karte', role: 'note', 'aria-label': 'Hinweise' }, S.icon('info', 'info-icon'),
          h('div', {}, h('p', { class: 'info-titel', text: 'Hinweise' }), h('ul', { class: 'hinweise', role: 'list' }, u.hinweise.map((t) => h('li', { text: t })))))
        : null);
  };

  // Verkäufe ----------------------------------------------------------------------------------------------------

  // links 28: bei 390 px Breite ist jede Trefferfläche ≈ 24 px breit (WCAG 2.5.8)
  const MASSE = { breite: 340, hoehe: 196, links: 28, unten: 32, oben: 22, luecke: 7 };

  /** Text zum gewählten Balken (für Vorleseprogramme), z. B. „Oktober 2026: 1.234 Flaschen · 2.345 €“. */
  function balkenText(m, laufend) {
    return H.monatFormat(m.monat, true) + (laufend ? ' (läuft noch)' : '') + ': ' + flaschen(m.flaschen) + ' · ' + H.euroFormat(m.umsatz);
  }

  /** Kurzer Wert über dem gewählten Balken. */
  function kurzWert(m, wert) {
    const z = m[wert];
    if (typeof z !== 'number') return '–';
    return H.achsenText(Math.round(z)) + (wert === 'umsatz' ? ' €' : '');
  }

  /** Kopf der Diagramm-Karte: Monat, große Zahl, die andere Größe klein, darunter die Trends zur gezeigten Größe. */
  function infoFuellen(info, monate, i, wert) {
    const m = monate[i];
    const laufend = i === monate.length - 1;
    const fl = [H.zahlFormat(m.flaschen, 0), m.flaschen === 1 ? 'Flasche' : 'Flaschen'];
    const eu = [H.zahlFormat(m.umsatz, 0), '€'];
    const [gross, klein] = wert === 'umsatz' ? [eu, fl] : [fl, eu];
    info.replaceChildren(
      h('p', { class: 'kachel-label' }, H.monatFormat(m.monat, true), laufend ? h('span', { class: 'badge klein-badge', text: 'bisher' }) : null),
      h('p', { class: 'info-wert' }, gross[0], h('span', { class: 'einheit', text: ' ' + gross[1] })),
      h('p', { class: 'kachel-zusatz', text: klein.join(' ') }),
      trendZeile(H.monatsTrend(monate, i, wert, vergleichsmonate())));
  }

  /** Balkendiagramm als SVG (13 Monate). Antippen eines Monats zeigt seine Zahlen oben in der Karte. */
  function diagramm(monate, wert, info) {
    const d = H.diagrammMasse(monate.map((m) => m[wert]), MASSE);
    const svg = s('svg', {
      viewBox: '0 0 ' + MASSE.breite + ' ' + MASSE.hoehe, class: 'diagramm', role: 'group',
      'aria-label': (wert === 'umsatz' ? 'Umsatz' : 'Flaschen') + ' pro Monat, ' + H.zeitraumFormat(monate[0].monat, monate[monate.length - 1].monat),
    });
    d.striche.forEach((t) => {
      svg.append(s('line', { x1: MASSE.links, x2: MASSE.breite, y1: t.y, y2: t.y, class: t.wert === 0 ? 'achse' : 'gitter' }));
      svg.append(s('text', { x: MASSE.links - 6, y: t.y + 3, 'text-anchor': 'end', class: 'achsen-text', text: H.achsenText(t.wert) }));
    });
    const gruppen = [];
    d.balken.forEach((b, i) => {
      const m = monate[i];
      const laufend = i === monate.length - 1;
      const mitte = b.x + b.b / 2;
      const gewaehlt = i === Z.balken;
      const g = s('g', { class: 'balken' + (laufend ? ' laufend' : '') + (gewaehlt ? ' gewaehlt' : '') });
      if (b.h > 0) g.append(s('rect', { x: b.x, y: b.y, width: b.b, height: b.h, rx: Math.min(4, b.b / 2, b.h / 2), class: 'balken-flaeche' }));
      g.append(s('text', {
        x: Math.max(MASSE.links + 12, Math.min(MASSE.breite - 12, mitte)), y: Math.max(b.y - 6, 10), 'text-anchor': 'middle',
        class: 'wert-label', text: kurzWert(m, wert), hidden: !gewaehlt,
      }));
      g.append(s('text', { x: mitte, y: d.basis + 15, 'text-anchor': 'middle', class: 'monat', text: H.monatFormat(m.monat) }));
      if (i === 0 || m.monat.slice(5) === '01') {
        g.append(s('text', { x: mitte, y: d.basis + 28, 'text-anchor': 'middle', class: 'jahr', text: m.monat.slice(0, 4) }));
      }
      const treffer = s('rect', {
        x: MASSE.links + i * d.platz, y: 0, width: d.platz, height: MASSE.hoehe, class: 'treffer', tabindex: 0, role: 'button',
        'aria-label': balkenText(m, laufend), 'aria-pressed': gewaehlt ? 'true' : 'false',
      });
      const waehlen = () => {
        Z.balken = i;
        infoFuellen(info, monate, i, wert);
        gruppen.forEach((x, j) => {
          x.classList.toggle('gewaehlt', j === i);
          const l = x.querySelector('.wert-label');
          if (j === i) l.removeAttribute('hidden'); else l.setAttribute('hidden', '');
          x.querySelector('.treffer').setAttribute('aria-pressed', j === i ? 'true' : 'false');
        });
      };
      // Unsichtbare Trefferfläche über die ganze Höhe, damit auch kleine Balken gut zu treffen sind
      treffer.addEventListener('click', waehlen);
      treffer.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); waehlen(); } });
      g.append(treffer);
      gruppen.push(g);
      svg.append(g);
    });
    return svg;
  }

  /** Rangliste Name | Flaschen + Umsatz, optional mit Anteils-Balken (Kanäle) oder Platz-Nummer (Kunden). */
  function rangliste(zeilen, mitAnteil, nummeriert) {
    if (!zeilen.length) return h('div', { class: 'karte' }, h('p', { class: 'leer', text: 'Keine Verkäufe in diesem Zeitraum.' }));
    const max = Math.max.apply(null, zeilen.map((z) => z.flaschen).concat([1]));
    return h('div', { class: 'karte liste-karte' }, h(nummeriert ? 'ol' : 'ul', { class: 'liste rangliste', role: 'list' }, zeilen.map((z, i) => h('li', { class: 'rang-zeile' },
      nummeriert ? h('span', { class: 'rang-nr' + (i < 3 ? ' vorne' : ''), text: String(i + 1) }) : null,
      h('div', { class: 'rang-name' }, h('span', { class: 'rang-titel', text: z.name }), mitAnteil ? anteil((z.flaschen / max) * 100) : null),
      h('div', { class: 'rang-zahlen' }, h('span', { class: 'rang-flaschen', text: flaschen(z.flaschen) }),
        h('span', { class: 'rang-umsatz', text: H.euroFormat(z.umsatz) }))))));
  }

  S.ansichten.verkaeufe = function () {
    const ziel = leeren('verkaeufe-inhalt');
    const u = Z.daten;
    if (!u) return platzhalter(ziel, ['segment', 'diagramm', 'zeile']);
    const monate = u.verkaeufe.monate;
    if (!monate.length) return ziel.append(leerKarte('Noch keine Verkäufe', 'Sobald Rechnungen im Sheet stehen, siehst du sie hier pro Monat.'));
    // Vorauswahl: letzter voller Monat (der laufende ist noch unvollständig), bei nur einem Monat dieser
    if (Z.balken === null || Z.balken < 0 || Z.balken >= monate.length) Z.balken = Math.max(monate.length - 2, 0);
    const wert = Z.diagramm === 'umsatz' ? 'umsatz' : 'flaschen';
    const info = h('div', { class: 'balken-info', 'aria-live': 'polite' });
    infoFuellen(info, monate, Z.balken, wert);
    if (Z.zeitraum !== 'vorjahr' && Z.zeitraum !== 'gesamt') Z.zeitraum = 'jahr';
    const z = u.verkaeufe[Z.zeitraum];
    ziel.append(
      umschalter('Diagramm', [['flaschen', 'Flaschen'], ['umsatz', 'Umsatz']], wert, (w) => { Z.diagramm = w; S.ansichten.verkaeufe(); }),
      h('div', { class: 'karte diagramm-karte' },
        info,
        diagramm(monate, wert, info),
        h('div', { class: 'legende' },
          h('span', {}, h('span', { class: 'zeichen zeichen-gewaehlt', 'aria-hidden': 'true' }), 'gewählt'),
          h('span', {}, h('span', { class: 'zeichen zeichen-laufend', 'aria-hidden': 'true' }), 'läuft noch'),
          h('span', { class: 'legende-tipp', text: 'Monat antippen' }))),
      ueberschrift('h2', 'Kanäle', 'und Kunden'),
      umschalter('Zeitraum', [['jahr', 'Dieses Jahr'], ['vorjahr', 'Vorjahr'], ['gesamt', 'Gesamt']], Z.zeitraum,
        (w) => { Z.zeitraum = w; S.ansichten.verkaeufe(); }),
      h('p', { class: 'zeitraum-text', text: Z.zeitraum === 'gesamt' ? 'Seit ' + H.monatFormat(z.von, true) : H.zeitraumFormat(z.von, z.bis) }),
      h('div', { class: 'kacheln' },
        kachel('Verkauft', H.zahlFormat(z.flaschen, 0), z.flaschen === 1 ? 'Flasche' : 'Flaschen', null),
        kachel('Umsatz', H.zahlFormat(z.umsatz, 0), 'Euro', null)),
      h('h3', { text: 'Kanäle' }),
      rangliste(z.kanaele.map((x) => ({ name: x.kanal, flaschen: x.flaschen, umsatz: x.umsatz })), true, false),
      h('h3', { text: 'Top 10 Kunden' }),
      rangliste(z.kunden.map((x) => ({ name: x.kunde, flaschen: x.flaschen, umsatz: x.umsatz })), false, true));
  };

  // Lager -------------------------------------------------------------------------------------------------------

  function schwundText(l) {
    if (l.schwund === null) return 'Schwund: erst ab der zweiten Inventur';
    if (l.schwund === 0) return 'Kein Schwund seit der Inventur davor';
    if (l.schwund < 0) return flaschen(-l.schwund) + ' mehr gezählt als erwartet';
    return 'Schwund seit der Inventur davor: ' + flaschen(l.schwund);
  }

  function lagerKarte(l) {
    const kopf = h('div', { class: 'karte-kopf' }, h('h3', { text: l.standort }),
      l.bestand === null ? h('span', { class: 'badge', text: 'noch keine Inventur' }) : null);
    if (l.bestand === null) {
      return h('div', { class: 'karte lager-karte ohne-inventur' }, kopf,
        h('p', { class: 'kachel-zusatz', text: 'Zähl die Flaschen und trag sie unter „Eintragen“ als Inventur ein, dann rechnet die App hier den Bestand.' }));
    }
    return h('div', { class: 'karte lager-karte' }, kopf,
      h('div', { class: 'lager-werte' },
        h('div', {},
          h('p', { class: 'kachel-label', text: 'Bestand' }),
          h('p', { class: 'kachel-wert', text: H.zahlFormat(l.bestand, 0) }),
          h('p', { class: 'kachel-zusatz', text: 'Flaschen' + (() => {
            const pk = Z.daten && Z.daten.kennzahlen ? Z.daten.kennzahlen.flaschenProKiste : null;
            const t = H.kistenTeilen(l.bestand, pk);
            return t ? ' · ' + H.zahlFormat(t.kisten, 0) + (t.kisten === 1 ? ' Kiste' : ' Kisten') + (t.rest ? ' + ' + H.zahlFormat(t.rest, 0) + ' Fl.' : '') : '';
          })() })),
        h('div', {},
          h('p', { class: 'kachel-label', text: 'Letzte Inventur' }),
          h('p', { class: 'lager-datum', text: H.datumText(l.letzteInventur) }),
          h('p', { class: 'kachel-zusatz', text: schwundText(l) }))));
  }

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
    if (!v.eintraege.length) return ziel.append(leerKarte('Noch nichts eingetragen', 'Sobald jemand etwas unter „Eintragen“ speichert, steht es hier.'));
    ziel.append(h('p', { class: 'hinweis', text: 'Die letzten ' + v.eintraege.length + ' Einträge, neueste zuerst.' }));
    ziel.append(h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste verlauf', role: 'list' }, v.eintraege.map((e) => h('li', {
      class: 'verlauf-zeile' + (e.storniert ? ' storniert' : '') + (e.art === 'Storno' ? ' storno-zeile' : ''),
    },
      h('span', { class: 'verlauf-icon' }, S.icon(ART_ICON[e.art] || 'info')),
      h('div', { class: 'verlauf-mitte' },
        h('div', { class: 'zeile' },
          h('strong', { class: 'verlauf-art' }, e.art || '?', e.storniert ? h('span', { class: 'badge badge-storno', text: 'storniert' }) : null),
          h('span', { class: 'verlauf-datum', text: H.datumText(e.datum) })),
        h('div', { class: 'eintrag-text', text: verlaufText(e) }),
        h('div', { class: 'eintrag-fuss' },
          h('span', { class: 'nebenzeile', text: (e.wer ? 'von ' + e.wer : '') + (e.kommentar && e.art !== 'Storno' ? ' · „' + e.kommentar + '“' : '') }),
          e.stornierbar && e.id ? h('button', {
            type: 'button', class: 'knopf klein storno-knopf', text: 'Storno', 'aria-label': 'Storno: ' + e.art + ' ' + verlaufText(e),
            onclick: (ev) => stornieren(e, ev.currentTarget),
          }) : null)))))));
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

  function zuordnenZeigen() {
    const ziel = leeren('zuordnen-inhalt');
    const u = Z.daten;
    if (!u) return platzhalter(ziel, ['zeile', 'zeile']);
    if (!u.verkaufListe.length) return ziel.append(leerKarte('Keine Rechnungen', 'In den letzten 60 Tagen gab es keine Rechnungen zum Zuordnen.'));
    const orte = standorte();
    ziel.append(h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste zuordnen', role: 'list' }, u.verkaufListe.map((r, i) => {
      const gesetzt = r.standortGesetzt ? r.standort : '';
      const optionen = [h('option', { value: '', text: r.standortGesetzt ? 'Standard (zurücksetzen)' : 'Standard: ' + r.standort })]
        .concat(orte.concat(gesetzt && orte.indexOf(gesetzt) < 0 ? [gesetzt] : []).map((o) => h('option', { value: o, text: o })));
      const auswahl = h('select', { id: 'vk-' + i, onchange: (ev) => zuordnen(r, ev.currentTarget.value, ev.currentTarget) }, optionen);
      auswahl.value = gesetzt;
      if (Z.schreibt) auswahl.disabled = true;
      return h('li', {},
        h('div', { class: 'zeile' }, h('strong', { text: r.rechnung }), h('span', { class: 'verlauf-datum', text: H.datumText(r.datum) })),
        h('div', { class: 'nebenzeile', text: r.kunde + ' · ' + r.kanal + ' · ' + flaschen(r.flaschen) }),
        r.gemischt ? h('div', { class: 'nebenzeile warnung', text: 'Achtung: Teile dieser Rechnung zählen bei verschiedenen Standorten.' }) : null,
        // Beschriftung nur für Vorleseprogramme, sichtbar steht die Rechnung schon darüber
        h('label', { for: 'vk-' + i, class: 'nur-vorlesen', text: 'Standort für Rechnung ' + r.rechnung }), auswahl);
    }))));
  }

  S.ansichten.lager = function () {
    const ziel = leeren('lager-inhalt');
    if (!Z.daten) platzhalter(ziel, ['gross', 'gross']);
    else ziel.append(...Z.daten.lager.map(lagerKarte));
    verlaufZeigen();
    zuordnenZeigen();
  };
})();
