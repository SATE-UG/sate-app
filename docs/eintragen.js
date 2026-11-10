// Ansicht „Eintragen“: Inventur, Umlagerung, Promo, Eigenverbrauch, Bruch, Abfüllung ins Lager-Log (Aktion `buchen`).
// Das Formular steht fest in index.html; hier kommen Art-Knöpfe, Standorte, Stepper, Prüfung und Senden dazu.
// Ablauf (seit Task 16): erst die Art wählen, dann blendet das Formular ein (Standort vorgewählt), „Speichern“ ist
// gesperrt, bis alles gültig ist (gleiche Prüfung wie vor dem Senden, darunter leise, was noch fehlt).
(function () {
  'use strict';

  const S = window.SATE;
  const H = S.H;
  const Z = S.zustand;
  const h = S.h;
  const K_STANDORT = (S.SCHLUESSEL && S.SCHLUESSEL.standort) || 'sate.standort';

  const form = S.el('buchen-form');
  const formular = S.el('b-formular');
  const standortSel = S.el('b-standort');
  const nachSel = S.el('b-nach');
  const kisten = S.el('b-kisten');
  const einzel = S.el('b-flaschen');
  const datum = S.el('b-datum');
  const kommentar = S.el('b-kommentar');
  const kosten = S.el('b-kosten');
  const kostenHinweis = S.el('b-kosten-hinweis');
  const KOSTEN_TEXT = kostenHinweis.textContent;
  const senden = S.el('buchen-senden');
  const fehlerFeld = S.el('buchen-fehler');
  const offenFeld = S.el('buchen-offen');
  const summeFeld = S.el('b-summe');
  const bestandFeld = S.el('b-bestand');
  const vorschauFeld = S.el('b-vorschau');
  const chipsFeld = S.el('b-datum-chips');

  // Doppelklick-Schutz: dieselbe ID, bis das Formular geändert oder erfolgreich gespeichert wird. So landet ein
  // erneutes Tippen nach einer Zeitüberschreitung nicht doppelt im Lager-Log (der Server erkennt die ID wieder).
  let entwurfId = '';
  // Standort hat die App vorgewählt (Hauptlager bzw. zuletzt genutzt), nicht die Person: darf beim Art-Wechsel mitwechseln
  let standortAuto = false;
  let gesperrt = false; // Speichern läuft

  // Art als Kacheln mit kleinem Symbol (Radio-Knöpfe, die Kachel ist die Beschriftung)
  const ART_ICON = { Inventur: 'inventur', Umlagerung: 'umlagerung', Promo: 'promo', Eigenverbrauch: 'eigenverbrauch', Bruch: 'bruch',
    'Abfüllung': 'abfuellung' };
  const radios = H.ARTEN.map((a, i) => {
    const r = h('input', { type: 'radio', name: 'art', value: a.art, id: 'art-' + i });
    S.el('arten').append(h('label', { class: 'art', for: 'art-' + i },
      r, h('span', { class: 'art-kachel' }, h('span', { class: 'art-symbol' }, S.icon(ART_ICON[a.art])),
        h('span', { class: 'art-texte' }, h('span', { class: 'art-name', text: a.art }), h('span', { class: 'art-kurz', text: a.kurz || '' })))));
    return r;
  });

  const art = () => { const x = radios.find((r) => r.checked); return x ? x.value : ''; };
  const proKiste = () => (Z.daten && typeof Z.daten.kennzahlen.flaschenProKiste === 'number' ? Z.daten.kennzahlen.flaschenProKiste : null);
  const orte = () => (Z.daten ? Z.daten.lager.map((l) => l.standort) : []);

  function fehler(text) {
    fehlerFeld.textContent = text || '';
    fehlerFeld.hidden = !text;
  }

  /** Vorschlag für den Standort: Abfüllung → Hauptlager (erster Standort), sonst der zuletzt genutzte (falls es ihn noch gibt). */
  function standortVorschlag(a) {
    const o = orte();
    if (a === 'Abfüllung') return o[0] || '';
    const zuletzt = S.speicher ? S.speicher.lesen(K_STANDORT) : '';
    return o.indexOf(zuletzt) >= 0 ? zuletzt : '';
  }

  /** Leeren oder von der App gesetzten Standort durch den Vorschlag ersetzen (eine Wahl der Person bleibt). */
  function standortVorwaehlen() {
    const a = art();
    if (!a || (standortSel.value && !standortAuto)) return;
    const v = standortVorschlag(a);
    standortSel.value = v;
    standortAuto = !!v && standortSel.value === v;
  }

  function artAnpassen() {
    const a = art();
    const info = H.ARTEN.find((x) => x.art === a);
    S.el('art-text').textContent = info ? info.text : '';
    S.el('art-text').hidden = !info;
    formular.hidden = !a;
    S.el('b-nach-feld').hidden = a !== 'Umlagerung';
    kostenFeldZeigen();
    S.el('b-standort-label').textContent = { Umlagerung: 'Von', Abfüllung: 'Angekommen in', Inventur: 'Gezählt in' }[a] || 'Standort';
    S.el('b-flaschen-legende').textContent = a === 'Inventur' ? 'Wie viele stehen da?' : 'Wie viele Flaschen?';
    standortVorwaehlen();
  }

  /** Summe groß unter den Mengen („= 288 Flaschen“), bei unlesbarer Zahl der Fehler in Rot. */
  function summeZeigen() {
    const r = H.flaschenAusEingabe(kisten.value, einzel.value, proKiste());
    summeFeld.textContent = r.fehler || (r.leer ? '' : '= ' + H.zahlFormat(r.flaschen, 0) + (r.flaschen === 1 ? ' Flasche' : ' Flaschen'));
    summeFeld.hidden = !summeFeld.textContent;
    if (summeFeld.classList) summeFeld.classList.toggle('summe-fehler', !!r.fehler);
  }

  /**
   * Kann die Schnittstelle Herstellkosten speichern? Nur wenn der Tab Abfüllungen die Kosten-Spalte hat (und die
   * Schnittstelle das meldet). Sonst bleibt das Feld weg, damit niemand etwas einträgt, das nirgends landet.
   */
  const kostenMoeglich = () => !!(Z.daten && Z.daten.kennzahlen.abfuellungKosten === true);
  /** Das Kostenfeld gibt es nur bei einer Abfüllung. */
  function kostenFeldZeigen() {
    S.el('b-kosten-feld').hidden = art() !== 'Abfüllung' || !kostenMoeglich();
  }

  /** Herstellkosten pro Flasche aus dem Feld, nur bei einer Abfüllung (sonst leer): { leer, wert, fehler }. */
  function kostenEingabe() {
    return art() === 'Abfüllung' && kostenMoeglich() ? H.kostenAusEingabe(kosten.value) : { leer: true, wert: null, fehler: '' };
  }

  /** Unter dem Kostenfeld: Fehler in Rot, sonst die Erklärung und (mit Menge) was die Abfüllung zusammen gekostet hat. */
  function kostenZeigen() {
    const k = kostenEingabe();
    const r = H.flaschenAusEingabe(kisten.value, einzel.value, proKiste());
    kostenHinweis.textContent = k.fehler || (k.wert !== null && !r.fehler && !r.leer
      ? 'Zusammen ' + H.euroFormat(k.wert * r.flaschen) + ' für ' + H.zahlFormat(r.flaschen, 0) + (r.flaschen === 1 ? ' Flasche.' : ' Flaschen.') : KOSTEN_TEXT);
    if (kostenHinweis.classList) kostenHinweis.classList.toggle('feld-fehler', !!k.fehler);
  }

  /** Lager-Eintrag eines Standorts aus der Antwort (oder null). */
  function lagerVon(ort) {
    return Z.daten && ort ? Z.daten.lager.find((x) => x.standort === ort) || null : null;
  }
  /** Bestand laut App an einem Standort (null: noch nicht gezählt oder unbekannt). */
  function bestandVon(ort) {
    const l = lagerVon(ort);
    return l && typeof l.bestand === 'number' ? l.bestand : null;
  }

  /**
   * Unter dem Standort „Bestand laut App“, unter der Menge der Bestand danach bzw. bei Inventur die Abweichung. Wie die
   * Schnittstelle: Eine Buchung am oder vor dem Tag der letzten Inventur eines Standorts ändert dessen Bestand nicht mehr
   * (die Zählung enthält sie schon). Eine Inventur vergleicht nur mit heute gezählt (zurückdatiert fehlen Bewegungen).
   */
  function vorschauZeigen() {
    const a = art();
    const ort = standortSel.value;
    const b = bestandVon(ort);
    bestandFeld.textContent = !a || !ort ? '' : b === null ? 'Hier gibt es noch keine Inventur, die App kennt den Bestand nicht.'
      : 'Bestand laut App (heute): ' + H.zahlFormat(b, 0) + (b === 1 ? ' Flasche' : ' Flaschen');
    bestandFeld.hidden = !bestandFeld.textContent;
    const r = H.flaschenAusEingabe(kisten.value, einzel.value, proKiste());
    const tag = datum.value;
    let text = '';
    if (a && !r.fehler && !r.leer && H.datumGueltig(tag)) {
      const vorZaehlung = (l) => !!l && H.datumGueltig(l.letzteInventur) && tag <= l.letzteInventur;
      const nach = a === 'Umlagerung' ? nachSel.value : '';
      if (a === 'Inventur') {
        text = tag === H.heuteBerlin() ? H.buchungVorschau(a, r.flaschen, b) : '';
      } else if (vorZaehlung(lagerVon(ort)) && (a !== 'Umlagerung' || !nach || vorZaehlung(lagerVon(nach)))) {
        text = 'Ändert den Bestand nicht mehr: ' + (a === 'Umlagerung' && nach ? 'beide Lager wurden' : 'hier wurde') + ' danach gezählt.';
      } else {
        text = H.buchungVorschau(a, r.flaschen, vorZaehlung(lagerVon(ort)) ? null : b,
          vorZaehlung(lagerVon(nach)) ? null : bestandVon(nach), nach, ort);
      }
    }
    vorschauFeld.textContent = text;
    vorschauFeld.hidden = !text;
  }

  /** Abkürzungen unter dem Datum (Heute, Gestern, Monatsende), die gewählte hervorgehoben. */
  function chipsZeigen() {
    const heute = H.heuteBerlin();
    const liste = H.datumAbkuerzungen(heute).filter((c) => c.datum >= datum.min && c.datum <= datum.max);
    chipsFeld.replaceChildren(...liste.map((c) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': datum.value === c.datum ? 'true' : 'false', text: c.text,
      'aria-label': c.text + ', ' + H.datumText(c.datum), disabled: gesperrt,
      onclick: () => { datum.value = c.datum; geaendert(datum); },
    })));
  }

  /** Was fehlt noch zum Speichern? Gleiche Prüfung wie vor dem Senden. Rückgabe: Text oder ''. */
  function offen() {
    if (!Z.daten) return 'Noch keine Daten geladen. Bitte oben rechts neu laden.';
    if (Z.schreibt && !gesperrt) return 'Moment, gerade wird woanders gespeichert …';
    const r = H.flaschenAusEingabe(kisten.value, einzel.value, proKiste());
    if (r.fehler) return r.fehler;
    const k = kostenEingabe();
    const p = H.buchungPruefen({ art: art(), standort: standortSel.value, nach: nachSel.value, flaschen: r.leer ? null : r.flaschen,
      datum: datum.value, kommentar: kommentar.value.trim(), kosten: k.wert }, orte(), H.heuteBerlin());
    if (r.leer && /^Flaschen:/.test(p)) return 'Trag noch ein, wie viele Flaschen.';
    return p || k.fehler;
  }

  /** „Speichern“ nur freigeben, wenn alles gültig ist; darunter leise, was noch fehlt (Fehler der Zahl steht schon an der Summe). */
  function pruefen() {
    const p = offen();
    senden.disabled = gesperrt || Z.schreibt || !!p;
    const r = H.flaschenAusEingabe(kisten.value, einzel.value, proKiste());
    // Fehler der Zahl steht schon an der Summe, der der Kosten unter ihrem Feld
    offenFeld.textContent = p && !r.fehler && p !== kostenEingabe().fehler ? p : '';
    offenFeld.hidden = !offenFeld.textContent;
  }

  function auswahlFuellen(sel, liste) {
    const alt = sel.value;
    sel.replaceChildren(h('option', { value: '', text: 'Bitte wählen' }), ...liste.map((o) => h('option', { value: o, text: o })));
    sel.value = liste.indexOf(alt) >= 0 ? alt : '';
  }

  function datumGrenzen(setzen) {
    const heute = H.heuteBerlin();
    datum.min = H.tagePlus(heute, -400);
    datum.max = heute; // keine Buchungen in die Zukunft
    if (setzen || !datum.value) datum.value = heute;
  }

  function sperren(ja) {
    gesperrt = ja;
    form.querySelectorAll('input, select, textarea, button').forEach((x) => { x.disabled = ja; });
    if (!ja) chipsZeigen();
    senden.textContent = ja ? 'Speichert …' : 'Speichern';
    if (!ja) pruefen();
  }

  function leeren() {
    form.reset();
    radios.forEach((r) => { r.checked = false; });
    entwurfId = '';
    standortAuto = false;
    datumGrenzen(true);
    artAnpassen();
    summeZeigen();
    kostenZeigen();
    vorschauZeigen();
    chipsZeigen();
    pruefen();
  }

  /** Nach jeder Änderung (Tippen, Auswahl, Stepper): Entwurf neu, Fehler weg, Summe und Speichern-Knopf neu. */
  function geaendert(ziel) {
    entwurfId = '';
    fehler('');
    if (ziel && ziel.name === 'art') artAnpassen();
    if (ziel === standortSel) standortAuto = false;
    summeZeigen();
    kostenZeigen();
    vorschauZeigen();
    chipsZeigen();
    pruefen();
  }

  /** Speichern-Knopf neu bewerten (kern.js ruft das, wenn eine andere Schreib-Aktion beginnt oder endet). */
  S.eintragenPruefen = pruefen;

  /** Beim Abmelden: Eingaben, Entwurf (anfrageId) und Fehlermeldung verwerfen. */
  S.eintragenZuruecksetzen = function () {
    fehler('');
    leeren();
  };

  /**
   * Formular vorbelegen, z. B. aus dem Lager „Inventur eintragen“: Art und Standort wählen, optional das Datum (z. B. der
   * Stichtag 31.12., nur innerhalb der erlaubten Grenzen). Andere Eingaben bleiben, der Entwurf (anfrageId) ist danach neu.
   */
  S.eintragenVorbelegen = function (a, standort, tag) {
    const r = radios.find((x) => x.value === a);
    if (!r || Z.schreibt) return false;
    radios.forEach((x) => { x.checked = x === r; });
    if (orte().indexOf(standort) >= 0) {
      standortSel.value = standort;
      standortAuto = false;
    }
    datumGrenzen(false);
    if (H.datumGueltig(tag) && tag >= datum.min && tag <= datum.max) datum.value = tag;
    geaendert({ name: 'art' });
    return true;
  };

  /**
   * Steht etwas Ungespeichertes im Formular (für das automatische Update, update.js)? Art gewählt, Standort, Zahl oder
   * Kommentar eingetragen oder ein anderes Datum als heute.
   */
  S.eintragenHatEingaben = function () {
    return !!(art() || standortSel.value || nachSel.value || kisten.value.trim() || einzel.value.trim() || kommentar.value.trim() || kosten.value.trim() ||
      (datum.value && datum.value !== H.heuteBerlin()));
  };

  /** Nach jeder neuen Antwort: Standorte und Kisten-Größe übernehmen, Eingaben bleiben stehen. */
  S.ansichten.eintragen = function () {
    auswahlFuellen(standortSel, orte());
    auswahlFuellen(nachSel, orte());
    if (!standortSel.value) standortAuto = false;
    standortVorwaehlen();
    const pk = proKiste();
    S.el('b-kisten-feld').hidden = !(pk > 0);
    S.el('b-kisten-label').textContent = pk > 0 ? 'Kisten à ' + H.zahlFormat(pk, 0) : 'Kisten';
    S.el('b-flaschen-label').textContent = pk > 0 ? 'Einzelne Flaschen' : 'Flaschen';
    datumGrenzen(false);
    kostenFeldZeigen();
    summeZeigen();
    kostenZeigen();
    vorschauZeigen();
    chipsZeigen();
    pruefen();
    zuletztZeigen();
  };

  /** „Zuletzt eingetragen“: die letzten drei Einträge aus dem Verlauf (ohne Stornos), damit niemand doppelt bucht. */
  function zuletztZeigen() {
    const ziel = S.el('zuletzt-inhalt');
    const v = Z.verlauf;
    const liste = v ? H.verlaufOhneStorno(v.eintraege).slice(0, 3) : [];
    // Zustand dazu: lädt gerade neu, oder das Laden ist gescheitert (dann ggf. alter Stand mit Hinweis)
    const zustand = Z.verlaufFehler
      ? h('p', { class: 'fehler zuletzt-fehler' }, 'Verlauf nicht geladen: ' + Z.verlaufFehler + ' ',
        h('button', { type: 'button', class: 'text-link', text: 'Nochmal', onclick: () => S.verlaufLaden() }))
      : Z.verlaufLaedt && liste.length ? h('p', { class: 'status-zeile laedt', text: 'Lädt neu …' }) : null;
    if (!liste.length) return ziel.replaceChildren(...(zustand ? [h('h2', {}, h('strong', { text: 'Zuletzt' }), ' eingetragen'), zustand] : []));
    // Fehlende Teile (null) herausfiltern, sonst schreibt replaceChildren „null“ als Text (gesehen auf Marks iPhone, v21)
    ziel.replaceChildren(...[
      h('h2', {}, h('strong', { text: 'Zuletzt' }), ' eingetragen'),
      zustand,
      h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste', role: 'list' }, liste.map((e) => h('li', { class: 'aktiv-zeile' + (e.storniert ? ' storniert' : '') },
        h('span', { class: 'verlauf-icon' }, S.icon(ART_ICON[e.art] || 'info')),
        h('span', { class: 'aktiv-text' },
          h('span', { class: 'aktiv-titel' }, e.art || '?', e.storniert ? h('span', { class: 'badge badge-storno', text: 'storniert' }) : null),
          h('span', { class: 'nebenzeile', text: e.art === 'Umlagerung' ? e.standort + ' → ' + (e.nach || '?') : e.standort })),
        S.aktivRechts(e))))),
      h('button', { type: 'button', class: 'knopf mehr-knopf', text: 'Ganzer Verlauf im Lager', onclick: () => { S.ansichtZeigen('lager'); } })].filter(Boolean));
  }
  S.zuletztZeigen = zuletztZeigen;

  // Stepper −/+: Kisten bzw. Flaschen um eins ändern (0 bis Höchstwert). Unter 1 bleibt das Feld leer, außer bei Inventur (0 zählt).
  [[kisten, 'b-kisten'], [einzel, 'b-flaschen']].forEach(([feld, id]) => {
    [['-minus', -1], ['-plus', 1]].forEach(([endung, schritt]) => {
      S.el(id + endung).addEventListener('click', () => {
        const pk = proKiste();
        const max = feld === kisten ? (pk > 0 ? Math.floor(H.MAX_FLASCHEN / pk) : 0) : H.MAX_FLASCHEN;
        const neu = H.schrittWert(feld.value, schritt, max);
        feld.value = neu === '0' && art() !== 'Inventur' ? '' : neu;
        geaendert(feld);
      });
    });
  });

  ['input', 'change'].forEach((t) => form.addEventListener(t, (ev) => geaendert(ev.target)));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    fehler('');
    if (Z.schreibt) return;
    if (!Z.daten) return fehler('Noch keine Daten geladen. Bitte oben rechts „Neu laden“ (↻) tippen.');
    const r = H.flaschenAusEingabe(kisten.value, einzel.value, proKiste());
    if (r.fehler) return fehler(r.fehler);
    if (r.leer) return fehler('Bitte eintragen, wie viele Flaschen.');
    const k = kostenEingabe();
    if (k.fehler) return fehler(k.fehler);
    const b = { art: art(), standort: standortSel.value, nach: nachSel.value, flaschen: r.flaschen, datum: datum.value, kommentar: kommentar.value.trim(),
      kosten: k.wert };
    const problem = H.buchungPruefen(b, orte(), H.heuteBerlin());
    if (problem) return fehler(problem);

    if (!entwurfId) entwurfId = S.neueAnfrageId();
    const sitzung = Z.sitzung;
    const daten = { art: b.art, standort: b.standort, flaschen: b.flaschen, datum: b.datum, kommentar: b.kommentar, anfrageId: entwurfId };
    if (b.art === 'Umlagerung') daten.nachStandort = b.nach;
    if (b.art === 'Abfüllung' && b.kosten !== null) daten.kostenProFlasche = b.kosten; // Herstellkosten pro Flasche (freiwillig)
    sperren(true);
    let e;
    try {
      e = await S.schreiben('buchen', daten);
    } finally {
      sperren(false);
    }
    if (sitzung !== Z.sitzung) return; // inzwischen abgemeldet: Formular ist schon geleert
    if (e.art === 'ok') {
      // Standort fürs nächste Mal merken (nicht bei Abfüllung, die geht immer ins Hauptlager)
      if (b.art !== 'Abfüllung' && S.speicher) S.speicher.schreiben(K_STANDORT, b.standort);
      S.melden((e.daten.wiederholt ? 'War schon gespeichert. ' : 'Gespeichert. ') + H.buchungText(b) + '.', false, e.daten.hinweise);
      leeren();
      S.nachOben('eintragen');
      if (typeof S.verlaufLaden === 'function') S.verlaufLaden(); // „Zuletzt eingetragen“ auffrischen
    } else if (e.art === 'abgebrochen') {
      fehler('Nicht gespeichert.');
    } else if (e.art === 'fehler') {
      fehler(e.meldung);
    }
  });

  datumGrenzen(true);
  artAnpassen();
  chipsZeigen();
  pruefen();
})();
