// Ansicht „Eintragen“: Inventur, Umlagerung, Promo, Eigenverbrauch, Bruch, Abfüllung ins Lager-Log (Aktion `buchen`).
// Das Formular steht fest in index.html; hier kommen Art-Knöpfe, Standorte, Kisten-Hilfe, Prüfung und Senden dazu.
(function () {
  'use strict';

  const S = window.SATE;
  const H = S.H;
  const Z = S.zustand;
  const h = S.h;

  const form = S.el('buchen-form');
  const standortSel = S.el('b-standort');
  const nachSel = S.el('b-nach');
  const kisten = S.el('b-kisten');
  const einzel = S.el('b-flaschen');
  const datum = S.el('b-datum');
  const kommentar = S.el('b-kommentar');
  const senden = S.el('buchen-senden');
  const fehlerFeld = S.el('buchen-fehler');

  // Doppelklick-Schutz: dieselbe ID, bis das Formular geändert oder erfolgreich gespeichert wird. So landet ein
  // erneutes Tippen nach einer Zeitüberschreitung nicht doppelt im Lager-Log (der Server erkennt die ID wieder).
  let entwurfId = '';

  H.ARTEN.forEach((a, i) => {
    S.el('arten').append(h('label', { class: 'art', for: 'art-' + i },
      h('input', { type: 'radio', name: 'art', value: a.art, id: 'art-' + i }), h('span', { text: a.art })));
  });

  const art = () => { const x = form.querySelector('input[name="art"]:checked'); return x ? x.value : ''; };
  const proKiste = () => (Z.daten && typeof Z.daten.kennzahlen.flaschenProKiste === 'number' ? Z.daten.kennzahlen.flaschenProKiste : null);
  const orte = () => (Z.daten ? Z.daten.lager.map((l) => l.standort) : []);

  function fehler(text) {
    fehlerFeld.textContent = text || '';
    fehlerFeld.hidden = !text;
  }

  function artAnpassen() {
    const a = art();
    const info = H.ARTEN.find((x) => x.art === a);
    S.el('art-text').textContent = info ? info.text : 'Bitte oben auswählen.';
    S.el('b-nach-feld').hidden = a !== 'Umlagerung';
    S.el('b-standort-label').textContent = { Umlagerung: 'Von', Abfüllung: 'Angekommen in', Inventur: 'Gezählt in' }[a] || 'Standort';
    S.el('b-flaschen-legende').textContent = a === 'Inventur' ? 'Wie viele stehen da?' : 'Wie viele Flaschen?';
  }

  function summeZeigen() {
    const r = H.flaschenAusEingabe(kisten.value, einzel.value, proKiste());
    S.el('b-summe').textContent = r.fehler || (r.leer ? '' : 'Zusammen: ' + H.kistenText(r.flaschen, proKiste()));
  }

  function auswahlFuellen(sel, liste) {
    const alt = sel.value;
    sel.replaceChildren(h('option', { value: '', text: '– bitte wählen –' }), ...liste.map((o) => h('option', { value: o, text: o })));
    sel.value = liste.indexOf(alt) >= 0 ? alt : '';
  }

  function datumGrenzen(setzen) {
    const heute = H.heuteBerlin();
    datum.min = H.tagePlus(heute, -400);
    datum.max = H.tagePlus(heute, 1);
    if (setzen || !datum.value) datum.value = heute;
  }

  function sperren(ja) {
    form.querySelectorAll('input, select, textarea, button').forEach((x) => { x.disabled = ja; });
    senden.textContent = ja ? 'Speichert …' : 'Speichern';
  }

  function leeren() {
    form.reset();
    entwurfId = '';
    datumGrenzen(true);
    artAnpassen();
    summeZeigen();
  }

  /** Nach jeder neuen Antwort: Standorte und Kisten-Größe übernehmen, Eingaben bleiben stehen. */
  S.ansichten.eintragen = function () {
    auswahlFuellen(standortSel, orte());
    auswahlFuellen(nachSel, orte());
    const pk = proKiste();
    S.el('b-kisten-feld').hidden = !(pk > 0);
    S.el('b-kisten-label').textContent = 'Kisten (à ' + (pk > 0 ? H.zahlFormat(pk, 0) : '?') + ')';
    datumGrenzen(false);
    summeZeigen();
  };

  ['input', 'change'].forEach((t) => form.addEventListener(t, (ev) => {
    entwurfId = '';
    fehler('');
    if (ev.target.name === 'art') artAnpassen();
    if (ev.target === kisten || ev.target === einzel) summeZeigen();
  }));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    fehler('');
    if (Z.schreibt) return;
    if (!Z.daten) return fehler('Noch keine Daten geladen. Bitte oben „Neu laden“ tippen.');
    const r = H.flaschenAusEingabe(kisten.value, einzel.value, proKiste());
    if (r.fehler) return fehler(r.fehler);
    if (r.leer) return fehler('Bitte eintragen, wie viele Flaschen.');
    const b = { art: art(), standort: standortSel.value, nach: nachSel.value, flaschen: r.flaschen, datum: datum.value, kommentar: kommentar.value.trim() };
    const problem = H.buchungPruefen(b, orte(), H.heuteBerlin());
    if (problem) return fehler(problem);

    if (!entwurfId) entwurfId = S.neueAnfrageId();
    const daten = { art: b.art, standort: b.standort, flaschen: b.flaschen, datum: b.datum, kommentar: b.kommentar, anfrageId: entwurfId };
    if (b.art === 'Umlagerung') daten.nachStandort = b.nach;
    sperren(true);
    let e;
    try {
      e = await S.schreiben('buchen', daten);
    } finally {
      sperren(false);
    }
    if (e.art === 'ok') {
      S.melden((e.daten.wiederholt ? 'War schon gespeichert: ' : 'Gespeichert: ') + H.buchungText(b) + '.', false, e.daten.hinweise);
      leeren();
      window.scrollTo(0, 0);
    } else if (e.art === 'abgebrochen') {
      fehler('Nicht gespeichert.');
    } else if (e.art === 'fehler') {
      fehler(e.meldung);
    }
  });

  datumGrenzen(true);
  artAnpassen();
})();
