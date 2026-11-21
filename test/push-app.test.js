'use strict';

// Mitteilungen (seit v44), App-Teil: docs/aufgaben.js mit einem kleinen Schein-Browser laden und die Abläufe prüfen,
// die Codex bei der Prüfung von v44 gefunden hat (Abmelden ohne Netz, späte Antwort nach einem Wechsel der Person,
// Schlüsselwechsel, „an“ nur bei bestätigtem Gerät). Nur erfundene Namen, Adressen und Schlüssel.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const H = require('../docs/hilfen.js');

const QUELLE = fs.readFileSync(path.join(__dirname, '..', 'docs', 'aufgaben.js'), 'utf8');
const SCHLUESSEL = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]);
const ANDERER = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 9)]);
const ADRESSE = 'https://web.push.apple.com/QErfundenesTestgeraet0001';
const KENNUNG = crypto.createHash('sha256').update(ADRESSE).digest('hex').slice(0, 16);
const ruhe = async (n) => { for (let i = 0; i < (n || 12); i++) await new Promise((fertig) => setImmediate(fertig)); };

/** Schein-Element: nimmt alles an, was aufgaben.js beim Zeichnen damit macht. */
function element() {
  return { dataset: {}, children: [], open: false, hidden: false, value: '', scrollTop: 0, classList: { add() {}, toggle() {}, contains: () => false },
    append() {}, replaceChildren() {}, replaceWith() {}, setAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], contains: () => false, focus() {} };
}

/**
 * aufgaben.js laden. `o` = { abo (das Gerät ist beim Browser schon angemeldet), aboSchluessel, erlaubnis, geraete
 * (was die Schnittstelle für die Person kennt), antwort (aktion, extra, code) → Antwort oder Promise }.
 */
function laden(o) {
  const els = {};
  const el = (id) => (els[id] = els[id] || element());
  const b = { anfragen: [], meldungen: [], abgemeldet: 0, angemeldet: 0, gezeichnet: 0, aktuell: null };
  const abo = (schluessel) => ({ endpoint: ADRESSE, options: { applicationServerKey: Uint8Array.from(schluessel).buffer },
    toJSON() { return { endpoint: ADRESSE, keys: { p256dh: 'BA' + 'A'.repeat(85), auth: 'A'.repeat(22) } }; },
    unsubscribe: async () => { b.abgemeldet++; b.aktuell = null; return true; } });
  if (o.abo) b.aktuell = abo(o.aboSchluessel || SCHLUESSEL);
  const reg = { pushManager: { getSubscription: async () => b.aktuell, subscribe: async (opt) => { b.angemeldet++; b.aktuell = abo(Array.from(opt.applicationServerKey)); return b.aktuell; } } };
  const push = (geraete) => ({ schluessel: SCHLUESSEL.toString('base64url'), geraete: geraete });
  const Z = { code: 'CODE-ADA', name: 'Ada', sitzung: 1, schreibt: false, aufgabenPerson: null,
    daten: { heute: '2026-11-21', aufgaben: { team: ['Ada', 'Ben'], liste: [] }, push: push(o.geraete || []) } };
  const S = { H: H, zustand: Z, el: el, h: () => element(), fuellen: (e) => e, icon: () => element(), ansichten: { uebersicht() { b.gezeichnet++; } },
    auswertung: () => ({ heute: '2026-11-21' }), speicher: { lesen: () => '', schreiben() {} }, SCHLUESSEL: { ansicht: 'a', pushSpaeter: 'p' },
    melden: (text, fehler) => b.meldungen.push([text, !!fehler]), ansagen() {}, haptik() {}, blattZeigen() {}, blattSchliessen() {}, ansichtZeigen() {}, nachOben() {}, laden() {},
    frage: async () => true, neueAnfrageId: () => 'x', schreiben: async () => ({ art: 'ok', daten: {} }),
    anfrage: (aktion, extra, code) => {
      b.anfragen.push({ aktion: aktion, endpoint: extra && extra.endpoint, code: code || Z.code });
      return Promise.resolve(o.antwort ? o.antwort(aktion, extra, code || Z.code) : { art: 'ok', daten: { push: push(aktion === 'pushAnmelden' ? [KENNUNG] : []) } });
    } };
  const fenster = { SATE: S, matchMedia: () => ({ matches: true }), PushManager: function PushManager() {}, crypto: crypto.webcrypto,
    Notification: { permission: o.erlaubnis || 'granted', requestPermission: async () => o.erlaubnisNachFrage || 'granted' },
    location: { hash: '', pathname: '/', search: '' }, history: { replaceState() {} } };
  const navigator = { serviceWorker: { ready: Promise.resolve(reg), addEventListener() {} } };
  vm.runInNewContext(QUELLE, { window: fenster, navigator: navigator, document: { activeElement: null, querySelector: () => null },
    setTimeout: setTimeout, clearTimeout: clearTimeout, TextEncoder: TextEncoder, Uint8Array: Uint8Array, Promise: Promise, Date: Date });
  /** Abmelden wie in app.js: erst austragen (solange der Code da ist), dann vergessen. */
  const abmelden = () => { S.pushAustragen(); Z.code = ''; Z.sitzung++; Z.daten = null; S.aufgabenVergessen(); };
  /** Anmelden einer anderen Person auf demselben Gerät. */
  const anmelden = (code, name, geraete) => { Z.code = code; Z.name = name; Z.daten = { heute: '2026-11-21', aufgaben: { team: ['Ada', 'Ben'], liste: [] }, push: push(geraete || []) }; };
  return { S: S, Z: Z, b: b, push: push, abmelden: abmelden, anmelden: anmelden, zeichnen: () => S.ansichten.aufgaben() };
}

test('Mitteilungen in der App: „an“ erst, wenn die Schnittstelle das Gerät für die Person kennt', async () => {
  // Beim Browser angemeldet, die Schnittstelle kennt das Gerät noch nicht: Die App meldet es und zeigt erst dann „an“
  const t = laden({ abo: true });
  assert.strictEqual(t.S.pushStand(), 'moeglich', 'vor dem Nachsehen nicht „an“');
  t.zeichnen();
  await ruhe();
  assert.deepStrictEqual(t.b.anfragen.map((a) => [a.aktion, a.endpoint, a.code]), [['pushAnmelden', ADRESSE, 'CODE-ADA']]);
  assert.deepStrictEqual(Array.from(t.Z.daten.push.geraete), [KENNUNG]);
  assert.strictEqual(t.S.pushStand(), 'an');
  // Schon bekannt: keine Anfrage
  const u = laden({ abo: true, geraete: [KENNUNG] });
  u.zeichnen();
  await ruhe();
  assert.strictEqual(u.b.anfragen.length, 0);
  assert.strictEqual(u.S.pushStand(), 'an');
  // Die Schnittstelle nimmt es nicht an (z. B. kein Netz): nicht „an“, und nicht sofort wieder versuchen
  const v = laden({ abo: true, antwort: () => ({ art: 'fehler', meldung: 'Kein Internet', offline: true }) });
  v.zeichnen();
  await ruhe();
  assert.strictEqual(v.S.pushStand(), 'moeglich');
  v.zeichnen();
  await ruhe();
  assert.strictEqual(v.b.anfragen.length, 1, 'frühestens nach der Pause wieder');
  // Ohne Erlaubnis wird nichts gemeldet und nichts als „an“ gezeigt, auch wenn die Schnittstelle das Gerät kennt
  const w = laden({ abo: true, geraete: [KENNUNG], erlaubnis: 'default' });
  w.zeichnen();
  await ruhe();
  assert.strictEqual(w.S.pushStand(), 'moeglich');
  assert.strictEqual(w.b.anfragen.length, 0);
});

test('Mitteilungen in der App: Abmelden beendet die Anmeldung beim Browser, auch ohne Netz und ohne vorheriges Nachsehen', async () => {
  // Ohne Netz: Die Schnittstelle erreicht niemand, beim Browser ist trotzdem Schluss
  const t = laden({ abo: true, geraete: [KENNUNG], antwort: () => ({ art: 'fehler', meldung: 'Kein Internet', offline: true }) });
  t.zeichnen();
  await ruhe();
  t.abmelden();
  await ruhe();
  assert.strictEqual(t.b.abgemeldet, 1);
  assert.strictEqual(t.b.aktuell, null);
  assert.deepStrictEqual(t.b.anfragen.map((a) => [a.aktion, a.code]), [['pushAbmelden', 'CODE-ADA']], 'ausgetragen wird mit dem Code der abgemeldeten Person');
  // Die App hatte noch gar nicht nachgesehen (direkt nach dem Start abgemeldet): das Abo wird trotzdem gefunden und beendet
  const u = laden({ abo: true, geraete: [KENNUNG] });
  u.abmelden();
  await ruhe();
  assert.strictEqual(u.b.abgemeldet, 1);
  assert.deepStrictEqual(u.b.anfragen.map((a) => [a.aktion, a.code]), [['pushAbmelden', 'CODE-ADA']]);
  // Code ungültig geworden (kein Austragen möglich): beim Browser endet es trotzdem
  const v = laden({ abo: true, geraete: [KENNUNG] });
  v.Z.code = '';
  v.S.aufgabenVergessen();
  await ruhe();
  assert.strictEqual(v.b.abgemeldet, 1);
  assert.strictEqual(v.b.anfragen.length, 0);
});

test('Mitteilungen in der App: Eine Antwort, die nach dem Wechsel der Person kommt, ändert nichts mehr', async () => {
  // Ada: Abgleich läuft, die Antwort hängt. Inzwischen meldet sich Ada ab und Ben an.
  let antworten = null;
  const t = laden({ abo: true, antwort: (aktion) => (aktion === 'pushAnmelden' ? new Promise((fertig) => { antworten = fertig; }) : { art: 'ok', daten: { push: null } }) });
  t.zeichnen();
  await ruhe();
  assert.ok(antworten, 'die Anmeldung für Ada ist unterwegs');
  t.abmelden();
  t.anmelden('CODE-BEN', 'Ben', []);
  await ruhe();
  antworten({ art: 'ok', daten: { push: t.push([KENNUNG]) } });
  await ruhe();
  assert.deepStrictEqual(Array.from(t.Z.daten.push.geraete), [], 'Adas Antwort landet nicht in Bens Stand');
  assert.strictEqual(t.S.pushStand(), 'moeglich');
  // Einschalten unterwegs, dann abgemeldet: Das neue Abo wird beendet und der Eintrag mit dem alten Code wieder ausgetragen
  let fertigAnmelden = null;
  const u = laden({ antwort: (aktion) => (aktion === 'pushAnmelden' ? new Promise((fertig) => { fertigAnmelden = fertig; }) : { art: 'ok', daten: { push: null } }) });
  u.zeichnen();
  await ruhe();
  const laeuft = u.S.pushEinschalten();
  await ruhe();
  assert.strictEqual(u.b.angemeldet, 1);
  u.abmelden();
  u.anmelden('CODE-BEN', 'Ben', []);
  fertigAnmelden({ art: 'ok', daten: { push: u.push([KENNUNG]) } });
  await laeuft;
  await ruhe();
  assert.strictEqual(u.b.aktuell, null, 'kein Abo bleibt zurück');
  assert.ok(u.b.anfragen.filter((a) => a.aktion === 'pushAbmelden').length >= 1, 'der eben gemachte Eintrag wird wieder ausgetragen');
  assert.ok(u.b.anfragen.every((a) => a.code === 'CODE-ADA'), 'nichts davon läuft unter Bens Code');
  assert.deepStrictEqual(Array.from(u.Z.daten.push.geraete), []);
});

test('Mitteilungen in der App: Ein Abo zu einem alten Schlüssel der Schnittstelle wird beendet statt als „an“ gezeigt', async () => {
  const t = laden({ abo: true, aboSchluessel: ANDERER, geraete: [KENNUNG] });
  t.zeichnen();
  await ruhe();
  assert.strictEqual(t.b.abgemeldet, 1);
  assert.strictEqual(t.S.pushStand(), 'moeglich');
  assert.strictEqual(t.b.anfragen.length, 0, 'das alte Gerät wird nicht neu gemeldet');
  // Bewusst einschalten ersetzt es: neues Abo mit dem aktuellen Schlüssel, der Schnittstelle gemeldet
  await t.S.pushEinschalten();
  await ruhe();
  assert.strictEqual(t.b.angemeldet, 1);
  assert.deepStrictEqual(t.b.anfragen.map((a) => a.aktion), ['pushAnmelden']);
  assert.strictEqual(t.S.pushStand(), 'an');
  assert.deepStrictEqual(t.b.meldungen[t.b.meldungen.length - 1], ['Mitteilungen sind an', false]);
});

test('Mitteilungen in der App: Einschalten und Ausschalten', async () => {
  // Erlaubnis verweigert: nichts angemeldet, verständliche Meldung
  const t = laden({ erlaubnis: 'default', erlaubnisNachFrage: 'denied' });
  t.zeichnen();
  await ruhe();
  await t.S.pushEinschalten();
  assert.strictEqual(t.b.angemeldet, 0);
  assert.deepStrictEqual(t.b.meldungen, [['Mitteilungen sind für SATE nicht erlaubt.', true]]);
  // Die Schnittstelle lehnt ab: beim Browser wieder abgemeldet, sonst sähe es an aus und käme nichts
  const u = laden({ antwort: () => ({ art: 'fehler', meldung: 'Mitteilungen sind noch nicht eingerichtet, bitte Mark Bescheid geben' }) });
  u.zeichnen();
  await ruhe();
  await u.S.pushEinschalten();
  assert.strictEqual(u.b.angemeldet, 1);
  assert.strictEqual(u.b.abgemeldet, 1);
  assert.strictEqual(u.S.pushStand(), 'moeglich');
  assert.deepStrictEqual(u.b.meldungen, [['Mitteilungen sind noch nicht eingerichtet, bitte Mark Bescheid geben', true]]);
  // Ausschalten: beim Browser abmelden und bei der Schnittstelle austragen
  const v = laden({ abo: true, geraete: [KENNUNG] });
  v.zeichnen();
  await ruhe();
  assert.strictEqual(v.S.pushStand(), 'an');
  await v.S.pushAusschalten();
  assert.strictEqual(v.b.abgemeldet, 1);
  assert.deepStrictEqual(v.b.anfragen.map((a) => [a.aktion, a.endpoint]), [['pushAbmelden', ADRESSE]]);
  assert.strictEqual(v.S.pushStand(), 'moeglich');
});
