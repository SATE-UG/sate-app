'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { lade, roh } = require('./lade');

const sha256Hex = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const zufall = (n) => Array.from(crypto.randomBytes(n));

test('Code: 12 Zeichen, nur erlaubte Zeichen, ohne 0/O/1/l/I', () => {
  const k = lade();
  assert.ok(k.__k.CODE_LAENGE >= 10);
  for (const c of '0O1lI') assert.ok(!k.__k.CODE_ALPHABET.includes(c), 'Zeichen ' + c + ' im Alphabet');
  for (let i = 0; i < 200; i++) {
    const code = k.codeErzeugen(zufall);
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{12}$/);
  }
});

test('Code: gleichverteilt (verwirft Bytes ab 248)', () => {
  const k = lade();
  // 248 → verworfen, 0 → 'A', 30 → '9', 247 → 247 % 31 = 30 → '9'
  const folge = [[248, 255, 0, 30, 247], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
  let i = 0;
  const code = k.codeErzeugen(() => folge[Math.min(i++, 1)]);
  assert.strictEqual(code, 'A99AAAAAAAAA');
  assert.throws(() => k.codeErzeugen(() => [255, 255]), /Zufallsquelle/);
});

test('Code anzeigen und normalisieren', () => {
  const k = lade();
  assert.strictEqual(k.codeAnzeigen('ABCDEFGHJKMN'), 'ABCD-EFGH-JKMN');
  assert.strictEqual(k.codeNormalisieren('abcd-efgh-jkmn'), 'ABCDEFGHJKMN');
  assert.strictEqual(k.codeNormalisieren(' ABCD EFGH JKMN '), 'ABCDEFGHJKMN');
  assert.strictEqual(k.codeNormalisieren('ABCD–EFGH–JKMN'), 'ABCDEFGHJKMN', 'Gedankenstrich vom iPhone');
  assert.strictEqual(k.codeNormalisieren('ABCDEFGHJKM'), '', 'zu kurz');
  assert.strictEqual(k.codeNormalisieren('ABCDEFGHJKM0'), '', 'Null nicht im Alphabet');
  assert.strictEqual(k.codeNormalisieren(42), '');
  assert.strictEqual(k.codeNormalisieren('A'.repeat(500)), '');
});

test('Hash: hängt von Salz und Code ab, Hex-Ausgabe', () => {
  const k = lade();
  const h = k.codeHash('salz1', 'ABCDEFGHJKMN', sha256Hex);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.strictEqual(h, sha256Hex('sate-app-v1:salz1:ABCDEFGHJKMN'));
  assert.notStrictEqual(h, k.codeHash('salz2', 'ABCDEFGHJKMN', sha256Hex));
  assert.strictEqual(k.hexAusBytes([0, 15, -1, 127, -128]), '000fff7f80');
});

test('gleich() und Namen', () => {
  const k = lade();
  assert.ok(k.gleich('abc', 'abc'));
  assert.ok(!k.gleich('abc', 'abd'));
  assert.ok(!k.gleich('abc', 'abcd'));
  assert.strictEqual(k.nameBereinigen('  Jonas  Müller '), 'Jonas Müller');
  assert.strictEqual(k.nameBereinigen(''), '');
  assert.strictEqual(k.nameBereinigen(undefined), '');
  assert.strictEqual(k.nameBereinigen('a\u0007b'), '');
  assert.strictEqual(k.nameBereinigen('x'.repeat(41)), '');
});

test('Einträge lesen: nur CODE:-Schlüssel, kaputte fallen weg, sortiert', () => {
  const k = lade();
  const liste = k.eintraegeLesen({
    CODE_SALZ: 'x', 'CODE:Nina': JSON.stringify({ hash: 'h2', gesperrt: true, angelegt: '2026-11-01', gesperrtAm: '2026-11-05' }),
    'CODE:Jonas': JSON.stringify({ hash: 'h1', gesperrt: false, angelegt: '2026-11-08' }), 'CODE:Kaputt': '{', 'CODE:Leer': '{}',
  });
  assert.deepStrictEqual(roh(liste), [
    { name: 'Jonas', hash: 'h1', gesperrt: false, angelegt: '2026-11-08', gesperrtAm: '' },
    { name: 'Nina', hash: 'h2', gesperrt: true, angelegt: '2026-11-01', gesperrtAm: '2026-11-05' },
  ]);
  assert.strictEqual(k.nameZumHash(liste, 'h1'), 'Jonas');
  assert.strictEqual(k.nameZumHash(liste, 'h2'), null, 'gesperrt');
  assert.strictEqual(k.nameZumHash(liste, 'h3'), null);
});

test('Anfrage lesen', () => {
  const k = lade();
  assert.deepStrictEqual(roh(k.anfrageLesen('{"code":"X","aktion":"ping"}')), { code: 'X', aktion: 'ping' });
  for (const t of ['', 'kein json', '[]', 'null', '{"code":1,"aktion":"ping"}', '{"code":"X"}', 'x'.repeat(2001), undefined]) {
    assert.deepStrictEqual(roh(k.anfrageLesen(t)), { fehler: 'Ungültige Anfrage' }, String(t).slice(0, 20));
  }
});

test('Zahlen lesen (Zahl oder deutscher Text)', () => {
  const k = lade();
  const faelle = [[8041, 8041], [7.3, 7.3], ['8.041', 8041], ['7,3', 7.3], ['22.193', 22193], ['1.234.567,8', 1234567.8],
    ['335', 335], ['-2,5', -2.5], [' 8 041 ', 8041], ['', null], ['abc', null], ['1.5', null], [true, null], [null, null],
    [NaN, null], [Infinity, null], [new Date(), null], ['-', null], ['1,2,3', null]];
  for (const [ein, aus] of faelle) assert.strictEqual(k.zahlLesen(ein), aus, JSON.stringify(ein));
});

function umgebung(k, extra) {
  const salz = 'testsalz';
  const zaehler = { kennzahlen: 0 };
  const u = Object.assign({
    salz: () => salz,
    eintraege: () => k.eintraegeLesen({
      'CODE:Jonas': JSON.stringify({ hash: k.codeHash(salz, 'ABCDEFGHJKMN', sha256Hex), gesperrt: false }),
      'CODE:Nina': JSON.stringify({ hash: k.codeHash(salz, 'NNNNPPPPQQQQ', sha256Hex), gesperrt: true }),
    }),
    sha256Hex: sha256Hex,
    kennzahlen: () => { zaehler.kennzahlen++; return { bestand: 8041, reichweite: '7,3' }; },
    jetzt: () => new Date('2026-11-08T15:00:00Z'),
  }, extra || {});
  return { u, zaehler };
}

test('bearbeiten: ping mit gültigem Code', () => {
  const k = lade();
  const { u, zaehler } = umgebung(k);
  const a = k.bearbeiten(JSON.stringify({ code: 'abcd-efgh-jkmn', aktion: 'ping' }), u);
  assert.deepStrictEqual(roh(a), { ok: true, name: 'Jonas', bestand: 8041, reichweite: 7.3, zeit: '2026-11-08T15:00:00.000Z' });
  assert.strictEqual(zaehler.kennzahlen, 1);
});

test('bearbeiten: falscher, gesperrter, kaputter Code → „Code ungültig“, Sheet bleibt ungelesen', () => {
  const k = lade();
  const { u, zaehler } = umgebung(k);
  for (const code of ['ABCDEFGHJKMP', 'NNNN-PPPP-QQQQ', 'zu kurz', '']) {
    assert.deepStrictEqual(roh(k.bearbeiten(JSON.stringify({ code: code, aktion: 'ping' }), u)), { ok: false, fehler: 'Code ungültig' });
  }
  const ohneSalz = umgebung(k, { salz: () => null }).u;
  assert.deepStrictEqual(roh(k.bearbeiten(JSON.stringify({ code: 'ABCDEFGHJKMN', aktion: 'ping' }), ohneSalz)),
    { ok: false, fehler: 'Code ungültig' });
  assert.strictEqual(zaehler.kennzahlen, 0);
});

test('bearbeiten: ungültige Anfrage und unbekannte Aktion', () => {
  const k = lade();
  const { u, zaehler } = umgebung(k);
  assert.deepStrictEqual(roh(k.bearbeiten('quatsch', u)), { ok: false, fehler: 'Ungültige Anfrage' });
  assert.deepStrictEqual(roh(k.bearbeiten(JSON.stringify({ code: 'ABCDEFGHJKMN', aktion: 'loeschen' }), u)),
    { ok: false, fehler: 'Unbekannte Aktion' });
  // Unbekannte Aktion mit falschem Code verrät nichts über die Aktionen
  assert.deepStrictEqual(roh(k.bearbeiten(JSON.stringify({ code: 'ABCDEFGHJKMP', aktion: 'loeschen' }), u)),
    { ok: false, fehler: 'Code ungültig' });
  assert.strictEqual(zaehler.kennzahlen, 0);
});

test('bearbeiten: leere oder Text-Zellen → null bzw. Zahl', () => {
  const k = lade();
  const { u } = umgebung(k, { kennzahlen: () => ({ bestand: '', reichweite: '#DIV/0!' }) });
  const a = k.bearbeiten(JSON.stringify({ code: 'ABCDEFGHJKMN', aktion: 'ping' }), u);
  assert.strictEqual(a.bestand, null);
  assert.strictEqual(a.reichweite, null);
});
