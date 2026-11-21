// Aufgaben fürs Team (seit v43): die eigenen Aufgaben auf dem Start, das Team als Reihe darunter, ein Blatt mit allen
// Aufgaben je Person und ein Blatt zum Anlegen und Ändern. Gerechnet wird in hilfen.js (aufgabenSicht, aufgabeFrist,
// aufgabePruefen), gespeichert über die Schnittstelle (aufgabeAnlegen, aufgabeAendern). Ohne den Tab „Aufgaben“ im
// Sheet (Antwortfeld `aufgaben` fehlt oder ist null) zeigt die App nichts davon.
(function () {
  'use strict';

  const S = window.SATE;
  const H = S.H;
  const Z = S.zustand;
  const h = S.h;

  const START_ANZAHL = 3; // so viele eigene Aufgaben zeigt der Start, der Rest steht im Blatt
  const ERLEDIGT_ANZAHL = 8; // so viele erledigte zeigt das Blatt
  const ruhig = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  /**
   * Heute für Fristen und die Abkürzungen im Formular: der Tag der Schnittstelle; bleibt die App über Mitternacht
   * offen, der Tag der Uhr (Berlin), sonst wäre „Heute“ der Tag von gestern (Codex v43).
   */
  const heute = () => {
    const stand = S.auswertung().heute;
    const uhr = H.heuteBerlin();
    return uhr > stand ? uhr : stand;
  };

  // Was gerade zur Schnittstelle unterwegs ist (ID → Änderung): Die Liste zeigt es sofort und springt nicht zurück,
  // wenn zwischendurch eine ältere Antwort ankommt. Mit der eigenen Antwort (oder einem Fehler) fällt der Eintrag weg.
  const unterwegs = new Map();
  let stand = 0;
  let memo = { roh: undefined, stand: -1, wert: null };

  /** Aufgaben des gezeigten Stands ({ team, liste }), mit dem, was gerade unterwegs ist; ohne die Funktion null. */
  function daten() {
    const roh = Z.daten ? Z.daten.aufgaben : null;
    if (memo.roh !== roh || memo.stand !== stand) {
      let d = H.aufgabenDaten(roh);
      if (d && unterwegs.size) {
        d = { team: d.team, liste: d.liste.map((x) => (unterwegs.has(x.id) ? Object.assign({}, x, unterwegs.get(x.id).lokal) : x)).filter((x) => x.status !== 'entfernt') };
      }
      memo = { roh: roh, stand: stand, wert: d };
    }
    return memo.wert;
  }
  S.aufgabenDa = () => !!daten();

  /**
   * Fokus merken, bevor ein Bereich neu gebaut wird: Wer mit der Tastatur unterwegs ist, steht danach wieder auf
   * demselben Knopf (`data-fokus`); nach einem Tipp bleibt kein Fokusring stehen. Rückgabe: Funktion, die ihn im
   * neu gebauten Bereich `in` wieder setzt.
   */
  function fokusMerken(bereich) {
    const f = document.activeElement;
    const merk = f && bereich && bereich.contains(f) && f.dataset && f.dataset.fokus !== undefined && f.matches(':focus-visible') ? f.dataset.fokus : null;
    return (neu) => {
      const wieder = merk === null || !neu ? null : Array.from(neu.querySelectorAll('[data-fokus]')).find((e) => e.dataset.fokus === merk);
      if (wieder) wieder.focus({ preventScroll: true });
    };
  }

  /** Start und ein offenes Blatt mit Aufgaben neu zeichnen. */
  function zeichnen() {
    if (!Z.daten) return;
    const start = S.el('uebersicht-inhalt');
    const zurueck = fokusMerken(start);
    S.ansichten.uebersicht();
    zurueck(start);
    S.aufgabenAuffrischen();
  }

  // Senden: eine Aktion nach der anderen (mehrere Haken kurz hintereinander), und nie während eine Buchung läuft
  let kette = Promise.resolve();
  let laufNr = 0;
  /**
   * Aktion an die Schnittstelle. `id` und `lokal`: Die Aufgabe zeigt die Änderung sofort (abhaken, löschen). Rückgabe:
   * Promise mit der Antwort wie S.schreiben. Bei einem Fehler nimmt die Liste die Änderung zurück und meldet ihn.
   */
  function senden(aktion, nutz, id, lokal) {
    const nr = ++laufNr;
    if (id && lokal) {
      unterwegs.set(id, { nr: nr, lokal: Object.assign({}, unterwegs.has(id) ? unterwegs.get(id).lokal : null, lokal) });
      stand++;
      zeichnen();
    }
    const sitzung = Z.sitzung;
    const lauf = kette.then(async () => {
      for (let i = 0; i < 100 && Z.schreibt && sitzung === Z.sitzung; i++) await new Promise((fertig) => setTimeout(fertig, 150));
      if (sitzung !== Z.sitzung) return { art: 'abgebrochen' };
      return S.schreiben(aktion, nutz);
    }).then((e) => {
      if (id && unterwegs.has(id) && unterwegs.get(id).nr === nr) unterwegs.delete(id);
      if (sitzung !== Z.sitzung) return { art: 'abgebrochen' };
      stand++;
      zeichnen();
      if (e.art === 'fehler') S.melden(e.meldung || 'Das hat nicht geklappt.', true);
      return e;
    });
    kette = lauf.catch(() => {});
    return lauf;
  }
  /** Beim Abmelden: nichts von der vorigen Person mitnehmen. */
  S.aufgabenVergessen = function () {
    unterwegs.clear();
    stand++;
  };

  // Zeilen ----------------------------------------------------------------------------------------------------------

  /**
   * Eine Aufgabe als Zeile: links der runde Haken (abhaken bzw. wieder öffnen), rechts Text und darunter die Frist,
   * für wen und von wem. `mitWer`: „für Jonas“ dazuschreiben (Liste über alle).
   */
  function aufgabeZeile(x, mitWer) {
    const fertig = x.status === 'erledigt';
    const frist = fertig ? { text: '', stufe: '' } : H.aufgabeFrist(x, heute());
    const rest = [fertig ? 'Erledigt' + (x.erledigtAm ? ' am ' + H.datumKurz(x.erledigtAm) : '') + (x.erledigtVon && x.erledigtVon !== x.fuer ? ' von ' + x.erledigtVon : '') : '',
      mitWer && x.fuer ? 'für ' + x.fuer : '', !fertig && x.von && x.von !== x.fuer ? 'von ' + x.von : ''].filter(Boolean).join(', ');
    const neben = [frist.text, rest].filter(Boolean).join(', ');
    const zeile = h('li', { class: 'aufgabe' + (fertig ? ' fertig' : ''), 'data-aufgabe': x.id });
    return S.fuellen(zeile,
      h('button', { type: 'button', class: 'af-haken', 'aria-pressed': fertig ? 'true' : 'false', 'aria-label': (fertig ? 'Wieder öffnen: ' : 'Erledigt: ') + x.titel,
        'data-fokus': 'haken:' + x.id, onclick: () => abhaken(zeile, x, !fertig) }, S.icon('haken')),
      h('button', { type: 'button', class: 'aufgabe-text', 'aria-label': x.titel + (neben ? ', ' + neben : '') + '. Ansehen und ändern', 'data-fokus': 'text:' + x.id,
        onclick: () => S.aufgabeOeffnen(x.id) },
        h('span', { class: 'aufgabe-titel', text: x.titel }),
        neben ? h('span', { class: 'aufgabe-neben' },
          frist.text ? h('span', { class: frist.stufe ? 'frist-' + frist.stufe : '', text: frist.text }) : null, rest ? (frist.text ? ', ' : '') + rest : null) : null));
  }

  /** Abhaken bzw. wieder öffnen: Der Haken füllt sich, die Zeile verblasst kurz, dann zieht die Liste nach. */
  function abhaken(zeile, x, fertig) {
    if (zeile.classList.contains('geht')) return;
    zeile.classList.add('geht');
    zeile.classList.toggle('abgehakt', fertig);
    S.haptik();
    // Die Sitzung gilt ab dem Tipp: Meldet sich in der kurzen Pause jemand ab (und eine andere Person an), wird der
    // Haken verworfen und nicht unter dem anderen Namen gesendet (Codex v43)
    const sitzung = Z.sitzung;
    const los = () => {
      if (sitzung !== Z.sitzung) return;
      senden('aufgabeAendern', { id: x.id, status: fertig ? 'erledigt' : 'offen' }, x.id,
        { status: fertig ? 'erledigt' : 'offen', erledigtAm: fertig ? heute() : '', erledigtVon: fertig ? Z.name : '' });
    };
    if (ruhig()) los(); else setTimeout(los, 380);
    S.ansagen(fertig ? 'Erledigt: ' + x.titel : 'Wieder offen: ' + x.titel);
  }

  const liste = (aufgaben, mitWer) => h('ul', { class: 'liste aufgaben-liste', role: 'list' }, aufgaben.map((x) => aufgabeZeile(x, mitWer)));

  // Start -----------------------------------------------------------------------------------------------------------

  /**
   * Abschnitt für den Start: „Deine Aufgaben“ (die nächsten drei, rechts „Neu“), darunter das Team als Reihe von
   * Kreisen mit der Zahl der offenen Aufgaben; ein Tipp öffnet das Blatt bei dieser Person. Ohne die Funktion null.
   */
  S.aufgabenStart = function () {
    const d = daten();
    if (!d) return null;
    const s = H.aufgabenSicht(d, Z.name, heute());
    const andere = s.personen.filter((p) => !p.ich);
    return [
      h('div', { class: 'h2-zeile aufgaben-kopf' }, h('h2', {}, h('strong', { text: 'Deine' }), ' Aufgaben'),
        h('button', { type: 'button', class: 'text-link h2-link', 'data-aufgaben': 'neu', onclick: () => S.aufgabeNeu(Z.name) }, S.icon('plus', 'link-icon'), 'Neu')),
      s.meine.length
        ? h('div', { class: 'karte liste-karte' }, liste(s.meine.slice(0, START_ANZAHL), false))
        : h('p', { class: 'hinweis aufgaben-leer', text: 'Nichts offen. Alles erledigt.' }),
      s.meine.length > START_ANZAHL
        ? h('button', { type: 'button', class: 'knopf mehr-knopf', 'data-aufgaben': 'alle', text: 'Alle ' + s.meine.length + ' zeigen', onclick: () => S.aufgabenZeigen(Z.name) }) : null,
      andere.length ? h('p', { class: 'kachel-label team-label', text: 'Im Team' }) : null,
      andere.length ? h('div', { class: 'team-reihe', role: 'group', 'aria-label': 'Aufgaben im Team' }, andere.map((p) =>
        h('button', { type: 'button', class: 'person' + (p.ueber ? ' ueber' : p.offen ? ' offen' : ''), 'data-person': p.name, onclick: () => S.aufgabenZeigen(p.name),
          'aria-label': p.name + ', ' + (p.offen ? p.offen + ' offen' + (p.ueber ? ', davon ' + p.ueber + ' überfällig' : '') : 'nichts offen') + '. Aufgaben zeigen' },
        h('span', { class: 'person-kreis', 'aria-hidden': 'true' }, H.initiale(p.name), p.offen ? h('span', { class: 'person-zahl', text: String(p.offen) }) : null),
        h('span', { class: 'person-name', text: p.name })))) : null,
    ];
  };

  /** Eintragen (Plus): oben eine Zeile „Aufgabe fürs Team“, sie öffnet das Blatt zum Anlegen. */
  S.ansichten.aufgaben = function () {
    const ziel = S.el('eintragen-aufgabe');
    if (!ziel) return;
    if (!daten()) return ziel.replaceChildren();
    S.fuellen(ziel, h('div', { class: 'karte liste-karte' }, h('ul', { class: 'liste', role: 'list' }, h('li', { class: 'kunde-zeile blick' },
      h('button', { type: 'button', class: 'zeilen-knopf', 'data-aufgaben': 'plus', onclick: () => S.aufgabeNeu(Z.name), 'aria-label': 'Aufgabe fürs Team anlegen' },
        h('span', { class: 'karte-symbol', 'aria-hidden': 'true' }, S.icon('aufgabe')),
        h('span', { class: 'rang-name' }, h('span', { class: 'rang-titel', text: 'Aufgabe fürs Team' }), h('span', { class: 'rang-unter', text: 'Wer macht was bis wann' })),
        h('span', { class: 'chevron klein', 'aria-hidden': 'true' }))))));
  };

  // Blatt mit allen Aufgaben ----------------------------------------------------------------------------------------

  /** Inhalt des Blatts „Aufgaben“ für die gewählte Person (Z.aufgabenPerson, null = alle). */
  function blattInhalt() {
    const d = daten();
    if (!d) return null;
    const s = H.aufgabenSicht(d, Z.name, heute());
    if (Z.aufgabenPerson !== null && !s.personen.some((p) => p.name === Z.aufgabenPerson)) Z.aufgabenPerson = null;
    const wer = Z.aufgabenPerson;
    const passt = (x) => wer === null || x.fuer === wer;
    const offen = s.offen.filter(passt);
    const erledigt = s.erledigt.filter(passt);
    const chip = (wert, text, zahl) => h('button', { type: 'button', class: 'chip', 'aria-pressed': wert === wer ? 'true' : 'false', 'data-fokus': 'person:' + wert,
      onclick: () => { if (wert !== wer) { Z.aufgabenPerson = wert; S.aufgabenAuffrischen(); } } }, text, zahl ? h('span', { class: 'chip-zahl', text: String(zahl) }) : null);
    const fuerWen = wer === null || wer === Z.name ? Z.name : wer;
    return h('div', { class: 'aufgaben-blatt', 'data-blatt': 'aufgaben' },
      h('div', { class: 'filter-chips', role: 'group', 'aria-label': 'Person' },
        chip(null, 'Alle', s.offen.length), s.personen.map((p) => chip(p.name, p.ich ? 'Ich' : p.name, p.offen))),
      offen.length ? liste(offen, wer === null)
        : h('p', { class: 'leer aufgaben-leer', text: wer === null ? 'Im Team ist nichts offen.' : wer === Z.name ? 'Du hast nichts offen.' : wer + ' hat nichts offen.' }),
      h('button', { type: 'button', class: 'knopf haupt aufgabe-neu', 'data-aufgaben': 'blatt-neu', onclick: () => S.aufgabeNeu(fuerWen, true) },
        'Neue Aufgabe' + (fuerWen !== Z.name ? ' für ' + fuerWen : '')),
      erledigt.length ? [h('p', { class: 'blatt-titel-klein', text: 'Erledigt' }), liste(erledigt.slice(0, ERLEDIGT_ANZAHL), wer === null),
        h('p', { class: 'hinweis offen-fuss', text: 'Erledigte bleiben 30 Tage stehen.' })] : null);
  }

  /** Blatt „Aufgaben“ öffnen, auf Wunsch bei einer Person (`person` undefined: wie zuletzt, null: alle). */
  S.aufgabenZeigen = function (person) {
    if (person !== undefined) Z.aufgabenPerson = person;
    const inhalt = blattInhalt();
    if (!inhalt) return;
    const von = Z.aufgabenPerson;
    S.blattZeigen('Aufgaben', inhalt, () => document.querySelector('#app [data-person="' + String(von).replace(/["\\]/g, '') + '"]') || document.querySelector('#app [data-aufgaben="neu"]'));
  };

  /** Neuer Stand oder andere Person: ein offenes Blatt „Aufgaben“ an Ort und Stelle neu bauen (das Formular bleibt, wie es ist). */
  S.aufgabenAuffrischen = function () {
    const b = S.el('blatt');
    const alt = b && b.open ? S.el('blatt-inhalt').querySelector('[data-blatt="aufgaben"]') : null;
    if (!alt) return;
    const neu = blattInhalt();
    if (!neu) return S.blattSchliessen(true);
    const zurueck = fokusMerken(alt);
    const reihe = alt.querySelector('.filter-chips');
    const links = reihe ? reihe.scrollLeft : 0;
    const oben = S.el('blatt-inhalt').scrollTop;
    alt.replaceWith(neu);
    S.el('blatt-inhalt').scrollTop = oben;
    if (neu.querySelector('.filter-chips')) neu.querySelector('.filter-chips').scrollLeft = links;
    zurueck(neu);
  };

  // Anlegen und Ändern ----------------------------------------------------------------------------------------------

  /**
   * Blatt mit dem Formular. `x` = Aufgabe zum Ändern oder null (neu), `fuer` = vorgewählte Person, `zurListe` = nach
   * dem Speichern wieder das Blatt „Aufgaben“ zeigen (von dort gekommen), sonst zu.
   */
  function formularZeigen(x, fuer, zurListe) {
    const d = daten();
    if (!d) return;
    const neu = !x;
    const fertig = !!x && x.status === 'erledigt';
    // Wer im Team steht; die Person der Aufgabe bleibt wählbar, auch wenn sie inzwischen keinen Zugang mehr hat
    const team = d.team.slice();
    if (x && x.fuer && team.indexOf(x.fuer) < 0) team.push(x.fuer);
    const namen = (team.indexOf(Z.name) >= 0 ? [Z.name] : []).concat(team.filter((n) => n !== Z.name));
    const wahl = { fuer: x ? x.fuer : (namen.indexOf(fuer) >= 0 ? fuer : namen[0] || ''), faellig: x ? x.faellig : '' };
    const titel = h('textarea', { id: 'af-titel', rows: '2', maxlength: String(H.MAX_AUFGABE_ZEICHEN), autocomplete: 'off', enterkeyhint: 'done', placeholder: 'z. B. Flyer aus dem Copyshop holen' });
    const datum = h('input', { id: 'af-datum', type: 'date', 'aria-label': 'Datum' });
    const zeit = h('input', { id: 'af-zeit', type: 'time', 'aria-label': 'Uhrzeit' });
    const zeitFeld = h('div', { class: 'feld af-zeit-feld' }, h('label', { for: 'af-zeit', class: 'feld-label' }, 'Uhrzeit ', h('span', { class: 'leise', text: '(optional)' })), zeit);
    const notiz = h('textarea', { id: 'af-notiz', rows: '2', maxlength: String(H.MAX_AUFGABE_NOTIZ), autocomplete: 'off', placeholder: 'Was man dazu wissen muss' });
    const fehler = h('p', { class: 'fehler', role: 'alert', hidden: '' });
    const speichern = h('button', { type: 'submit', class: 'knopf haupt', text: neu ? 'Anlegen' : 'Speichern' });
    titel.value = x ? x.titel : '';
    datum.value = wahl.faellig;
    zeit.value = x ? x.uhrzeit : '';
    notiz.value = x ? x.notiz : '';

    // Die Chips werden einmal gebaut; eine Wahl setzt nur `aria-pressed` um, damit der Fokus auf dem Knopf bleibt (Codex v43)
    const druecken = (reihe, wert) => Array.from(reihe.children).forEach((c) => c.setAttribute('aria-pressed', c.dataset.wert === wert ? 'true' : 'false'));
    const werChips = h('div', { class: 'chips-wahl', role: 'group', 'aria-label': 'Für wen' },
      namen.map((n) => h('button', { type: 'button', class: 'chip', 'data-wert': n, text: n === Z.name ? 'Ich' : n, onclick: () => { wahl.fuer = n; werZeichnen(); } })));
    const werZeichnen = () => druecken(werChips, wahl.fuer);
    const tageChips = h('div', { class: 'chips-wahl', role: 'group', 'aria-label': 'Bis wann' },
      [['', 'Ohne Datum']].concat(H.aufgabeTage(heute())).map(([wert, text]) => h('button', { type: 'button', class: 'chip', 'data-wert': wert, text: text,
        onclick: () => { wahl.faellig = wert; datum.value = wert; tageZeichnen(); } })));
    const tageZeichnen = () => {
      druecken(tageChips, wahl.faellig);
      zeitFeld.hidden = !wahl.faellig;
      if (!wahl.faellig) zeit.value = '';
    };
    datum.addEventListener('input', () => { wahl.faellig = datum.value; tageZeichnen(); });
    werZeichnen();
    tageZeichnen();

    const zurueck = () => (zurListe ? S.aufgabenZeigen() : S.blattSchliessen());
    // Eine Anfrage-ID je Entwurf: Kommt die Antwort nicht an (Zeitüberschreitung) und wird nochmal getippt, erkennt die
    // Schnittstelle die Wiederholung und legt nichts doppelt an (wie beim Buchen, Codex v43)
    const entwurfId = S.neueAnfrageId();
    const sperren = (an, text) => { speichern.disabled = an; speichern.textContent = an ? text : (neu ? 'Anlegen' : 'Speichern'); };
    const formular = h('form', { class: 'aufgabe-form', novalidate: '', 'data-blatt': 'aufgabe', onsubmit: async (ev) => {
      ev.preventDefault();
      if (speichern.disabled) return;
      const p = H.aufgabePruefen({ titel: titel.value, fuer: wahl.fuer, faellig: wahl.faellig, uhrzeit: zeit.value, notiz: notiz.value }, team, heute());
      fehler.hidden = p.ok;
      if (!p.ok) {
        fehler.textContent = p.meldung;
        if (p.feld === 'titel') titel.focus();
        return;
      }
      // Beim Ändern gehen nur die Felder mit, die hier wirklich geändert wurden: Was jemand anderes inzwischen an
      // einem anderen Feld geändert hat, bleibt stehen (Codex v43). Nichts geändert: nichts senden.
      const aenderung = neu ? null : H.aufgabeAenderung(x, p.daten);
      if (!neu && !Object.keys(aenderung).length) return zurueck();
      sperren(true, 'Speichert …');
      const e = await senden(neu ? 'aufgabeAnlegen' : 'aufgabeAendern', neu ? Object.assign({ anfrageId: entwurfId }, p.daten) : Object.assign({ id: x.id }, aenderung));
      if (!formular.isConnected) return;
      sperren(false);
      if (e.art !== 'ok') return;
      zurueck();
      S.melden(neu ? (p.daten.fuer === Z.name ? 'Aufgabe angelegt' : 'Aufgabe für ' + p.daten.fuer + ' angelegt') : 'Gespeichert');
    } });
    // Enter im Textfeld speichert (eine Aufgabe ist eine Zeile), Umbrüche gibt es in der Notiz
    titel.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); formular.requestSubmit(); } });

    const loeschen = async () => {
      if (!(await S.frage('„' + x.titel + '“ löschen? Die Aufgabe verschwindet für alle.', 'Löschen', 'Abbrechen', true))) return;
      senden('aufgabeAendern', { id: x.id, status: 'entfernt' }, x.id, { status: 'entfernt' });
      zurueck();
    };
    const umschalten = () => {
      senden('aufgabeAendern', { id: x.id, status: fertig ? 'offen' : 'erledigt' }, x.id,
        { status: fertig ? 'offen' : 'erledigt', erledigtAm: fertig ? '' : heute(), erledigtVon: fertig ? '' : Z.name });
      zurueck();
    };
    S.fuellen(formular,
      h('div', { class: 'feld' }, h('label', { for: 'af-titel', class: 'feld-label', text: 'Was ist zu tun?' }), titel),
      h('div', { class: 'feld' }, h('p', { class: 'feld-label', text: 'Für wen?' }), werChips),
      h('div', { class: 'feld' }, h('p', { class: 'feld-label', text: 'Bis wann?' }), tageChips, datum),
      zeitFeld,
      h('div', { class: 'feld' }, h('label', { for: 'af-notiz', class: 'feld-label' }, 'Notiz ', h('span', { class: 'leise', text: '(optional)' })), notiz),
      fehler,
      speichern,
      x ? h('div', { class: 'aufgabe-aktionen' },
        h('button', { type: 'button', class: 'text-link', text: fertig ? 'Wieder öffnen' : 'Als erledigt abhaken', onclick: umschalten }),
        h('button', { type: 'button', class: 'text-link gefahr-link', text: 'Löschen', onclick: loeschen })) : null,
      x ? h('p', { class: 'hinweis offen-fuss', text: 'Angelegt' + (x.von ? ' von ' + x.von : '') + (x.erstellt ? ' am ' + H.datumText(x.erstellt) : '') + '.' }) : null);
    S.blattZeigen(neu ? 'Neue Aufgabe' : 'Aufgabe', formular,
      () => (x ? document.querySelector('#app [data-aufgabe="' + x.id.replace(/["\\]/g, '') + '"] .aufgabe-text') : null) || document.querySelector('#app [data-aufgaben="neu"]'));
    // Beim Anlegen gleich lostippen (auf dem iPhone öffnet das die Tastatur nur direkt aus dem Tipp heraus)
    if (neu) titel.focus({ preventScroll: true });
  }

  /** Neue Aufgabe anlegen, vorgewählt für `fuer`. `zurListe`: danach wieder das Blatt „Aufgaben“. */
  S.aufgabeNeu = function (fuer, zurListe) {
    formularZeigen(null, fuer || Z.name, zurListe === true);
  };

  /** Eine Aufgabe ansehen und ändern. Aus dem Blatt „Aufgaben“ heraus geht es danach dorthin zurück. */
  S.aufgabeOeffnen = function (id) {
    const d = daten();
    const x = d ? d.liste.find((y) => y.id === id) : null;
    if (!x) return;
    const b = S.el('blatt');
    const ausListe = !!(b && b.open && S.el('blatt-inhalt').querySelector('[data-blatt="aufgaben"]'));
    formularZeigen(x, x.fuer, ausListe);
  };
})();
