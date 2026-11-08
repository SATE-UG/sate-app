// Ansichten Übersicht, Verkäufe und Lager: bauen ihren Inhalt bei jeder neuen Antwort komplett neu (nur DOM-Knoten, kein HTML-Text).
(function () {
  'use strict';

  const S = window.SATE;
  const H = S.H;
  const Z = S.zustand;
  const h = S.h;
  const s = S.s;

  const flaschen = (z) => H.zahlFormat(z, 0) + (z === 1 ? ' Flasche' : ' Flaschen');
  const standorte = () => (Z.daten ? Z.daten.lager.map((l) => l.standort) : []);

  /** Inhalt eines Bereichs leeren und zurückgeben. */
  function leeren(id) {
    const e = S.el(id);
    e.replaceChildren();
    return e;
  }

  /** Ohne Daten: „Lädt …“ bzw. Bitte um Neu laden. */
  function platzhalter(ziel) {
    ziel.append(h('p', { class: 'leer', text: Z.laedt ? 'Lädt …' : 'Noch keine Daten. Bitte oben „Neu laden“ tippen.' }));
  }

  /** Kennzahl mit Flasche davor: Titel, große Zahl mit Einheit, kleiner Zusatz. */
  function zahl(titel, wert, einheit, zusatz) {
    return h('div', { class: 'zahl' },
      h('dt', { text: titel }),
      h('dd', {}, wert, einheit ? ' ' : null, einheit ? h('span', { class: 'einheit', text: einheit }) : null),
      zusatz ? h('dd', { class: 'zusatz', text: zusatz }) : null);
  }

  /** Zwei Knöpfe nebeneinander, gewählter invertiert. `wahl` = [[wert, text], …]. */
  function umschalter(gruppe, wahl, aktuell, beiWahl) {
    return h('div', { class: 'umschalter', role: 'group', 'aria-label': gruppe },
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

  // Übersicht ---------------------------------------------------------------------------------------------------

  S.ansichten.uebersicht = function () {
    S.el('name').textContent = Z.name || '';
    const ziel = leeren('uebersicht-inhalt');
    const u = Z.daten;
    if (!u) return platzhalter(ziel);
    const k = u.kennzahlen;
    const b = u.bestellung;
    const st = H.bestellStufe(b.status);
    const quelle = k.gesamtQuelle === 'inventur' ? 'aus Inventur' : 'rechnerisch';
    const kisten = typeof k.kisten === 'number' ? '≈ ' + H.kistenFormat(k.kisten) + ' Kisten · ' : '';
    const ab = typeof k.abverkaufProMonat === 'number'
      ? 'Ø ' + H.zahlFormat(k.abverkaufProMonat, 0) + ' Flaschen pro Monat (' + H.zeitraumFormat(k.abverkaufVon, k.abverkaufBis) + ')'
      : 'Ø-Abverkauf noch unbekannt';

    ziel.append(
      h('div', { class: 'bestellung stufe-' + (st.stufe || 'leer') },
        h('p', { class: 'status-text', text: st.text }),
        b.spaetestensBestellen
          ? h('p', {}, 'Spätestens bestellen bis ', h('strong', { text: H.datumFormat(b.spaetestensBestellen) }))
          : h('p', { text: 'Dafür fehlen Bestand oder Verkäufe der letzten Monate.' }),
        h('p', { class: 'klein', text: 'Rechnet mit ' + H.kistenFormat(b.vorlaufMonate) + ' Monaten Vorlauf beim Abfüller und ' +
          H.kistenFormat(b.pufferWochen) + ' Wochen Puffer.' })),
      h('dl', { class: 'zahlen' },
        zahl('Gesamtbestand', H.zahlFormat(k.gesamtbestand, 0), 'Flaschen', kisten + quelle),
        zahl('Reichweite', H.zahlFormat(b.reichweite, 1), 'Monate', ab),
        zahl('Leer etwa am', H.datumFormat(b.leerAm), '', null)),
      h('h2', { text: 'Standorte' }),
      h('ul', { class: 'liste' }, u.lager.map((l) => h('li', {},
        h('div', { class: 'zeile' }, h('span', { text: l.standort }),
          h('span', { class: l.bestand === null ? 'leise' : '', text: l.bestand === null ? 'noch keine Inventur' : flaschen(l.bestand) }))))),
      ...(u.hinweise.length ? [h('h2', { text: 'Hinweise' }), h('ul', { class: 'liste hinweise' }, u.hinweise.map((t) => h('li', { text: t })))] : []));
  };

  // Verkäufe ----------------------------------------------------------------------------------------------------

  const MASSE = { breite: 340, hoehe: 200, links: 46, unten: 34, oben: 8, luecke: 6 };

  /** Text zum gewählten Balken, z. B. „Oktober 2026: 1.234 Flaschen · 2.345 €“. */
  function balkenText(m, laufend) {
    return H.monatFormat(m.monat, true) + (laufend ? ' (läuft noch)' : '') + ': ' + flaschen(m.flaschen) + ' · ' + H.euroFormat(m.umsatz);
  }

  /** Balkendiagramm als SVG (13 Monate). Antippen eines Monats zeigt seine Zahlen über dem Diagramm. */
  function diagramm(monate, wert, info) {
    const d = H.diagrammMasse(monate.map((m) => m[wert]), MASSE);
    const svg = s('svg', {
      viewBox: '0 0 ' + MASSE.breite + ' ' + MASSE.hoehe, class: 'diagramm', role: 'group',
      'aria-label': (wert === 'umsatz' ? 'Umsatz' : 'Flaschen') + ' pro Monat, ' + H.zeitraumFormat(monate[0].monat, monate[monate.length - 1].monat),
    });
    d.striche.forEach((t) => {
      svg.append(s('line', { x1: MASSE.links - 4, x2: MASSE.breite, y1: t.y, y2: t.y, class: t.wert === 0 ? 'achse' : 'gitter' }));
      svg.append(s('text', { x: MASSE.links - 8, y: t.y + 3, 'text-anchor': 'end', class: 'achsen-text', text: H.achsenText(t.wert) }));
    });
    const gruppen = [];
    d.balken.forEach((b, i) => {
      const m = monate[i];
      const laufend = i === monate.length - 1;
      const mitte = b.x + b.b / 2;
      const g = s('g', { class: 'balken' + (laufend ? ' laufend' : '') + (i === Z.balken ? ' gewaehlt' : '') });
      if (b.h > 0) g.append(s('rect', { x: b.x, y: b.y, width: b.b, height: b.h, class: 'balken-flaeche' }));
      g.append(s('rect', { x: mitte - d.platz / 2 + 1, y: d.basis + 3, width: d.platz - 2, height: 14, class: 'marke', hidden: i !== Z.balken }));
      g.append(s('text', { x: mitte, y: d.basis + 14, 'text-anchor': 'middle', class: 'monat', text: H.monatFormat(m.monat) }));
      if (i === 0 || m.monat.slice(5) === '01') {
        g.append(s('text', { x: mitte, y: d.basis + 28, 'text-anchor': 'middle', class: 'jahr', text: m.monat.slice(0, 4) }));
      }
      const waehlen = () => {
        Z.balken = i;
        info.textContent = balkenText(m, laufend);
        gruppen.forEach((x, j) => {
          x.classList.toggle('gewaehlt', j === i);
          const marke = x.querySelector('.marke');
          if (j === i) marke.removeAttribute('hidden'); else marke.setAttribute('hidden', '');
        });
      };
      // Unsichtbare Trefferfläche über die ganze Höhe, damit auch kleine Balken gut zu treffen sind
      g.append(s('rect', {
        x: MASSE.links + i * d.platz, y: 0, width: d.platz, height: MASSE.hoehe, class: 'treffer', tabindex: 0, role: 'button',
        'aria-label': balkenText(m, laufend), onclick: waehlen,
        onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); waehlen(); } },
      }));
      gruppen.push(g);
      svg.append(g);
    });
    return svg;
  }

  /** Tabelle Name | Flaschen | Umsatz, optional mit Anteils-Balken unter dem Namen. */
  function tabelle(zeilen, mitAnteil, nummeriert) {
    if (!zeilen.length) return h('p', { class: 'leer', text: 'Keine Verkäufe in diesem Zeitraum.' });
    const max = Math.max.apply(null, zeilen.map((z) => z.flaschen).concat([1]));
    const t = h('div', { class: 'tabelle' },
      h('div', { class: 'kopfzeile', text: '' }), h('div', { class: 'kopfzeile zahl-zelle', text: 'Flaschen' }),
      h('div', { class: 'kopfzeile zahl-zelle', text: 'Umsatz' }));
    zeilen.forEach((z, i) => {
      const name = h('div', { class: 'name-zelle' }, (nummeriert ? (i + 1) + '. ' : '') + z.name);
      if (mitAnteil) {
        const balken = h('div', { class: 'anteil', 'aria-hidden': 'true' });
        balken.style.width = Math.max(0, Math.min(100, (z.flaschen / max) * 100)) + '%'; // CSSOM, mit der CSP erlaubt
        name.append(balken);
      }
      t.append(name, h('div', { class: 'zahl-zelle', text: H.zahlFormat(z.flaschen, 0) }), h('div', { class: 'zahl-zelle', text: H.euroFormat(z.umsatz) }));
    });
    return t;
  }

  S.ansichten.verkaeufe = function () {
    const ziel = leeren('verkaeufe-inhalt');
    const u = Z.daten;
    if (!u) return platzhalter(ziel);
    const monate = u.verkaeufe.monate;
    if (!monate.length) return ziel.append(h('p', { class: 'leer', text: 'Noch keine Verkäufe.' }));
    if (Z.balken === null || Z.balken < 0 || Z.balken >= monate.length) Z.balken = monate.length - 1;
    const wert = Z.diagramm === 'umsatz' ? 'umsatz' : 'flaschen';
    const info = h('p', { class: 'balken-info', 'aria-live': 'polite', text: balkenText(monate[Z.balken], Z.balken === monate.length - 1) });
    const z = Z.zeitraum === 'jahr' ? u.verkaeufe.jahr : u.verkaeufe.letzte12;
    ziel.append(
      umschalter('Diagramm', [['flaschen', 'Flaschen'], ['umsatz', 'Umsatz']], wert, (w) => { Z.diagramm = w; S.ansichten.verkaeufe(); }),
      info,
      diagramm(monate, wert, info),
      h('p', { class: 'legende', text: 'Monat antippen für die Zahlen. Gestrichelt: laufender Monat.' }),
      h('h2', { text: 'Kanäle und Kunden' }),
      umschalter('Zeitraum', [['letzte12', 'Letzte 12 Monate'], ['jahr', 'Dieses Jahr']], Z.zeitraum === 'jahr' ? 'jahr' : 'letzte12',
        (w) => { Z.zeitraum = w; S.ansichten.verkaeufe(); }),
      h('p', { class: 'summen' }, H.zeitraumFormat(z.von, z.bis) + ': ', h('strong', { text: flaschen(z.flaschen) }), ' · ' + H.euroFormat(z.umsatz)),
      h('h3', { text: 'Kanäle' }),
      tabelle(z.kanaele.map((x) => ({ name: x.kanal, flaschen: x.flaschen, umsatz: x.umsatz })), true, false),
      h('h3', { text: 'Top 10 Kunden' }),
      tabelle(z.kunden.map((x) => ({ name: x.kunde, flaschen: x.flaschen, umsatz: x.umsatz })), false, true));
  };

  // Lager -------------------------------------------------------------------------------------------------------

  function schwundText(l) {
    if (l.schwund === null) return 'Schwund: erst ab der zweiten Inventur';
    if (l.schwund === 0) return 'Schwund seit der Inventur davor: keiner';
    if (l.schwund < 0) return 'Seit der Inventur davor ' + flaschen(-l.schwund) + ' mehr gezählt als erwartet';
    return 'Schwund seit der Inventur davor: ' + flaschen(l.schwund);
  }

  function lagerKarte(l) {
    if (l.bestand === null) {
      return h('div', { class: 'karte ohne-inventur' }, h('h3', { text: l.standort }),
        h('p', { text: 'Noch keine Inventur. Zähl die Flaschen und trag sie unter „Eintragen“ als Inventur ein, dann rechnet die App hier den Bestand.' }));
    }
    return h('div', { class: 'karte' }, h('h3', { text: l.standort }),
      h('dl', { class: 'zahlen' },
        zahl('Bestand', H.zahlFormat(l.bestand, 0), 'Flaschen', typeof l.kisten === 'number' ? '≈ ' + H.kistenFormat(l.kisten) + ' Kisten' : null),
        zahl('Letzte Inventur', H.datumFormat(l.letzteInventur), '', schwundText(l))));
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
    if (Z.verlaufLaedt) ziel.append(h('p', { class: 'leer', text: v ? 'Lädt neu …' : 'Lädt den Verlauf …' }));
    if (Z.verlaufFehler) ziel.append(h('p', { class: 'leer', text: 'Verlauf nicht geladen: ' + Z.verlaufFehler }));
    if (!v) {
      if (!Z.verlaufLaedt) ziel.append(h('button', { type: 'button', class: 'knopf', text: 'Verlauf laden', onclick: () => S.verlaufLaden() }));
      return;
    }
    if (!v.eintraege.length) return ziel.append(h('p', { class: 'leer', text: 'Noch keine Einträge im Lager-Log.' }));
    ziel.append(h('p', { class: 'hinweis', text: 'Die letzten ' + v.eintraege.length + ' Einträge, neueste zuerst.' }));
    ziel.append(h('ul', { class: 'liste verlauf' }, v.eintraege.map((e) => h('li', { class: e.storniert ? 'storniert' : '' },
      h('div', { class: 'zeile' },
        h('strong', {}, e.art || '?', e.storniert ? h('span', { class: 'marke-text', text: 'storniert' }) : null),
        h('span', { text: H.datumFormat(e.datum) })),
      h('div', { class: 'eintrag-text', text: verlaufText(e) }),
      h('div', { class: 'eintrag-fuss' },
        h('span', { class: 'nebenzeile', text: (e.wer ? 'von ' + e.wer : '') + (e.kommentar && e.art !== 'Storno' ? ' · „' + e.kommentar + '“' : '') }),
        e.stornierbar && e.id ? h('button', {
          type: 'button', class: 'knopf klein', text: 'Storno', 'aria-label': 'Storno: ' + e.art + ' ' + verlaufText(e),
          onclick: (ev) => stornieren(e, ev.currentTarget),
        }) : null)))));
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
    if (!u) return platzhalter(ziel);
    if (!u.verkaufListe.length) return ziel.append(h('p', { class: 'leer', text: 'Keine Rechnungen in den letzten 60 Tagen.' }));
    const orte = standorte();
    ziel.append(h('ul', { class: 'liste zuordnen' }, u.verkaufListe.map((r, i) => {
      const gesetzt = r.standortGesetzt ? r.standort : '';
      const optionen = [h('option', { value: '', text: r.standortGesetzt ? 'Standard (zurücksetzen)' : 'Standard: ' + r.standort })]
        .concat(orte.concat(gesetzt && orte.indexOf(gesetzt) < 0 ? [gesetzt] : []).map((o) => h('option', { value: o, text: o })));
      const auswahl = h('select', { id: 'vk-' + i, onchange: (ev) => zuordnen(r, ev.currentTarget.value, ev.currentTarget) }, optionen);
      auswahl.value = gesetzt;
      if (Z.schreibt) auswahl.disabled = true;
      return h('li', {},
        h('div', { class: 'zeile' }, h('strong', { text: r.rechnung }), h('span', { text: H.datumFormat(r.datum) })),
        h('div', { class: 'nebenzeile', text: r.kunde + ' · ' + r.kanal + ' · ' + flaschen(r.flaschen) }),
        r.gemischt ? h('div', { class: 'nebenzeile', text: 'Achtung: Teile dieser Rechnung zählen bei verschiedenen Standorten.' }) : null,
        // Beschriftung nur für Vorleseprogramme, sichtbar steht die Rechnung schon darüber
        h('label', { for: 'vk-' + i, class: 'nur-vorlesen', text: 'Standort für Rechnung ' + r.rechnung }), auswahl);
    })));
  }

  S.ansichten.lager = function () {
    const ziel = leeren('lager-inhalt');
    if (!Z.daten) platzhalter(ziel);
    else ziel.append(...Z.daten.lager.map(lagerKarte));
    verlaufZeigen();
    zuordnenZeigen();
  };
})();
