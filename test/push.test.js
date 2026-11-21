'use strict';

// Mitteilungen aufs Handy (Web Push): base64url, Kurve P-256, ECDSA-Signatur und VAPID-Token gegen Node geprüft,
// Endpunkt-Prüfung, Aktionen pushAnmelden und pushAbmelden, Senden nach einer neuen Aufgabe, Feld `push` in jeder
// Übersicht, Einrichten und Testen im Editor. Rein und über doPost mit Google-Attrappen (nichts geht ins Netz).
// Alle Namen, Texte und Adressen frei erfunden, alle Schlüssel erzeugt der Test selbst.

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { lade, ladeAlles, roh } = require('./lade');
const { neueWelt } = require('./google');
const D = require('./daten');

const k = lade();

// Helfer --------------------------------------------------------------------------------------------------------

/** SHA-256 und HMAC-SHA256 mit Node, Bytes als Zahlenlisten 0–255 (so kommen sie in die reine Logik herein). */
const sha256 = (bytes) => Array.from(crypto.createHash('sha256').update(Buffer.from(bytes)).digest());
const hmacSha256 = (schluessel, daten) => Array.from(crypto.createHmac('sha256', Buffer.from(schluessel)).update(Buffer.from(daten)).digest());
const sha256Hex = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const bytes = (puffer) => Array.from(puffer);
const hex = (liste) => Buffer.from(liste).toString('hex');
const ausHex = (text) => bytes(Buffer.from(text, 'hex'));

/** Frisches P-256-Schlüsselpaar von Node: privat als 32 Bytes, öffentlich als 65 Bytes (0x04, X, Y) und als Schlüsselobjekt. */
function schluesselpaar() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  const teil = (t) => Buffer.from(t, 'base64url');
  return { privat: bytes(teil(jwk.d)), oeffentlich: Buffer.concat([Buffer.from([4]), teil(jwk.x), teil(jwk.y)]), publicKey: publicKey };
}

/** Öffentlicher Schlüssel (65 Bytes oder base64url-Text) → Schlüsselobjekt von Node zum Prüfen. */
function schluesselObjekt(oeffentlich) {
  const b = typeof oeffentlich === 'string' ? Buffer.from(oeffentlich, 'base64url') : Buffer.from(oeffentlich);
  assert.strictEqual(b.length, 65);
  assert.strictEqual(b[0], 4);
  return crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b.subarray(1, 33).toString('base64url'), y: b.subarray(33).toString('base64url') } });
}

/** Prüft eine Signatur (r und s roh, 64 Bytes) mit Node. */
const signaturGilt = (daten, signatur, publicKey) =>
  crypto.verify('sha256', Buffer.from(daten), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signatur));

/** Token zerlegen und prüfen: Aufbau, Kopf, Signatur über `kopf.inhalt`. Rückgabe: der Inhalt. */
function tokenPruefen(jwt, publicKey) {
  const teile = jwt.split('.');
  assert.strictEqual(teile.length, 3);
  for (const t of teile) assert.match(t, /^[A-Za-z0-9_-]+$/);
  assert.strictEqual(Buffer.from(teile[0], 'base64url').toString('utf8'), '{"typ":"JWT","alg":"ES256"}');
  assert.strictEqual(Buffer.from(teile[2], 'base64url').length, 64, 'r und s roh');
  assert.ok(signaturGilt(Buffer.from(teile[0] + '.' + teile[1], 'utf8'), Buffer.from(teile[2], 'base64url'), publicKey), 'Signatur gilt');
  return JSON.parse(Buffer.from(teile[1], 'base64url').toString('utf8'));
}

// Erfundene Adressen bei den vier Push-Diensten
const APPLE = 'https://web.push.apple.com/QErfundenesGeraet-Eins_0001';
const APPLE_2 = 'https://web.push.apple.com/QErfundenesGeraet-Zwei_0002';
const GOOGLE = 'https://fcm.googleapis.com/fcm/send/erfunden0003:APA91bErfunden_Drei-0003';
const MOZILLA = 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAErfundenVier0004';
const WINDOWS = 'https://db5p.notify.windows.com/w/?token=ErfundenFuenf%2b0005%3d';
const kennung = (endpunkt) => sha256Hex(endpunkt).slice(0, 16);
// Erfundene Schlüsseltexte eines Geräts (nur gespeichert, nie benutzt)
const P256DH = Buffer.concat([Buffer.from([4]), crypto.randomBytes(64)]).toString('base64url');
const AUTH = crypto.randomBytes(16).toString('base64url');

// Rein: Bytes und Text ------------------------------------------------------------------------------------------

test('base64url: hin und zurück wie Node, ohne Füllzeichen, Ungültiges → null', () => {
  for (let n = 0; n <= 70; n++) {
    const b = crypto.randomBytes(n);
    const text = k.base64urlAusBytes(bytes(b));
    assert.strictEqual(text, b.toString('base64url'), 'Länge ' + n);
    assert.deepStrictEqual(roh(k.bytesAusBase64url(text)), bytes(b), 'Länge ' + n);
  }
  // Bytes mit Vorzeichen wie in Apps Script
  assert.strictEqual(k.base64urlAusBytes([-1, -128, 127, 0]), Buffer.from([255, 128, 127, 0]).toString('base64url'));
  assert.strictEqual(k.base64urlAusBytes([251, 255, 191]), '-_-_', 'die beiden Zeichen von base64url, nicht + und /');
  assert.deepStrictEqual(roh(k.bytesAusBase64url('')), []);
  for (const t of ['A', 'AAAAA', 'AA==', 'AA=', '+/+/', 'AA AA', 'ÄÄÄÄ', 'AB', 'AAB', null, undefined, 5, ['AAAA'], {}]) {
    assert.strictEqual(k.bytesAusBase64url(t), null, JSON.stringify(t));
  }
});

test('utf8Bytes wie Node, Bytes ↔ Zahl', () => {
  for (const t of ['', 'abc', '{"typ":"JWT"}', 'Grüße', '€', '🍹 kalt', 'a\ud800b']) assert.deepStrictEqual(roh(k.utf8Bytes(t)), bytes(Buffer.from(t, 'utf8')), t);
  assert.strictEqual(k.zahlAusBytes([]), 0n);
  assert.strictEqual(k.zahlAusBytes([0, 0, 1, 0]), 256n);
  assert.strictEqual(k.zahlAusBytes([-1, -1]), 65535n, 'Bytes mit Vorzeichen');
  assert.deepStrictEqual(roh(k.bytesAusZahl(0n, 3)), [0, 0, 0]);
  assert.deepStrictEqual(roh(k.bytesAusZahl(258n, 4)), [0, 0, 1, 2]);
  assert.deepStrictEqual(roh(k.bytesAusZahl(65535n, 2)), [255, 255]);
  assert.throws(() => k.bytesAusZahl(65536n, 2), /passt nicht/);
  assert.throws(() => k.bytesAusZahl(-1n, 2), /passt nicht/);
  for (let i = 0; i < 20; i++) {
    const b = bytes(crypto.randomBytes(32));
    assert.deepStrictEqual(roh(k.bytesAusZahl(k.zahlAusBytes(b), 32)), b);
    assert.strictEqual(k.zahlAusBytes(b), BigInt('0x' + hex(b)));
  }
});

// Rein: Kurve ---------------------------------------------------------------------------------------------------

test('P-256: Basispunkt liegt auf der Kurve, n × G ist unendlich fern, Addition und Verdopplung passen zusammen', () => {
  const { P256_P, P256_N, P256_B, P256_GX, P256_GY } = k.__k;
  const G = k.p256Basispunkt();
  assert.strictEqual(G.x, P256_GX);
  assert.strictEqual((P256_GY * P256_GY - (P256_GX * P256_GX * P256_GX - 3n * P256_GX + P256_B)) % P256_P, 0n);
  assert.strictEqual(k.punktAufKurve(G), true);
  assert.strictEqual(k.punktAufKurve({ x: G.x, y: G.y + 1n }), false);
  assert.strictEqual(k.punktAufKurve({ x: G.x + P256_P, y: G.y }), false, 'Koordinaten nur von 0 bis p − 1');
  assert.strictEqual(k.punktAufKurve(null), false);
  // 2G bekannt (aus den üblichen Testvektoren für P-256)
  const g2 = k.punktVerdoppeln(G);
  assert.strictEqual(g2.x.toString(16), '7cf27b188d034f7e8a52380304b51ac3c08969e277f21b35a60b48fc47669978');
  assert.strictEqual(g2.y.toString(16), '7775510db8ed040293d9ac69f7430dbba7dade63ce982299e04b79d227873d1');
  assert.deepStrictEqual([k.punktAddieren(G, G).x, k.punktAddieren(G, G).y], [g2.x, g2.y], 'G + G = 2G');
  const g3 = k.punktAddieren(g2, G);
  assert.deepStrictEqual([k.punktMal(3n, G).x, k.punktMal(3n, G).y], [g3.x, g3.y]);
  assert.deepStrictEqual([k.punktAddieren(G, g2).x, k.punktAddieren(G, g2).y], [g3.x, g3.y], 'Addition ist vertauschbar');
  assert.ok(k.punktAufKurve(g2) && k.punktAufKurve(g3));
  // (n − 1) × G = −G, n × G und G + (−G) sind unendlich fern (null), 0 × G auch; unendlich fern ist das neutrale Element
  const minus = k.punktMal(P256_N - 1n, G);
  assert.deepStrictEqual([minus.x, minus.y], [G.x, P256_P - G.y]);
  assert.strictEqual(k.punktMal(P256_N, G), null);
  assert.strictEqual(k.punktAddieren(G, minus), null);
  assert.strictEqual(k.punktMal(0n, G), null);
  assert.strictEqual(k.punktVerdoppeln(null), null);
  assert.deepStrictEqual([k.punktAddieren(null, G).x, k.punktAddieren(G, null).y], [G.x, G.y]);
  assert.deepStrictEqual([k.punktMal(P256_N + 1n, G).x, k.punktMal(1n, G).y], [G.x, G.y]);
  assert.throws(() => k.punktMal(-1n, G), /Skalar/);
  assert.throws(() => k.punktMal(5, G), /Skalar/);
  // (a + b) × G = a × G + b × G
  for (let i = 0; i < 5; i++) {
    const a = BigInt('0x' + crypto.randomBytes(31).toString('hex'));
    const b = BigInt('0x' + crypto.randomBytes(31).toString('hex'));
    const links = k.punktMal(a + b, G);
    const rechts = k.punktAddieren(k.punktMal(a, G), k.punktMal(b, G));
    assert.deepStrictEqual([links.x, links.y], [rechts.x, rechts.y]);
  }
  // Kehrwert
  for (const a of [1n, 2n, 12345n, P256_N - 1n]) assert.strictEqual((a * k.modKehrwert(a, P256_N)) % P256_N, 1n);
  assert.strictEqual(k.modulo(-1n, 7n), 6n);
  assert.throws(() => k.modKehrwert(0n, P256_N), /Kehrwert/);
});

test('öffentlicher Schlüssel aus dem privaten: derselbe Punkt wie bei Node, unkomprimiert 65 Bytes', () => {
  for (let i = 0; i < 25; i++) {
    const s = schluesselpaar();
    const pub = roh(k.pushOeffentlicherSchluessel(s.privat));
    assert.strictEqual(pub.length, 65);
    assert.strictEqual(pub[0], 4);
    assert.strictEqual(hex(pub), s.oeffentlich.toString('hex'), 'Schlüssel ' + i);
    assert.strictEqual(k.pushPrivatGueltig(s.privat), true);
  }
  // d = 1 → G, d = n − 1 → −G
  const { P256_N, P256_P, P256_GX, P256_GY } = k.__k;
  const eins = new Array(31).fill(0).concat([1]);
  assert.strictEqual(hex(k.pushOeffentlicherSchluessel(eins)), '04' + P256_GX.toString(16).padStart(64, '0') + P256_GY.toString(16).padStart(64, '0'));
  const letzter = roh(k.bytesAusZahl(P256_N - 1n, 32));
  assert.strictEqual(hex(k.pushOeffentlicherSchluessel(letzter)), '04' + P256_GX.toString(16).padStart(64, '0') + (P256_P - P256_GY).toString(16).padStart(64, '0'));
  // gültig nur 1 ≤ d < n und genau 32 Bytes
  const n = roh(k.bytesAusZahl(P256_N, 32));
  for (const d of [new Array(32).fill(0), n, new Array(32).fill(255), eins.slice(1), eins.concat([0]), [], null, undefined]) {
    assert.strictEqual(k.pushPrivatGueltig(d), false, String(JSON.stringify(d)).slice(0, 30));
    assert.throws(() => k.pushOeffentlicherSchluessel(d), /Privater Schlüssel ungültig/);
  }
  assert.strictEqual(k.pushPrivatGueltig(letzter), true);
});

// Rein: Signatur ------------------------------------------------------------------------------------------------

test('ECDSA: Signaturen (r und s roh, 64 Bytes) gelten bei Node, für viele Schlüssel und Nachrichten', () => {
  const nachrichten = [Buffer.alloc(0), Buffer.from('a'), Buffer.from('Kühlschrank auffüllen 🍹', 'utf8'), crypto.randomBytes(31), crypto.randomBytes(32),
    crypto.randomBytes(33), crypto.randomBytes(1000)];
  for (let i = 0; i < 8; i++) {
    const s = schluesselpaar();
    const fremd = schluesselpaar();
    for (const n of nachrichten) {
      const sig = roh(k.ecdsaSignieren(bytes(n), s.privat, sha256, hmacSha256));
      assert.strictEqual(sig.length, 64);
      assert.ok(sig.every((b) => Number.isInteger(b) && b >= 0 && b <= 255));
      assert.ok(signaturGilt(n, sig, s.publicKey), 'Schlüssel ' + i + ', Länge ' + n.length);
      assert.ok(!signaturGilt(Buffer.concat([n, Buffer.from('x')]), sig, s.publicKey), 'andere Nachricht gilt nicht');
      assert.ok(!signaturGilt(n, sig, fremd.publicKey), 'anderer Schlüssel gilt nicht');
      // deterministisch (RFC 6979): dieselbe Eingabe, dieselbe Signatur
      assert.deepStrictEqual(roh(k.ecdsaSignieren(bytes(n), s.privat, sha256, hmacSha256)), sig);
    }
  }
  // Hash-Funktionen dürfen Bytes mit Vorzeichen liefern (wie in Apps Script)
  const s = schluesselpaar();
  const mitVorzeichen = (f) => (...a) => f(...a).map((b) => (b > 127 ? b - 256 : b));
  const daten = bytes(Buffer.from('Vorzeichen'));
  assert.deepStrictEqual(roh(k.ecdsaSignieren(daten, s.privat, mitVorzeichen(sha256), mitVorzeichen(hmacSha256))),
    roh(k.ecdsaSignieren(daten, s.privat, sha256, hmacSha256)));
  // ungültiger Schlüssel, kaputte Hash-Funktion
  assert.throws(() => k.ecdsaSignieren(daten, new Array(32).fill(0), sha256, hmacSha256), /Privater Schlüssel ungültig/);
  assert.throws(() => k.ecdsaSignieren(daten, s.privat, () => [1, 2, 3], hmacSha256), /32 Bytes/);
});

test('ECDSA: Testvektoren aus RFC 6979 Anhang A.2.5 (P-256, SHA-256, „sample“ und „test“)', () => {
  // Öffentlich bekannter Beispielschlüssel aus dem RFC, kein echter Schlüssel
  const privat = ausHex('c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721');
  const ux = '60fed4ba255a9d31c961eb74c6356d68c049b8923b61fa6ce669622e60f29fb6';
  const uy = '7903fe1008b8bc99a41ae9e95628bc64f2f1b20c2d7e9f5177a3c294d4462299';
  const pub = roh(k.pushOeffentlicherSchluessel(privat));
  assert.strictEqual(hex(pub), '04' + ux + uy);
  const vektoren = [
    ['sample', 'efd48b2aacb6a8fd1140dd9cd45e81d69d2c877b56aaf991c34d0ea84eaf3716', 'f7cb1c942d657c41d436c7a1b6e29f65f3e900dbb9aff4064dc4ab2f843acda8'],
    ['test', 'f1abb023518351cd71d881567b1ea663ed3efcf6c5132b354f28d3b0b7d38367', '019f4113742a2b14bd25926b49c649155f267e60d3814b4c0cc84250e46f0083'],
  ];
  for (const [nachricht, r, s] of vektoren) {
    const sig = roh(k.ecdsaSignieren(bytes(Buffer.from(nachricht, 'utf8')), privat, sha256, hmacSha256));
    assert.strictEqual(hex(sig), r + s, nachricht);
    assert.ok(signaturGilt(Buffer.from(nachricht, 'utf8'), sig, schluesselObjekt(pub)), nachricht);
  }
});

// Rein: VAPID ---------------------------------------------------------------------------------------------------

test('vapidJwt: Kopf, Inhalt { aud, exp, sub }, Signatur über kopf.inhalt gilt bei Node', () => {
  assert.strictEqual(k.__k.PUSH_KONTAKT, 'https://sate-ug.github.io/sate-app/');
  for (const endpunkt of [APPLE, GOOGLE, MOZILLA, WINDOWS]) {
    const s = schluesselpaar();
    const aud = k.pushUrsprung(endpunkt);
    const jwt = k.vapidJwt(aud, 1795000000, s.privat, sha256, hmacSha256);
    const inhalt = tokenPruefen(jwt, s.publicKey);
    assert.deepStrictEqual(inhalt, { aud: aud, exp: 1795000000, sub: 'https://sate-ug.github.io/sate-app/' });
    assert.deepStrictEqual(Object.keys(inhalt), ['aud', 'exp', 'sub']);
    assert.strictEqual(jwt.split('.')[0], Buffer.from('{"typ":"JWT","alg":"ES256"}').toString('base64url'));
    // ein anderes Byte im Inhalt: Signatur gilt nicht mehr
    const teile = jwt.split('.');
    const anders = Buffer.from(JSON.stringify({ aud: aud, exp: 1795000001, sub: inhalt.sub })).toString('base64url');
    assert.ok(!signaturGilt(Buffer.from(teile[0] + '.' + anders), Buffer.from(teile[2], 'base64url'), s.publicKey));
  }
  assert.deepStrictEqual([APPLE, GOOGLE, MOZILLA, WINDOWS].map((e) => k.pushUrsprung(e)),
    ['https://web.push.apple.com', 'https://fcm.googleapis.com', 'https://updates.push.services.mozilla.com', 'https://db5p.notify.windows.com']);
});

test('pushKopfzeilen: Authorization mit Token und öffentlichem Schlüssel, TTL und Urgency als Text', () => {
  assert.deepStrictEqual(roh(k.pushKopfzeilen('aaa.bbb.ccc', 'BOeffentlich')), { Authorization: 'vapid t=aaa.bbb.ccc, k=BOeffentlich', TTL: '86400', Urgency: 'normal' });
});

test('pushAnfragen: je Gerät eine Anfrage, Token je Push-Dienst einmal, exp = jetzt + 12 Stunden', () => {
  const s = schluesselpaar();
  const pub = s.oeffentlich.toString('base64url');
  const eintrag = (endpoint, seit) => JSON.stringify({ endpoint: endpoint, p256dh: P256DH, auth: AUTH, seit: seit });
  const eig = { PUSH_VAPID_PRIVAT: Buffer.from(s.privat).toString('base64url'), PUSH_VAPID_OEFFENTLICH: pub, CODE_SALZ: 'x' };
  eig['push:Nina:' + kennung(APPLE)] = eintrag(APPLE, '2026-11-01T10:00:00.000Z');
  eig['push:Nina:' + kennung(APPLE_2)] = eintrag(APPLE_2, '2026-11-02T10:00:00.000Z');
  eig['push:Nina:' + kennung(GOOGLE)] = eintrag(GOOGLE, '2026-11-03T10:00:00.000Z');
  eig['push:Jonas:' + kennung(MOZILLA)] = eintrag(MOZILLA, '2026-11-01T10:00:00.000Z');
  const jetzt = Date.parse('2026-11-21T12:00:00.500Z');
  let signiert = 0;
  const plan = roh(k.pushAnfragen(eig, 'Nina', jetzt, (b) => { signiert++; return sha256(b); }, hmacSha256));
  assert.deepStrictEqual(plan.map((p) => [p.kennung, p.eigenschaft, p.url]), [APPLE, APPLE_2, GOOGLE].map((e) => [kennung(e), 'push:Nina:' + kennung(e), e]));
  assert.strictEqual(signiert, 2, 'zwei Push-Dienste, zwei Signaturen');
  const tokens = plan.map((p) => /^vapid t=([A-Za-z0-9_.-]+), k=([A-Za-z0-9_-]+)$/.exec(p.kopfzeilen.Authorization));
  assert.ok(tokens.every((m) => m && m[2] === pub));
  assert.strictEqual(tokens[0][1], tokens[1][1], 'dasselbe Token für denselben Push-Dienst');
  assert.notStrictEqual(tokens[0][1], tokens[2][1]);
  const exp = Math.floor(jetzt / 1000) + 12 * 3600;
  assert.strictEqual(k.__k.PUSH_TOKEN_SEKUNDEN, 43200);
  assert.deepStrictEqual(tokenPruefen(tokens[0][1], s.publicKey), { aud: 'https://web.push.apple.com', exp: exp, sub: 'https://sate-ug.github.io/sate-app/' });
  assert.deepStrictEqual(tokenPruefen(tokens[2][1], s.publicKey), { aud: 'https://fcm.googleapis.com', exp: exp, sub: 'https://sate-ug.github.io/sate-app/' });
  for (const p of plan) assert.deepStrictEqual(Object.keys(p.kopfzeilen), ['Authorization', 'TTL', 'Urgency']);
  // ohne Geräte, ohne Schlüssel: nichts
  assert.deepStrictEqual(roh(k.pushAnfragen(eig, 'Olaf', jetzt, sha256, hmacSha256)), []);
  const ohne = Object.assign({}, eig);
  delete ohne.PUSH_VAPID_PRIVAT;
  assert.deepStrictEqual(roh(k.pushAnfragen(ohne, 'Nina', jetzt, sha256, hmacSha256)), []);
  assert.deepStrictEqual(roh(k.pushAnfragen({}, 'Nina', jetzt, sha256, hmacSha256)), []);
  // an einen Eintrag mit fremder Adresse (von Hand in die Skripteigenschaften geschrieben) wird nie gesendet
  eig['push:Nina:0123456789abcdef'] = eintrag('https://boese.example/klau', '2026-11-04T10:00:00.000Z');
  assert.deepStrictEqual(roh(k.pushAnfragen(eig, 'Nina', jetzt, sha256, hmacSha256)).map((p) => p.url), [APPLE, APPLE_2, GOOGLE]);
});

// Rein: Endpunkte und Skripteigenschaften -----------------------------------------------------------------------

test('pushUrsprung: nur https bei den Push-Diensten der Browser, kein Port, keine Zugangsdaten', () => {
  const erlaubt = [APPLE, GOOGLE, MOZILLA, WINDOWS,
    'https://web.push.apple.com/', 'https://api.push.apple.com/3/device/erfunden', 'https://eu-1.api.push.apple.com/x',
    'https://wns2-par02p.notify.windows.com/w/?token=AwYAAAerfunden%2f%3d&x=1', 'https://fcm.googleapis.com/wp/erfunden-_~.:@!$\'()*+,;=',
    'https://web.push.apple.com/' + 'a'.repeat(1000 - 'https://web.push.apple.com/'.length)];
  for (const e of erlaubt) assert.strictEqual(k.pushUrsprung(e), /^https:\/\/[^/]+/.exec(e)[0], e.slice(0, 80));
  const abgelehnt = [
    'https://web.push.apple.com.boese.example/abc', 'http://web.push.apple.com/abc', 'https://web.push.apple.com:8443/abc',
    'https://web.push.apple.com:443/abc', 'https://nutzer:geheim@web.push.apple.com/abc', 'https://nutzer@web.push.apple.com/abc',
    'https://boese.example/abc', 'https://boese.example/https://web.push.apple.com/abc', 'https://boese.example/?x=.push.apple.com',
    'https://boese.example#@web.push.apple.com/abc', 'https://boese.example\\@web.push.apple.com/abc', 'https://web.push.apple.com\\@boese.example/abc',
    'https://web.push.apple.com@boese.example/abc', 'https://web.push.apple.com.boese.example', 'https://web.push.apple.com',
    'https://push.apple.com/abc', 'https://xpush.apple.com/abc', 'https://webpush.apple.com/abc', 'https://.push.apple.com/abc',
    'https://x..push.apple.com/abc', 'https://-x.push.apple.com/abc', 'https://x-.push.apple.com/abc', 'https://web.push.apple.com./abc',
    'https://notify.windows.com/abc', 'https://boesenotify.windows.com/abc', 'https://fcm.googleapis.com.boese.example/abc',
    'https://x.fcm.googleapis.com/abc', 'https://googleapis.com/abc', 'https://storage.googleapis.com/abc',
    'https://x.updates.push.services.mozilla.com/abc', 'https://push.services.mozilla.com/abc',
    'https://WEB.PUSH.APPLE.COM/abc', 'HTTPS://web.push.apple.com/abc', 'https://web.push.apple.com/a b', 'https://web.push.apple.com/a\nb',
    'https://web.push.apple.com/abc\n', ' https://web.push.apple.com/abc', 'https://web.push.apple.com/abc#teil', 'https://web.push.apple.com/a\\b',
    'https://web.push.apple.com/ä', 'https://wéb.push.apple.com/abc', 'https://[::1]/abc', 'https://127.0.0.1/abc', 'https://localhost/abc',
    'https:///web.push.apple.com/abc', 'https:/web.push.apple.com/abc', '//web.push.apple.com/abc', 'web.push.apple.com/abc',
    'ftp://web.push.apple.com/abc', 'javascript:alert(1)', 'data:text/plain,https://web.push.apple.com/abc',
    'https://web.push.apple.com/' + 'a'.repeat(1001 - 'https://web.push.apple.com/'.length),
    '', ' ', null, undefined, 5, true, {}, [APPLE], { toString: () => APPLE },
  ];
  for (const e of abgelehnt) assert.strictEqual(k.pushUrsprung(e), '', String(e).slice(0, 80));
});

test('pushUrsprung: Hostnamen, die es im Netz nicht geben kann, und kaputtes % fallen durch', () => {
  const teil = (n) => 'a'.repeat(n);
  assert.strictEqual(k.pushUrsprung('https://' + teil(63) + '.push.apple.com/abc'), 'https://' + teil(63) + '.push.apple.com');
  assert.strictEqual(k.pushUrsprung('https://' + teil(64) + '.push.apple.com/abc'), '', 'ein Teil mit 64 Zeichen');
  const lang = (n) => [teil(63), teil(63), teil(63), teil(n)].join('.') + '.notify.windows.com';
  assert.strictEqual(lang(42).length, 253);
  assert.strictEqual(k.pushUrsprung('https://' + lang(42) + '/abc'), 'https://' + lang(42));
  assert.strictEqual(k.pushUrsprung('https://' + lang(43) + '/abc'), '', 'Host mit 254 Zeichen');
  for (const e of ['https://web.push.apple.com/a%2fb%3D%0a', 'https://db5p.notify.windows.com/w/?token=a%2Bb']) assert.notStrictEqual(k.pushUrsprung(e), '', e);
  for (const e of ['https://web.push.apple.com/a%', 'https://web.push.apple.com/a%2', 'https://web.push.apple.com/%zz', 'https://web.push.apple.com/a%2g', 'https://web.push.apple.com/%%20']) {
    assert.strictEqual(k.pushUrsprung(e), '', e);
  }
});

test('pushNachDienst: je Push-Dienst ein Bündel, Reihenfolge bleibt', () => {
  const plan = [{ kennung: 'a', dienst: 'https://web.push.apple.com' }, { kennung: 'b', dienst: 'https://fcm.googleapis.com' },
    { kennung: 'c', dienst: 'https://web.push.apple.com' }, { kennung: 'd', dienst: 'https://db5p.notify.windows.com' }];
  assert.deepStrictEqual(roh(k.pushNachDienst(plan)).map((g) => g.map((x) => x.kennung)), [['a', 'c'], ['b'], ['d']]);
  assert.deepStrictEqual(roh(k.pushNachDienst([])), []);
  assert.deepStrictEqual(roh(k.pushNachDienst(undefined)), []);
});

test('pushLogText: eine Zeile, höchstens 200 Zeichen, ohne Adressen und ohne Teile der Anfrage', () => {
  const s = schluesselpaar();
  const eig = { PUSH_VAPID_PRIVAT: Buffer.from(s.privat).toString('base64url'), PUSH_VAPID_OEFFENTLICH: s.oeffentlich.toString('base64url') };
  for (const e of [GOOGLE, WINDOWS]) eig['push:Nina:' + kennung(e)] = JSON.stringify({ endpoint: e, p256dh: P256DH, auth: AUTH, seit: '2026-11-01T10:00:00.000Z' });
  const plan = k.pushAnfragen(eig, 'Nina', Date.now(), sha256, hmacSha256);
  assert.deepStrictEqual(roh(plan).map((x) => x.dienst), ['https://fcm.googleapis.com', 'https://db5p.notify.windows.com']);
  const token = /t=([^,]+),/.exec(plan[0].kopfzeilen.Authorization)[1];
  // harmlose Antworten bleiben, wie sie sind
  for (const t of ['{"reason":"BadJwtToken"}', '{"code": 401, "errno": 109, "error": "Unauthorized"}', 'messaging/registration-token-not-registered', 'VapidPkHashMismatch']) {
    assert.strictEqual(k.pushLogText(t, plan), t);
  }
  assert.strictEqual(k.pushLogText('  Zeile eins\r\n\tZeile   zwei \n', plan), 'Zeile eins Zeile zwei');
  assert.strictEqual(k.pushLogText('x'.repeat(500), plan).length, 200);
  for (const t of [null, undefined, '']) assert.strictEqual(k.pushLogText(t, plan), '');
  assert.strictEqual(k.pushLogText(404, plan), '404');
  // Adresse, Pfad, Teile des Pfads (auch entschlüsselt), Token und dessen Teile, fremde Adressen
  assert.strictEqual(k.pushLogText('Fehler bei ' + GOOGLE + ' und ' + WINDOWS + '.', plan), 'Fehler bei (entfernt) und (entfernt).');
  assert.strictEqual(k.pushLogText('URL /fcm/send/erfunden0003:APA91bErfunden_Drei-0003 fehlt', plan), 'URL (entfernt) fehlt');
  assert.strictEqual(k.pushLogText('Gerät erfunden0003:APA91bErfunden_Drei-0003!', plan), 'Gerät (entfernt)!');
  assert.strictEqual(k.pushLogText('token ErfundenFuenf%2b0005%3d oder ErfundenFuenf+0005=', plan), 'token (entfernt) oder (entfernt)');
  assert.strictEqual(k.pushLogText('Authorization: vapid t=' + token + ', k=x', plan), 'Authorization: vapid t=(entfernt), k=x');
  assert.strictEqual(k.pushLogText('Signatur ' + token.split('.')[2] + ' ungültig', plan), 'Signatur (entfernt) ungültig');
  assert.strictEqual(k.pushLogText('DNS error: https://irgendwo.example/pfad?x=1 und http://alt.example', []), 'DNS error: (Adresse) und (Adresse)');
  assert.strictEqual(k.pushLogText('siehe "https://hilfe.example/a b"', undefined), 'siehe "(Adresse) b"');
  // kurze Teile (unter 12 Zeichen) bleiben, sonst ginge jeder Schrägstrich verloren
  assert.strictEqual(k.pushLogText('/fcm/send/ ist der Pfad, w ist kurz', plan), '/fcm/send/ ist der Pfad, w ist kurz');
});

test('Kennung, Name der Skripteigenschaft, Schlüsseltexte', () => {
  assert.strictEqual(k.pushKennung(APPLE, sha256Hex), kennung(APPLE));
  assert.match(k.pushKennung(APPLE, sha256Hex), /^[0-9a-f]{16}$/);
  assert.notStrictEqual(k.pushKennung(APPLE, sha256Hex), k.pushKennung(APPLE_2, sha256Hex));
  assert.strictEqual(k.pushEigenschaftName('Nina', '0123456789abcdef'), 'push:Nina:0123456789abcdef');
  assert.strictEqual(k.__k.PUSH_PRAEFIX, 'push:');
  for (const t of [P256DH, AUTH, 'a', 'A-_9', 'x'.repeat(200)]) assert.strictEqual(k.pushSchluesselTextGueltig(t), true, t.slice(0, 20));
  for (const t of ['', 'x'.repeat(201), 'AA==', 'a+b', 'a/b', 'a b', 'ä', null, undefined, 5, ['a'], {}]) assert.strictEqual(k.pushSchluesselTextGueltig(t), false, JSON.stringify(t));
});

test('pushSchluesselLesen, pushGeraeteLesen, pushStand: nur lesbare Einträge, sortiert, Geräte nur der eigenen Person', () => {
  const s = schluesselpaar();
  const privat = Buffer.from(s.privat).toString('base64url');
  const pub = s.oeffentlich.toString('base64url');
  const gut = { PUSH_VAPID_PRIVAT: privat, PUSH_VAPID_OEFFENTLICH: pub };
  const paar = k.pushSchluesselLesen(gut);
  assert.deepStrictEqual([roh(paar.privat), paar.oeffentlich], [s.privat, pub]);
  // fehlt etwas oder ist etwas unlesbar: nicht eingerichtet
  const schlecht = [{}, null, undefined, { PUSH_VAPID_PRIVAT: privat }, { PUSH_VAPID_OEFFENTLICH: pub },
    { PUSH_VAPID_PRIVAT: privat + 'AA', PUSH_VAPID_OEFFENTLICH: pub }, { PUSH_VAPID_PRIVAT: 'kein base64url!', PUSH_VAPID_OEFFENTLICH: pub },
    { PUSH_VAPID_PRIVAT: Buffer.alloc(32).toString('base64url'), PUSH_VAPID_OEFFENTLICH: pub },
    { PUSH_VAPID_PRIVAT: Buffer.alloc(32, 255).toString('base64url'), PUSH_VAPID_OEFFENTLICH: pub },
    { PUSH_VAPID_PRIVAT: privat, PUSH_VAPID_OEFFENTLICH: pub.slice(0, -4) }, { PUSH_VAPID_PRIVAT: privat, PUSH_VAPID_OEFFENTLICH: 'A' + pub.slice(1) },
    { PUSH_VAPID_PRIVAT: privat, PUSH_VAPID_OEFFENTLICH: '' }];
  for (const e of schlecht) {
    assert.strictEqual(k.pushSchluesselLesen(e), null, String(JSON.stringify(e)).slice(0, 60));
    assert.strictEqual(k.pushStand(e, 'Nina'), null);
  }
  const eintrag = (endpoint, seit) => JSON.stringify({ endpoint: endpoint, p256dh: P256DH, auth: AUTH, seit: seit });
  const eig = Object.assign({
    'CODE:Nina': JSON.stringify({ hash: 'h' }), CODE_SALZ: 'x',
    ['push:Nina:' + kennung(GOOGLE)]: eintrag(GOOGLE, '2026-11-03T10:00:00.000Z'),
    ['push:Nina:' + kennung(APPLE)]: eintrag(APPLE, '2026-11-01T10:00:00.000Z'),
    ['push:Jonas:' + kennung(MOZILLA)]: eintrag(MOZILLA, '2026-11-02T10:00:00.000Z'),
    // Name mit Doppelpunkt: die Kennung sind immer die letzten 16 Zeichen
    ['push:Team: Lager:' + kennung(WINDOWS)]: JSON.stringify({ endpoint: WINDOWS, seit: 5 }),
    // kaputt: kein JSON, fremde Adresse, ohne Adresse, Kennung zu kurz oder mit Großbuchstaben, ohne Namen
    'push:Nina:aaaaaaaaaaaaaaaa': '{', 'push:Nina:bbbbbbbbbbbbbbbb': eintrag('https://boese.example/x', '2026-11-01T10:00:00.000Z'),
    'push:Nina:cccccccccccccccc': '{}', 'push:Nina:dddddddddddddddd': 'null', 'push:Nina:abc': eintrag(APPLE_2, ''),
    'push:Nina:ABCDEF0123456789': eintrag(APPLE_2, ''), 'push::0123456789abcdef': eintrag(APPLE_2, ''), 'push:0123456789abcdef': eintrag(APPLE_2, ''),
  }, gut);
  const geraete = roh(k.pushGeraeteLesen(eig));
  assert.deepStrictEqual(geraete.map((g) => [g.name, g.kennung, g.endpoint, g.seit]), [
    ['Jonas', kennung(MOZILLA), MOZILLA, '2026-11-02T10:00:00.000Z'],
    ['Nina', kennung(APPLE), APPLE, '2026-11-01T10:00:00.000Z'],
    ['Nina', kennung(GOOGLE), GOOGLE, '2026-11-03T10:00:00.000Z'],
    ['Team: Lager', kennung(WINDOWS), WINDOWS, ''],
  ]);
  assert.deepStrictEqual(geraete[1], { name: 'Nina', kennung: kennung(APPLE), eigenschaft: 'push:Nina:' + kennung(APPLE), endpoint: APPLE, p256dh: P256DH, auth: AUTH,
    seit: '2026-11-01T10:00:00.000Z' });
  assert.deepStrictEqual([geraete[3].p256dh, geraete[3].auth], ['', '']);
  assert.strictEqual(k.pushKaputteEintraege(eig), 4);
  // gleiches „seit“: die Kennung entscheidet, damit die Reihenfolge feststeht
  const gleich = { 'push:Nina:ffffffffffffffff': eintrag(APPLE, '2026-11-01T10:00:00.000Z'), 'push:Nina:0000000000000000': eintrag(GOOGLE, '2026-11-01T10:00:00.000Z') };
  assert.deepStrictEqual(roh(k.pushGeraeteLesen(gleich)).map((g) => g.kennung), ['0000000000000000', 'ffffffffffffffff']);
  assert.deepStrictEqual(roh(k.pushGeraeteLesen({})), []);
  assert.deepStrictEqual(roh(k.pushGeraeteLesen(undefined)), []);
  // Stand für die App: öffentlicher Schlüssel und nur die eigenen Kennungen, ältestes Gerät zuerst
  assert.deepStrictEqual(roh(k.pushStand(eig, 'Nina')), { schluessel: pub, geraete: [kennung(APPLE), kennung(GOOGLE)] });
  assert.deepStrictEqual(roh(k.pushStand(eig, 'Jonas')), { schluessel: pub, geraete: [kennung(MOZILLA)] });
  assert.deepStrictEqual(roh(k.pushStand(eig, 'Olaf')), { schluessel: pub, geraete: [] });
  assert.ok(!JSON.stringify(k.pushStand(eig, 'Nina')).includes(privat));
  // Übersicht ergänzen: Feld push, keine Übersicht bleibt null
  const u = { eigenschaften: () => eig };
  assert.deepStrictEqual(roh(k.uebersichtMitPush({ stand: 'x' }, 'Jonas', u)), { stand: 'x', push: { schluessel: pub, geraete: [kennung(MOZILLA)] } });
  assert.deepStrictEqual(roh(k.uebersichtMitPush({ stand: 'x' }, 'Jonas', { eigenschaften: () => ({}) })), { stand: 'x', push: null });
  assert.strictEqual(k.uebersichtMitPush(null, 'Jonas', u), null);
});

test('pushBenachrichtigen: Zahl der Geräte, jeder Fehler zählt als 0', () => {
  assert.strictEqual(k.pushBenachrichtigen({ pushSenden: (n) => (n === 'Nina' ? 2 : 0) }, 'Nina'), 2);
  assert.strictEqual(k.pushBenachrichtigen({ pushSenden: () => { throw new Error('Netz weg'); } }, 'Nina'), 0);
  for (const w of [undefined, null, '2', NaN, -1, {}, true]) assert.strictEqual(k.pushBenachrichtigen({ pushSenden: () => w }, 'Nina'), 0, String(w));
  assert.strictEqual(k.pushBenachrichtigen({}, 'Nina'), 0, 'Umgebung ohne pushSenden');
  assert.strictEqual(k.pushAngenommen(201), true);
  assert.deepStrictEqual([199, 200, 204, 299, 300, 403, 404, 410, '201', null].map((s) => k.pushAngenommen(s)), [false, true, true, true, false, false, false, false, false, false]);
});

// Über doPost mit Google-Attrappen -------------------------------------------------------------------------------

const heuteText = () => D.berlin(new Date());
const tag = (n) => k.tagePlus(heuteText(), n);

function post(kk, body) {
  const aus = kk.doPost({ postData: { contents: JSON.stringify(body), type: 'text/plain' } });
  return JSON.parse(aus.text);
}

const codeAusLog = (w) => /: ([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})/.exec(w.logs[w.logs.length - 1])[1];

/**
 * Welt mit allen Tabs (erfundene Werte), dem Tab Aufgaben (A1 offen für Jonas, A2 erledigt für Nina) und drei
 * Zugangscodes: Jonas und Nina sind das Team, Olaf ist gesperrt. `p` schickt als Jonas, `pNina` als Nina. Die
 * Mitteilungen sind eingerichtet (pushEinrichten), außer mit `ohneSchluessel`.
 */
function welt(ohneSchluessel) {
  const { welt: w, globals } = neueWelt();
  const kk = ladeAlles(globals);
  const vz = (t, kanal, kunde, flaschen, re) => {
    const z = D.rechnungszeile(Number(t.slice(0, 4)), Number(t.slice(5, 7)), Number(t.slice(8, 10)), kanal, kunde, flaschen, flaschen);
    z[9] = re;
    return z;
  };
  w.tabs['Verkäufe'] = [D.verkaufKopf(), D.altzeile(2026, 8, 'Karlsruhe', 'Bar Eins', 300, 360), vz(tag(-5), 'Berlin', 'Späti Zwei', 24, 'R-100')];
  w.tabs['Lager-Log'] = [D.lagerKopf(),
    [D.zelle(2026, 10, 31), 'Lager Süd', 'Inventur', 2000, '', 'Jonas', '', '', 'i1', ''],
    [D.zelle(2026, 10, 31), 'Lager Nord', 'Inventur', 100, '', 'Nina', '', '', 'i2', '']];
  w.tabs['App-Einstellungen'] = D.einstellungen();
  w.tabs['Abfüllungen'] = [['Abfüllung', 'Monat', 'Flaschen', 'Quelle'], ['1. Abfüllung', D.serie(2026, 7, 1), 3000, 'Altliste']];
  w.tabs['Lager'] = [['Standort', 'Bestand (Flaschen)', 'Kisten', 'Letzte Inventur', 'Schwund', 'Stand'], ['Lager Süd'], ['Lager Nord'], ['Lager Ost'], ['Summe']];
  w.tabs['Aufgaben'] = [D.aufgabenKopf(),
    D.aufgabenZeile({ id: 'A1', erstellt: tag(-3), von: 'Nina', fuer: 'Jonas', titel: 'Leergut zurückbringen', faellig: tag(2) }),
    D.aufgabenZeile({ id: 'A2', erstellt: tag(-10), von: 'Jonas', fuer: 'Nina', titel: 'Plakate abholen', status: 'erledigt', erledigtAm: tag(-1), erledigtVon: 'Nina' })];
  kk.codeAnlegen('Olaf');
  const codeOlaf = codeAusLog(w);
  kk.codeSperren('Olaf');
  kk.codeAnlegen('Nina');
  const codeNina = codeAusLog(w);
  kk.codeAnlegen('Jonas');
  const code = codeAusLog(w);
  if (!ohneSchluessel) kk.pushEinrichten();
  leeren(w);
  const p = (aktion, daten) => post(kk, Object.assign({ code: code, aktion: aktion }, daten || {}));
  const pNina = (aktion, daten) => post(kk, Object.assign({ code: codeNina, aktion: aktion }, daten || {}));
  return { w, kk, globals, p, pNina, code, codeNina, codeOlaf, schluessel: w.props.PUSH_VAPID_OEFFENTLICH || null };
}

/** Alle Aufzeichnungen der Welt zurücksetzen (Skripteigenschaften und Tabs bleiben). */
function leeren(w) {
  for (const f of ['logs', 'fehlerLogs', 'sheetLesen', 'sheetSchreiben', 'sheetIds', 'sperren', 'ereignisse', 'propsSchreiben', 'pushAnfragen']) w[f].length = 0;
  w.freigaben = 0;
}

const geraet = (endpoint) => ({ endpoint: endpoint, p256dh: P256DH, auth: AUTH });
const eintrag = (w, name, endpoint) => JSON.parse(w.props['push:' + name + ':' + kennung(endpoint)] || 'null');
const pushNamen = (w) => Object.keys(w.props).filter((s) => /^push:/.test(s)).sort();
/** Gerät von Hand in die Skripteigenschaften legen (mit festem „seit“). */
function geraetSetzen(w, name, endpoint, seit) {
  w.props['push:' + name + ':' + kennung(endpoint)] = JSON.stringify({ endpoint: endpoint, p256dh: P256DH, auth: AUTH, seit: seit });
}
/** Nichts Geheimes in den Logs: kein privater Schlüssel, keine Adresse, kein Schlüsseltext eines Geräts, kein Text einer Aufgabe. */
function logsSauber(w, mehr) {
  const logs = w.logs.concat(w.fehlerLogs).join('\n');
  const verboten = [w.props.PUSH_VAPID_PRIVAT, P256DH, AUTH, 'push.apple.com', 'googleapis', 'mozilla.com', 'windows.com', 'https://', 'vapid t='].concat(mehr || []);
  for (const v of verboten.filter(Boolean)) assert.ok(!logs.includes(v), 'im Log steht: ' + String(v).slice(0, 20));
}

test('pushEinrichten: legt das Schlüsselpaar einmal an, überschreibt nie, loggt nur den öffentlichen Schlüssel', () => {
  const { w, kk } = welt(true);
  assert.deepStrictEqual(Object.keys(w.props).filter((s) => /PUSH/i.test(s)), []);
  kk.pushEinrichten();
  assert.deepStrictEqual(w.propsSchreiben, ['set PUSH_VAPID_PRIVAT', 'set PUSH_VAPID_OEFFENTLICH']);
  const privat = Buffer.from(w.props.PUSH_VAPID_PRIVAT, 'base64url');
  const pub = Buffer.from(w.props.PUSH_VAPID_OEFFENTLICH, 'base64url');
  assert.match(w.props.PUSH_VAPID_PRIVAT, /^[A-Za-z0-9_-]{43}$/);
  assert.match(w.props.PUSH_VAPID_OEFFENTLICH, /^B[A-Za-z0-9_-]{86}$/);
  assert.strictEqual(privat.length, 32);
  assert.strictEqual(k.pushPrivatGueltig(bytes(privat)), true);
  // derselbe Punkt wie bei Node
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privat);
  assert.strictEqual(pub.toString('hex'), ecdh.getPublicKey().toString('hex'));
  assert.deepStrictEqual(w.logs, ['Mitteilungen sind eingerichtet, alles bereit. Öffentlicher Schlüssel: ' + w.props.PUSH_VAPID_OEFFENTLICH]);
  assert.ok(!w.alleAusgaben().filter((t) => t !== w.props.PUSH_VAPID_PRIVAT).some((t) => t.includes(w.props.PUSH_VAPID_PRIVAT)), 'privater Schlüssel nur in seiner Eigenschaft');
  assert.deepStrictEqual(w.sperren, ['wait']);
  assert.strictEqual(w.freigaben, 1);
  assert.deepStrictEqual(w.sheetIds, [], 'das Sheet wird nicht geöffnet');
  // zweiter Lauf: nichts geändert
  const vorher = Object.assign({}, w.props);
  leeren(w);
  kk.pushEinrichten();
  assert.deepStrictEqual(w.propsSchreiben, []);
  assert.deepStrictEqual(w.props, vorher);
  assert.deepStrictEqual(w.logs, ['Mitteilungen sind schon eingerichtet, nichts geändert. Alles bereit. Öffentlicher Schlüssel: ' + vorher.PUSH_VAPID_OEFFENTLICH]);
  // der öffentliche fehlt: aus dem privaten neu berechnet, der private bleibt
  delete w.props.PUSH_VAPID_OEFFENTLICH;
  leeren(w);
  kk.pushEinrichten();
  assert.deepStrictEqual(w.propsSchreiben, ['set PUSH_VAPID_OEFFENTLICH']);
  assert.deepStrictEqual(w.props, vorher);
  assert.match(w.logs[0], /^Der öffentliche Schlüssel fehlte und ist aus dem privaten neu berechnet\. Alles bereit\./);
  // unvollständig oder passt nicht zusammen: Fehler, nichts geändert, Sperre wieder frei
  const fremd = schluesselpaar();
  const kaputt = [
    { PUSH_VAPID_OEFFENTLICH: vorher.PUSH_VAPID_OEFFENTLICH },
    { PUSH_VAPID_PRIVAT: vorher.PUSH_VAPID_PRIVAT, PUSH_VAPID_OEFFENTLICH: fremd.oeffentlich.toString('base64url') },
    { PUSH_VAPID_PRIVAT: 'kaputt', PUSH_VAPID_OEFFENTLICH: vorher.PUSH_VAPID_OEFFENTLICH },
    { PUSH_VAPID_PRIVAT: Buffer.alloc(32).toString('base64url') },
  ];
  for (const x of kaputt) {
    delete w.props.PUSH_VAPID_PRIVAT;
    delete w.props.PUSH_VAPID_OEFFENTLICH;
    Object.assign(w.props, x);
    const stand = Object.assign({}, w.props);
    leeren(w);
    assert.throws(() => kk.pushEinrichten(), /unvollständig oder passen nicht zusammen\. Nichts geändert\./, JSON.stringify(Object.keys(x)));
    assert.deepStrictEqual(w.propsSchreiben, []);
    assert.deepStrictEqual(w.props, stand);
    assert.strictEqual(w.freigaben, 1);
    logsSauber(w);
  }
});

test('pushEinrichten: ein ungültiger Zufallswert (0 oder ≥ n) wird verworfen und neu gezogen', () => {
  const { w, kk, globals } = welt(true);
  const echt = globals.Utilities.computeDigest;
  const schlecht = [new Array(32).fill(0), new Array(32).fill(-1)]; // d = 0 und d = 2^256 − 1 (größer als n)
  globals.Utilities.computeDigest = (alg, wert, charset) => (typeof wert === 'string' && schlecht.length ? schlecht.shift() : echt(alg, wert, charset));
  const uuids = w.uuids;
  kk.pushEinrichten();
  assert.strictEqual(schlecht.length, 0);
  assert.strictEqual(w.uuids - uuids, 6, 'dreimal gezogen, je zwei UUIDs');
  assert.strictEqual(k.pushPrivatGueltig(bytes(Buffer.from(w.props.PUSH_VAPID_PRIVAT, 'base64url'))), true);
  assert.notStrictEqual(k.pushSchluesselLesen(w.props), null);
});

test('nicht eingerichtet: push ist null, Anmelden meldet es verständlich, Aufgaben laufen wie vorher', () => {
  const { w, p } = welt(true);
  assert.strictEqual(p('uebersicht').push, null);
  assert.ok('push' in p('uebersicht'));
  leeren(w);
  assert.deepStrictEqual(p('pushAnmelden', geraet(APPLE)), { ok: false, fehler: 'Mitteilungen sind noch nicht eingerichtet, bitte Mark Bescheid geben' });
  assert.strictEqual(k.__k.FEHLER_PUSH_EINRICHTUNG, 'Mitteilungen sind noch nicht eingerichtet, bitte Mark Bescheid geben');
  assert.deepStrictEqual(w.propsSchreiben, []);
  assert.strictEqual(w.freigaben, w.sperren.length, 'Sperre wieder frei');
  // Abmelden geht trotzdem durch
  assert.deepStrictEqual(p('pushAbmelden', { endpoint: APPLE }), { ok: true, name: 'Jonas', push: null });
  // Aufgabe für jemand anderen: angelegt, niemand benachrichtigt, nichts gesendet
  const a = p('aufgabeAnlegen', { titel: 'Kühlschrank auffüllen', fuer: 'Nina' });
  assert.deepStrictEqual([a.ok, a.benachrichtigt], [true, 0]);
  assert.deepStrictEqual(w.pushAnfragen, []);
  assert.ok(!w.ereignisse.includes('push'));
  // auch mit einem Gerät in den Skripteigenschaften wird ohne Schlüssel nicht gesendet
  geraetSetzen(w, 'Nina', APPLE, '2026-11-01T10:00:00.000Z');
  assert.strictEqual(p('aufgabeAnlegen', { titel: 'Noch eine', fuer: 'Nina' }).benachrichtigt, 0);
  assert.deepStrictEqual(w.pushAnfragen, []);
  assert.strictEqual(p('buchen', { art: 'Bruch', standort: 'Lager Süd', flaschen: 1, datum: heuteText() }).uebersicht.push, null);
});

test('pushAnmelden: Eintrag in den Skripteigenschaften, Antwort mit Schlüssel und eigener Kennung, kein Sheet', () => {
  const { w, p, schluessel } = welt();
  const vorher = Date.now();
  const a = p('pushAnmelden', geraet(APPLE));
  assert.deepStrictEqual(a, { ok: true, name: 'Jonas', push: { schluessel: schluessel, geraete: [kennung(APPLE)] } });
  assert.deepStrictEqual(w.propsSchreiben, ['set push:Jonas:' + kennung(APPLE)]);
  const e = eintrag(w, 'Jonas', APPLE);
  assert.deepStrictEqual(Object.keys(e), ['endpoint', 'p256dh', 'auth', 'seit']);
  assert.deepStrictEqual([e.endpoint, e.p256dh, e.auth], [APPLE, P256DH, AUTH]);
  assert.ok(Date.parse(e.seit) >= vorher - 1000 && Date.parse(e.seit) <= Date.now() + 1000 && e.seit === new Date(e.seit).toISOString(), e.seit);
  // unter der Sperre, ohne das Sheet zu öffnen, nichts gesendet
  assert.deepStrictEqual(w.sperren, [10000]);
  assert.strictEqual(w.freigaben, 1);
  assert.deepStrictEqual(w.ereignisse, ['sperre', 'frei']);
  assert.deepStrictEqual(w.sheetIds, []);
  assert.deepStrictEqual(w.sheetLesen.concat(w.sheetSchreiben), []);
  assert.deepStrictEqual(w.pushAnfragen, []);
  assert.deepStrictEqual(p('uebersicht').push, a.push, 'derselbe Stand in der nächsten Übersicht');
  // zweites Gerät: beide Kennungen, ältestes zuerst
  geraetSetzen(w, 'Jonas', APPLE, '2026-11-01T10:00:00.000Z');
  const b = p('pushAnmelden', geraet(GOOGLE));
  assert.deepStrictEqual(b.push, { schluessel: schluessel, geraete: [kennung(APPLE), kennung(GOOGLE)] });
  logsSauber(w);
  assert.deepStrictEqual(w.logs.concat(w.fehlerLogs), [], 'nichts geloggt');
});

test('pushAnmelden doppelt: ein Eintrag, „seit“ bleibt, ohne Änderung wird nichts geschrieben', () => {
  const { w, p, schluessel } = welt();
  geraetSetzen(w, 'Jonas', APPLE, '2026-11-01T10:00:00.000Z');
  const stand = { schluessel: schluessel, geraete: [kennung(APPLE)] };
  const a = p('pushAnmelden', geraet(APPLE));
  assert.deepStrictEqual(a, { ok: true, name: 'Jonas', push: stand });
  assert.deepStrictEqual(w.propsSchreiben, [], 'alles ist schon so');
  assert.strictEqual(eintrag(w, 'Jonas', APPLE).seit, '2026-11-01T10:00:00.000Z');
  // neue Schlüsseltexte für dieselbe Adresse: überschrieben, „seit“ bleibt
  const neu = Buffer.concat([Buffer.from([4]), crypto.randomBytes(64)]).toString('base64url');
  assert.deepStrictEqual(p('pushAnmelden', { endpoint: APPLE, p256dh: neu, auth: AUTH }).push, stand);
  assert.deepStrictEqual(w.propsSchreiben, ['set push:Jonas:' + kennung(APPLE)]);
  assert.deepStrictEqual(eintrag(w, 'Jonas', APPLE), { endpoint: APPLE, p256dh: neu, auth: AUTH, seit: '2026-11-01T10:00:00.000Z' });
  assert.deepStrictEqual(pushNamen(w), ['push:Jonas:' + kennung(APPLE)]);
  // ein unlesbarer Eintrag unter demselben Namen wird ersetzt
  w.props['push:Jonas:' + kennung(GOOGLE)] = '{kaputt';
  assert.deepStrictEqual(p('pushAnmelden', geraet(GOOGLE)).push.geraete, [kennung(APPLE), kennung(GOOGLE)]);
  assert.strictEqual(eintrag(w, 'Jonas', GOOGLE).endpoint, GOOGLE);
});

test('pushAnmelden: höchstens fünf Geräte je Person, das sechste verdrängt das älteste', () => {
  const { w, p, pNina } = welt();
  assert.strictEqual(k.__k.MAX_PUSH_GERAETE, 5);
  const adressen = [1, 2, 3, 4, 5, 6, 7].map((i) => 'https://web.push.apple.com/QErfundenesGeraet-Nummer_' + i);
  // fünf Geräte, das dritte ist das älteste; Nina hat auch eines
  ['2026-11-05', '2026-11-04', '2026-11-01', '2026-11-03', '2026-11-02'].forEach((t, i) => geraetSetzen(w, 'Jonas', adressen[i], t + 'T10:00:00.000Z'));
  geraetSetzen(w, 'Nina', MOZILLA, '2026-10-01T10:00:00.000Z');
  const a = p('pushAnmelden', geraet(adressen[5]));
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.deepStrictEqual(w.propsSchreiben, ['set push:Jonas:' + kennung(adressen[5]), 'delete push:Jonas:' + kennung(adressen[2])], 'erst eintragen, dann aufräumen');
  assert.deepStrictEqual(a.push.geraete, [4, 3, 1, 0, 5].map((i) => kennung(adressen[i])), 'ältestes zuerst, das neue zuletzt');
  assert.strictEqual(pushNamen(w).filter((s) => /^push:Jonas:/.test(s)).length, 5);
  assert.ok(eintrag(w, 'Nina', MOZILLA), 'Geräte anderer zählen nicht mit und bleiben');
  // noch eines: jetzt fällt das vom 02.11. weg (das eben angemeldete bekommt ein festes „seit“, sonst könnten beide
  // in derselben Millisekunde liegen; dann entscheidet die Kennung)
  geraetSetzen(w, 'Jonas', adressen[5], '2026-11-06T10:00:00.000Z');
  const b = p('pushAnmelden', geraet(adressen[6]));
  assert.deepStrictEqual(b.push.geraete, [3, 1, 0, 5, 6].map((i) => kennung(adressen[i])));
  // ein schon angemeldetes Gerät noch einmal: nichts fällt weg
  leeren(w);
  assert.deepStrictEqual(p('pushAnmelden', geraet(adressen[0])).push.geraete, b.push.geraete);
  assert.deepStrictEqual(w.propsSchreiben, []);
  // von Hand stehen zu viele da (sieben): die nächste Anmeldung räumt auf fünf auf
  geraetSetzen(w, 'Nina', adressen[0], '2026-10-02T10:00:00.000Z');
  [1, 2, 3, 4, 5].forEach((i) => geraetSetzen(w, 'Nina', adressen[i], '2026-10-0' + (i + 2) + 'T10:00:00.000Z'));
  const c = pNina('pushAnmelden', geraet(GOOGLE));
  assert.deepStrictEqual(c.push.geraete, [2, 3, 4, 5].map((i) => kennung(adressen[i])).concat([kennung(GOOGLE)]));
  assert.ok(!eintrag(w, 'Nina', MOZILLA) && !eintrag(w, 'Nina', adressen[0]) && !eintrag(w, 'Nina', adressen[1]));
  // Jonas hatte adressen[0] und [1]: Die waren bei Nina von Hand eingetragen, seine Einträge sind unberührt
  assert.ok(eintrag(w, 'Jonas', adressen[0]) && eintrag(w, 'Jonas', adressen[1]));
});

test('pushAnmelden: das Gerät wechselt die Person (neuer Zugangscode auf dem Handy), der alte Eintrag fällt weg', () => {
  const { w, p, pNina, schluessel } = welt();
  assert.deepStrictEqual(p('pushAnmelden', geraet(APPLE)).push.geraete, [kennung(APPLE)]);
  assert.deepStrictEqual(p('pushAnmelden', geraet(GOOGLE)).push.geraete.length, 2);
  leeren(w);
  const a = pNina('pushAnmelden', geraet(APPLE));
  assert.deepStrictEqual(a, { ok: true, name: 'Nina', push: { schluessel: schluessel, geraete: [kennung(APPLE)] } });
  assert.deepStrictEqual(w.propsSchreiben, ['delete push:Jonas:' + kennung(APPLE), 'set push:Nina:' + kennung(APPLE)], 'erst weg bei Jonas, dann bei Nina');
  assert.deepStrictEqual(pushNamen(w), ['push:Jonas:' + kennung(GOOGLE), 'push:Nina:' + kennung(APPLE)].sort());
  // jede Person sieht nur die eigenen Kennungen
  assert.deepStrictEqual(p('uebersicht').push, { schluessel: schluessel, geraete: [kennung(GOOGLE)] });
  assert.deepStrictEqual(pNina('uebersicht').push, { schluessel: schluessel, geraete: [kennung(APPLE)] });
  // die Aufgabe für Jonas geht jetzt nur noch an sein anderes Gerät
  leeren(w);
  assert.strictEqual(pNina('aufgabeAnlegen', { titel: 'Pfand wegbringen', fuer: 'Jonas' }).benachrichtigt, 1);
  assert.deepStrictEqual(w.pushAnfragen.map((x) => x.url), [GOOGLE]);
});

test('pushAnmelden: scheitert das Löschen, hängt ein Gerät nie an zwei Personen; Aufräumen alter Geräte ist kein Fehler', () => {
  const { w, globals, p, pNina } = welt();
  p('pushAnmelden', geraet(APPLE));
  const echt = globals.PropertiesService.getScriptProperties;
  const kaputt = () => Object.assign(echt(), { deleteProperty: () => { throw new Error('Dienst gestört'); } });
  // Wechsel der Person: Der alte Eintrag lässt sich nicht löschen → Fehler, nichts geändert (weiter nur bei Jonas)
  globals.PropertiesService.getScriptProperties = kaputt;
  leeren(w);
  assert.deepStrictEqual(pNina('pushAnmelden', geraet(APPLE)), { ok: false, fehler: 'Serverfehler, bitte später nochmal versuchen' });
  assert.deepStrictEqual(pushNamen(w), ['push:Jonas:' + kennung(APPLE)]);
  assert.deepStrictEqual(w.propsSchreiben, []);
  assert.strictEqual(w.freigaben, w.sperren.length, 'Sperre wieder frei');
  // beim nächsten Versuch klappt es
  globals.PropertiesService.getScriptProperties = echt;
  assert.strictEqual(pNina('pushAnmelden', geraet(APPLE)).ok, true);
  assert.deepStrictEqual(pushNamen(w), ['push:Nina:' + kennung(APPLE)]);
  // sechstes Gerät, das älteste lässt sich nicht löschen: angemeldet ist es trotzdem, die nächste Anmeldung räumt auf
  const adressen = [1, 2, 3, 4, 5, 6].map((i) => 'https://web.push.apple.com/QErfundenesGeraet-Aufraeumen_' + i);
  adressen.slice(0, 5).forEach((a, i) => geraetSetzen(w, 'Jonas', a, '2026-11-0' + (i + 1) + 'T10:00:00.000Z'));
  globals.PropertiesService.getScriptProperties = kaputt;
  const a = p('pushAnmelden', geraet(adressen[5]));
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.strictEqual(a.push.geraete.length, 6);
  assert.ok(a.push.geraete.includes(kennung(adressen[5])));
  globals.PropertiesService.getScriptProperties = echt;
  geraetSetzen(w, 'Jonas', adressen[5], '2026-11-06T10:00:00.000Z'); // festes „seit“, sonst liegt es in derselben Millisekunde wie das nächste
  const b = p('pushAnmelden', geraet(GOOGLE));
  assert.deepStrictEqual(b.push.geraete, adressen.slice(2).map(kennung).concat([kennung(GOOGLE)]), 'die zwei ältesten sind weg');
});

test('pushAbmelden: löscht nur den eigenen Eintrag, ohne Eintrag kein Fehler', () => {
  const { w, p, pNina, schluessel } = welt();
  p('pushAnmelden', geraet(APPLE));
  p('pushAnmelden', geraet(GOOGLE));
  pNina('pushAnmelden', geraet(MOZILLA));
  leeren(w);
  // Nina kann das Gerät von Jonas nicht abmelden
  assert.deepStrictEqual(pNina('pushAbmelden', { endpoint: APPLE }), { ok: true, name: 'Nina', push: { schluessel: schluessel, geraete: [kennung(MOZILLA)] } });
  assert.deepStrictEqual(w.propsSchreiben, []);
  assert.ok(eintrag(w, 'Jonas', APPLE));
  // Jonas meldet es ab
  const a = p('pushAbmelden', { endpoint: APPLE });
  assert.deepStrictEqual(a, { ok: true, name: 'Jonas', push: { schluessel: schluessel, geraete: [kennung(GOOGLE)] } });
  assert.deepStrictEqual(w.propsSchreiben, ['delete push:Jonas:' + kennung(APPLE)]);
  assert.deepStrictEqual(pushNamen(w), ['push:Jonas:' + kennung(GOOGLE), 'push:Nina:' + kennung(MOZILLA)].sort());
  assert.deepStrictEqual(w.sheetIds, [], 'ohne das Sheet');
  assert.strictEqual(w.freigaben, w.sperren.length);
  // noch einmal, und eine Adresse, die es nie gab (auch bei einem fremden Dienst): ok, nichts geändert
  leeren(w);
  assert.deepStrictEqual(p('pushAbmelden', { endpoint: APPLE }), a);
  assert.deepStrictEqual(p('pushAbmelden', { endpoint: 'https://boese.example/nie-angemeldet' }), a);
  assert.deepStrictEqual(w.propsSchreiben, []);
  // p256dh und auth stören nicht, ein unlesbarer eigener Eintrag wird auch gelöscht
  w.props['push:Jonas:' + kennung(WINDOWS)] = '{kaputt';
  assert.deepStrictEqual(p('pushAbmelden', geraet(WINDOWS)), a);
  assert.deepStrictEqual(w.propsSchreiben, ['delete push:Jonas:' + kennung(WINDOWS)]);
  // nach dem Abmelden bekommt das Gerät nichts mehr
  leeren(w);
  assert.strictEqual(pNina('aufgabeAnlegen', { titel: 'Pfand wegbringen', fuer: 'Jonas' }).benachrichtigt, 1);
  assert.deepStrictEqual(w.pushAnfragen.map((x) => x.url), [GOOGLE]);
});

test('pushAnmelden und pushAbmelden: ungültige Daten → „Ungültige Anfrage“, nichts geschrieben, keine Sperre', () => {
  const { w, p } = welt();
  const falsch = { ok: false, fehler: 'Ungültige Anfrage' };
  for (const e of ['https://web.push.apple.com.boese.example/abc', 'http://web.push.apple.com/abc', 'https://web.push.apple.com:8443/abc',
    'https://nutzer:geheim@web.push.apple.com/abc', 'https://boese.example/abc', 'https://web.push.apple.com', '', null, undefined, 5, [APPLE], { a: 1 }]) {
    assert.deepStrictEqual(p('pushAnmelden', { endpoint: e, p256dh: P256DH, auth: AUTH }), falsch, JSON.stringify(e));
  }
  for (const t of ['', 'x'.repeat(201), 'AA==', 'a+b/c', 'mit leerzeichen', null, undefined, 5, ['a'], { a: 1 }]) {
    assert.deepStrictEqual(p('pushAnmelden', { endpoint: APPLE, p256dh: t, auth: AUTH }), falsch, 'p256dh ' + JSON.stringify(t));
    assert.deepStrictEqual(p('pushAnmelden', { endpoint: APPLE, p256dh: P256DH, auth: t }), falsch, 'auth ' + JSON.stringify(t));
  }
  for (const e of ['', null, undefined, 5, [APPLE], { a: 1 }, 'https://web.push.apple.com/' + 'a'.repeat(1000)]) {
    assert.deepStrictEqual(p('pushAbmelden', { endpoint: e }), falsch, String(JSON.stringify(e)).slice(0, 40));
  }
  assert.deepStrictEqual(w.propsSchreiben, []);
  assert.deepStrictEqual(w.sperren, []);
  assert.deepStrictEqual(pushNamen(w), []);
  // die Grenzen gehen durch
  assert.strictEqual(p('pushAnmelden', { endpoint: APPLE, p256dh: 'x'.repeat(200), auth: 'y' }).ok, true);
  // Sperre belegt: verständlicher Fehler, nichts geschrieben
  leeren(w);
  w.sperreBelegt = true;
  const belegt = { ok: false, fehler: 'Gerade trägt jemand anderes ein, bitte gleich nochmal versuchen' };
  assert.deepStrictEqual(p('pushAnmelden', geraet(GOOGLE)), belegt);
  assert.deepStrictEqual(p('pushAbmelden', { endpoint: APPLE }), belegt);
  assert.deepStrictEqual(w.propsSchreiben, []);
});

test('ungültiger Code: beide Aktionen lesen kein Sheet, sperren nichts, schreiben nichts, senden nichts', () => {
  const { w, kk, p, codeOlaf } = welt();
  p('pushAnmelden', geraet(APPLE));
  const vorher = Object.assign({}, w.props);
  leeren(w);
  for (const code of ['ABCD-EFGH-JKMN', codeOlaf, '']) {
    assert.deepStrictEqual(post(kk, Object.assign({ code: code, aktion: 'pushAnmelden' }, geraet(GOOGLE))), { ok: false, fehler: 'Code ungültig' });
    assert.deepStrictEqual(post(kk, { code: code, aktion: 'pushAbmelden', endpoint: APPLE }), { ok: false, fehler: 'Code ungültig' });
  }
  assert.deepStrictEqual(w.sheetIds, [], 'das Sheet wird gar nicht erst geöffnet');
  assert.deepStrictEqual(w.sheetLesen.concat(w.sheetSchreiben), []);
  assert.deepStrictEqual(w.sperren, []);
  assert.deepStrictEqual(w.propsSchreiben, []);
  assert.deepStrictEqual(w.pushAnfragen, []);
  assert.deepStrictEqual(w.props, vorher);
  // auch ohne Code kein Hinweis, ob Mitteilungen eingerichtet sind
  const ohne = welt(true);
  assert.deepStrictEqual(post(ohne.kk, Object.assign({ code: 'ABCD-EFGH-JKMN', aktion: 'pushAnmelden' }, geraet(GOOGLE))), { ok: false, fehler: 'Code ungültig' });
});

// Senden ---------------------------------------------------------------------------------------------------------

/** Welt, in der Nina zwei Geräte hat (Apple, Google) und Jonas eines (Mozilla). */
function weltMitGeraeten() {
  const x = welt();
  geraetSetzen(x.w, 'Nina', APPLE, '2026-11-01T10:00:00.000Z');
  geraetSetzen(x.w, 'Nina', GOOGLE, '2026-11-02T10:00:00.000Z');
  geraetSetzen(x.w, 'Jonas', MOZILLA, '2026-11-03T10:00:00.000Z');
  return x;
}

test('aufgabeAnlegen für jemand anderen: Mitteilung ohne Inhalt an alle Geräte der Person, nach der Sperre', () => {
  const { w, p, schluessel } = weltMitGeraeten();
  const vorher = Math.floor(Date.now() / 1000);
  const a = p('aufgabeAnlegen', { titel: 'Kühlschrank auffüllen', fuer: 'Nina', notiz: 'Geheime Notiz' });
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.strictEqual(a.benachrichtigt, 2);
  assert.deepStrictEqual(Object.keys(a), ['ok', 'name', 'id', 'aufgaben', 'benachrichtigt']);
  // erst schreiben, ins Sheet bringen, Sperre frei, dann senden (je Push-Dienst ein Abruf: hier Apple und Google)
  assert.deepStrictEqual(w.ereignisse, ['sperre', 'schreiben Aufgaben!A4:L4', 'flush', 'frei', 'push', 'push']);
  assert.strictEqual(w.pushAnfragen.length, 2);
  assert.deepStrictEqual(w.pushAnfragen.map((x) => x.url), [APPLE, GOOGLE], 'nur Ninas Geräte');
  const publicKey = schluesselObjekt(schluessel);
  for (const x of w.pushAnfragen) {
    assert.deepStrictEqual(Object.keys(x).sort(), ['followRedirects', 'headers', 'method', 'muteHttpExceptions', 'payload', 'url']);
    assert.deepStrictEqual([x.method, x.payload, x.muteHttpExceptions, x.followRedirects], ['post', '', true, false], 'POST mit leerem Body');
    assert.deepStrictEqual(Object.keys(x.headers), ['Authorization', 'TTL', 'Urgency']);
    assert.deepStrictEqual([x.headers.TTL, x.headers.Urgency], ['86400', 'normal']);
    const m = /^vapid t=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/.exec(x.headers.Authorization);
    assert.ok(m, x.headers.Authorization.slice(0, 20));
    assert.strictEqual(m[2], schluessel);
    const inhalt = tokenPruefen(m[1], publicKey);
    assert.deepStrictEqual(Object.keys(inhalt), ['aud', 'exp', 'sub']);
    assert.strictEqual(inhalt.aud, /^https:\/\/[^/]+/.exec(x.url)[0], 'aud = Ursprung der Adresse');
    assert.strictEqual(inhalt.sub, 'https://sate-ug.github.io/sate-app/');
    assert.ok(inhalt.exp >= vorher + 43200 && inhalt.exp <= Math.floor(Date.now() / 1000) + 43200, 'exp = jetzt + 12 Stunden');
    // nichts von der Aufgabe geht an den Push-Dienst
    const alles = JSON.stringify(x) + Buffer.from(m[1].split('.')[1], 'base64url').toString('utf8');
    for (const t of ['Kühlschrank', 'Geheime', 'Nina', 'Jonas', a.id]) assert.ok(!alles.includes(t), t);
    // dasselbe Token wie die reine Logik mit Node (prüft die Adapter für SHA-256 und HMAC, auch die Reihenfolge der Argumente)
    assert.strictEqual(m[1], k.vapidJwt(inhalt.aud, inhalt.exp, bytes(Buffer.from(w.props.PUSH_VAPID_PRIVAT, 'base64url')), sha256, hmacSha256));
  }
  assert.deepStrictEqual(w.propsSchreiben, [], 'Geräte bleiben');
  assert.deepStrictEqual(w.logs.concat(w.fehlerLogs), [], 'nichts geloggt');
  // die Aufgabe steht im Tab wie ohne Mitteilung
  assert.deepStrictEqual(w.tabs['Aufgaben'][3].slice(2, 5), ['Jonas', 'Nina', 'Kühlschrank auffüllen']);
  assert.strictEqual(w.freigaben, w.sperren.length);
});

test('aufgabeAnlegen: für sich selbst, bei einer Wiederholung, bei einem Fehler und ohne Geräte wird nichts gesendet', () => {
  const { w, p, pNina } = weltMitGeraeten();
  // für sich selbst
  const a = p('aufgabeAnlegen', { titel: 'Für mich', fuer: 'Jonas' });
  assert.deepStrictEqual([a.ok, a.benachrichtigt], [true, 0]);
  assert.deepStrictEqual(w.pushAnfragen, []);
  assert.ok(!w.ereignisse.includes('push'));
  // mit anfrageId: beim ersten Mal ja, bei der Wiederholung nein
  const daten = { titel: 'Pfandbons einlösen', fuer: 'Nina', anfrageId: 'aufgabe-0001' };
  const b = p('aufgabeAnlegen', daten);
  assert.deepStrictEqual([b.ok, b.benachrichtigt, b.wiederholt], [true, 2, undefined]);
  assert.strictEqual(w.pushAnfragen.length, 2);
  const c = p('aufgabeAnlegen', daten);
  assert.deepStrictEqual([c.ok, c.id, c.wiederholt, c.benachrichtigt], [true, b.id, true, 0]);
  assert.strictEqual(w.pushAnfragen.length, 2, 'keine zweite Mitteilung');
  assert.deepStrictEqual(Object.keys(c), ['ok', 'name', 'id', 'wiederholt', 'aufgaben', 'benachrichtigt']);
  // Fehler: nichts angelegt, nichts gesendet, Antwort wie bisher
  leeren(w);
  assert.deepStrictEqual(p('aufgabeAnlegen', { titel: '', fuer: 'Nina' }), { ok: false, fehler: 'Aufgabe: bitte einen Text mit 1 bis 140 Zeichen' });
  assert.deepStrictEqual(p('aufgabeAnlegen', { titel: 'An Olaf', fuer: 'Olaf' }), { ok: false, fehler: 'Für: bitte eine Person aus dem Team wählen' });
  w.sperreBelegt = true;
  assert.deepStrictEqual(p('aufgabeAnlegen', { titel: 'Belegt', fuer: 'Nina' }), { ok: false, fehler: 'Gerade trägt jemand anderes ein, bitte gleich nochmal versuchen' });
  w.sperreBelegt = false;
  w.schreibFehler = (tab) => tab === 'Aufgaben';
  assert.deepStrictEqual(p('aufgabeAnlegen', { titel: 'Schreibfehler', fuer: 'Nina' }), { ok: false, fehler: 'Serverfehler, bitte später nochmal versuchen' });
  w.schreibFehler = null;
  assert.deepStrictEqual(w.pushAnfragen, []);
  // Person ohne Geräte: kein Abruf
  delete w.props['push:Jonas:' + kennung(MOZILLA)];
  const d = pNina('aufgabeAnlegen', { titel: 'Kasse zählen', fuer: 'Jonas' });
  assert.deepStrictEqual([d.ok, d.benachrichtigt], [true, 0]);
  assert.deepStrictEqual(w.pushAnfragen, []);
  assert.ok(!w.ereignisse.includes('push'));
});

test('aufgabeAendern: Mitteilung nur, wenn „Für“ auf eine andere Person wechselt und die Aufgabe danach offen ist', () => {
  const { w, p, pNina } = weltMitGeraeten();
  // A1 ist offen und für Jonas. Anderes ändern: nichts
  for (const x of [{ titel: 'Leergut wegbringen' }, { notiz: 'Kasten im Flur' }, { faellig: tag(4), uhrzeit: '10:00' }, { fuer: 'Jonas' }, { fuer: ' Jonas ', titel: 'Leergut' }]) {
    const a = p('aufgabeAendern', Object.assign({ id: 'A1' }, x));
    assert.deepStrictEqual([a.ok, a.benachrichtigt], [true, 0], JSON.stringify(x));
  }
  assert.deepStrictEqual([p('aufgabeAendern', { id: 'A1', status: 'erledigt' }).benachrichtigt, p('aufgabeAendern', { id: 'A1', status: 'offen' }).benachrichtigt], [0, 0]);
  assert.deepStrictEqual(w.pushAnfragen, []);
  // Jonas gibt sie an Nina: Mitteilung an Ninas Geräte, nach der Sperre
  leeren(w);
  const a = p('aufgabeAendern', { id: 'A1', fuer: 'Nina' });
  assert.deepStrictEqual([a.ok, a.benachrichtigt], [true, 2]);
  assert.deepStrictEqual(Object.keys(a), ['ok', 'name', 'aufgaben', 'benachrichtigt']);
  assert.deepStrictEqual(w.pushAnfragen.map((x) => x.url), [APPLE, GOOGLE]);
  assert.deepStrictEqual(w.ereignisse, ['sperre', 'schreiben Aufgaben!L2', 'schreiben Aufgaben!D2', 'flush', 'frei', 'push', 'push']);
  // dieselbe Anfrage noch einmal: alles ist schon so, keine Mitteilung
  leeren(w);
  assert.strictEqual(p('aufgabeAendern', { id: 'A1', fuer: 'Nina' }).benachrichtigt, 0);
  assert.deepStrictEqual(w.pushAnfragen, []);
  // Nina nimmt sich eine Aufgabe selbst (A1 liegt bei ihr, also erst zurück an Jonas: das meldet es Jonas)
  assert.strictEqual(pNina('aufgabeAendern', { id: 'A1', fuer: 'Jonas', titel: 'Leergut zurück' }).benachrichtigt, 1);
  assert.deepStrictEqual(w.pushAnfragen.map((x) => x.url), [MOZILLA]);
  leeren(w);
  assert.strictEqual(p('aufgabeAendern', { id: 'A1', fuer: 'Nina' }).benachrichtigt, 2);
  leeren(w);
  assert.strictEqual(pNina('aufgabeAendern', { id: 'A1', fuer: 'Jonas' }).benachrichtigt, 1);
  leeren(w);
  assert.strictEqual(p('aufgabeAendern', { id: 'A1', fuer: 'Nina', status: 'erledigt' }).benachrichtigt, 0, 'danach nicht offen');
  assert.strictEqual(pNina('aufgabeAendern', { id: 'A1', fuer: 'Jonas' }).benachrichtigt, 0, 'erledigte Aufgabe');
  assert.strictEqual(p('aufgabeAendern', { id: 'A1', fuer: 'Nina', status: 'entfernt' }).benachrichtigt, 0, 'entfernt');
  assert.deepStrictEqual(w.pushAnfragen, []);
  // A2 ist erledigt und für Nina: Nina öffnet sie wieder und gibt sie Jonas → Mitteilung an Jonas
  const b = pNina('aufgabeAendern', { id: 'A2', fuer: 'Jonas', status: 'offen' });
  assert.deepStrictEqual([b.ok, b.benachrichtigt], [true, 1]);
  assert.deepStrictEqual(w.pushAnfragen.map((x) => x.url), [MOZILLA]);
  // wer sich selbst einträgt, bekommt keine Mitteilung
  leeren(w);
  assert.strictEqual(pNina('aufgabeAendern', { id: 'A2', fuer: 'Nina' }).benachrichtigt, 0);
  // Fehler: nichts gesendet
  assert.deepStrictEqual(p('aufgabeAendern', { id: 'A2', fuer: 'Olaf' }), { ok: false, fehler: 'Für: bitte eine Person aus dem Team wählen' });
  assert.deepStrictEqual(p('aufgabeAendern', { id: 'A99', fuer: 'Jonas' }), { ok: false, fehler: 'Diese Aufgabe gibt es nicht mehr.' });
  assert.deepStrictEqual(w.pushAnfragen, []);
});

test('Antwort des Push-Dienstes: 404 und 410 löschen das Gerät, benachrichtigt zählt nur angenommene, im Log nur Statuscodes', () => {
  const { w, p } = weltMitGeraeten();
  geraetSetzen(w, 'Nina', WINDOWS, '2026-11-04T10:00:00.000Z');
  geraetSetzen(w, 'Nina', APPLE_2, '2026-11-05T10:00:00.000Z');
  w.pushStatus = { [APPLE]: 410, [GOOGLE]: 201, [WINDOWS]: 404, [APPLE_2]: 403 };
  w.pushText = '{"reason":"BadJwtToken"}';
  const a = p('aufgabeAnlegen', { titel: 'Kühlschrank auffüllen', fuer: 'Nina' });
  assert.deepStrictEqual([a.ok, a.benachrichtigt], [true, 1]);
  assert.strictEqual(w.pushAnfragen.length, 4);
  assert.strictEqual(w.ereignisse.filter((x) => x === 'push').length, 3, 'drei Push-Dienste, drei Abrufe (beide Apple-Geräte zusammen)');
  assert.deepStrictEqual(w.propsSchreiben, ['delete push:Nina:' + kennung(APPLE), 'delete push:Nina:' + kennung(WINDOWS)]);
  assert.deepStrictEqual(pushNamen(w), ['push:Jonas:' + kennung(MOZILLA), 'push:Nina:' + kennung(GOOGLE), 'push:Nina:' + kennung(APPLE_2)].sort());
  assert.deepStrictEqual(w.fehlerLogs, ['pushSenden: Status 410, Status 404, Status 403']);
  assert.deepStrictEqual(w.logs, []);
  logsSauber(w, ['Kühlschrank', 'BadJwtToken', 'Nina', kennung(APPLE)]);
  // beim nächsten Mal nur noch die übrigen Geräte; 200 und 204 zählen auch als angenommen
  leeren(w);
  w.pushStatus = (url) => (url === GOOGLE ? 200 : 204);
  assert.strictEqual(p('aufgabeAnlegen', { titel: 'Banner aufhängen', fuer: 'Nina' }).benachrichtigt, 2);
  assert.deepStrictEqual(w.pushAnfragen.map((x) => x.url), [GOOGLE, APPLE_2]);
  assert.deepStrictEqual(w.logs.concat(w.fehlerLogs), []);
  // 5xx: nicht angenommen, Gerät bleibt
  leeren(w);
  w.pushStatus = () => 503;
  assert.strictEqual(p('aufgabeAnlegen', { titel: 'Kasse zählen', fuer: 'Nina' }).benachrichtigt, 0);
  assert.deepStrictEqual(w.propsSchreiben, []);
  assert.deepStrictEqual(w.fehlerLogs, ['pushSenden: Status 503, Status 503']);
});

test('Fehler beim Senden: Die Aufgabe geht trotzdem durch, benachrichtigt ist 0, im Log nur der Fehlertyp', () => {
  const { w, p, pNina } = weltMitGeraeten();
  w.pushKaputt = true;
  const a = p('aufgabeAnlegen', { titel: 'Kühlschrank auffüllen', fuer: 'Nina', anfrageId: 'aufgabe-0002' });
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.strictEqual(a.benachrichtigt, 0);
  assert.strictEqual(a.aufgaben.liste.filter((x) => x.id === a.id && x.fuer === 'Nina').length, 1, 'die Aufgabe steht in der Liste');
  assert.strictEqual(w.tabs['Aufgaben'][3][0], a.id);
  assert.deepStrictEqual(w.fehlerLogs, ['pushSenden: Error, Error'], 'je Gerät nur der Fehlertyp');
  logsSauber(w, ['Kühlschrank', 'DNS']);
  assert.strictEqual(w.freigaben, w.sperren.length);
  assert.deepStrictEqual(w.propsSchreiben, []);
  // Ändern ebenso
  leeren(w);
  const b = pNina('aufgabeAendern', { id: 'A2', fuer: 'Jonas', status: 'offen' });
  assert.deepStrictEqual([b.ok, b.benachrichtigt], [true, 0]);
  assert.deepStrictEqual([w.tabs['Aufgaben'][2][3], w.tabs['Aufgaben'][2][8]], ['Jonas', 'offen']);
  logsSauber(w);
  // Schlüssel in den Skripteigenschaften kaputt: gilt als nicht eingerichtet, nichts gesendet, kein Fehler
  leeren(w);
  w.pushKaputt = false;
  w.props.PUSH_VAPID_PRIVAT = 'kaputt';
  const c = p('aufgabeAnlegen', { titel: 'Banner aufhängen', fuer: 'Nina' });
  assert.deepStrictEqual([c.ok, c.benachrichtigt], [true, 0]);
  assert.deepStrictEqual(w.pushAnfragen, []);
  assert.strictEqual(p('uebersicht').push, null);
  // Nur ein Push-Dienst ist nicht erreichbar: Die Geräte bei den anderen bekommen die Mitteilung trotzdem
  const y = weltMitGeraeten();
  geraetSetzen(y.w, 'Nina', APPLE_2, '2026-11-05T10:00:00.000Z');
  y.w.pushKaputt = (url) => url === GOOGLE;
  const e = y.p('aufgabeAnlegen', { titel: 'Kasse zählen', fuer: 'Nina' });
  assert.deepStrictEqual([e.ok, e.benachrichtigt], [true, 2]);
  assert.deepStrictEqual(y.w.fehlerLogs, ['pushSenden: Error']);
  assert.deepStrictEqual(y.w.pushAnfragen.map((q) => q.url), [APPLE, APPLE_2, GOOGLE], 'Apple in einem Abruf, Google in einem eigenen');
  logsSauber(y.w, ['Kasse']);
  // Das Löschen eines abgelaufenen Geräts scheitert: trotzdem kein Fehler, die anderen zählen
  const x = weltMitGeraeten();
  x.w.pushStatus = { [APPLE]: 410 };
  x.globals.PropertiesService.getScriptProperties = ((echt) => () => Object.assign(echt(), { deleteProperty: () => { throw new Error('Dienst gestört'); } }))(
    x.globals.PropertiesService.getScriptProperties);
  const d = x.p('aufgabeAnlegen', { titel: 'Plakate kleben', fuer: 'Nina' });
  assert.deepStrictEqual([d.ok, d.benachrichtigt], [true, 1]);
  assert.ok(eintrag(x.w, 'Nina', APPLE), 'bleibt bis zum nächsten Senden');
});

test('Senden nimmt den Stand der Geräte direkt vor dem Senden, nicht den vom Beginn der Anfrage', () => {
  const { w, p } = weltMitGeraeten();
  // Während die Aufgabe geschrieben wird, meldet sich ein Gerät ab und ein neues an (hier über den Haken der Attrappe)
  w.schreibFehler = () => {
    delete w.props['push:Nina:' + kennung(APPLE)];
    geraetSetzen(w, 'Nina', APPLE_2, '2026-11-20T10:00:00.000Z');
    return false;
  };
  const a = p('aufgabeAnlegen', { titel: 'Kühlschrank auffüllen', fuer: 'Nina' });
  assert.deepStrictEqual([a.ok, a.benachrichtigt], [true, 2]);
  assert.deepStrictEqual(w.pushAnfragen.map((x) => x.url), [GOOGLE, APPLE_2], 'das abgemeldete Gerät bekommt nichts mehr');
});

// Übersicht ------------------------------------------------------------------------------------------------------

test('push steht in jeder Übersicht: Aktion uebersicht und die frische Übersicht nach buchen, stornieren, verkaufStandort', () => {
  const { w, p, pNina, schluessel } = weltMitGeraeten();
  const jonas = { schluessel: schluessel, geraete: [kennung(MOZILLA)] };
  const nina = { schluessel: schluessel, geraete: [kennung(APPLE), kennung(GOOGLE)] };
  const u = p('uebersicht');
  assert.strictEqual(u.ok, true, JSON.stringify(u));
  assert.deepStrictEqual(u.push, jonas);
  assert.deepStrictEqual(pNina('uebersicht').push, nina);
  // sonst bleibt die Übersicht, wie sie war
  for (const f of ['name', 'stand', 'heute', 'kennzahlen', 'bestellung', 'lager', 'verkaeufe', 'aufgaben', 'hinweise']) assert.ok(f in u, f);
  const a = p('buchen', { art: 'Bruch', standort: 'Lager Süd', flaschen: 1, datum: heuteText(), anfrageId: 'buchung-0001' });
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  assert.deepStrictEqual(a.uebersicht.push, jonas);
  assert.strictEqual(a.push, undefined, 'nur in der Übersicht, nicht daneben');
  assert.deepStrictEqual(p('buchen', { art: 'Bruch', standort: 'Lager Süd', flaschen: 1, datum: heuteText(), anfrageId: 'buchung-0001' }).uebersicht.push, jonas,
    'auch bei einer Wiederholung (die Antwort im Cache enthält es nicht)');
  assert.ok(!Object.values(w.cache).some((t) => t.includes(schluessel) || t.includes('push')));
  assert.deepStrictEqual(pNina('buchen', { art: 'Bruch', standort: 'Lager Nord', flaschen: 1, datum: heuteText() }).uebersicht.push, nina);
  assert.deepStrictEqual(p('stornieren', { id: a.id }).uebersicht.push, jonas);
  assert.deepStrictEqual(pNina('verkaufStandort', { rechnung: 'R-100', standort: 'Lager Ost' }).uebersicht.push, nina);
  // Rückfrage und Fehler haben keine Übersicht und bleiben, wie sie waren
  const r = p('buchen', { art: 'Bruch', standort: 'Lager Nord', flaschen: 5000, datum: heuteText() });
  assert.deepStrictEqual(Object.keys(r).sort(), ['brauchtBestaetigung', 'ok', 'warnung']);
  assert.deepStrictEqual(p('buchen', { art: 'Quatsch' }), { ok: false, fehler: 'Bitte eine gültige Art wählen' });
  // ping, verlauf und die Aufgaben-Antworten bleiben ohne push
  assert.ok(!('push' in p('ping')) && !('push' in p('verlauf')));
  assert.ok(!('push' in p('aufgabeAnlegen', { titel: 'Für mich', fuer: 'Jonas' })));
  // nichts davon hat gesendet oder Geräte geändert
  assert.deepStrictEqual(w.pushAnfragen, []);
  assert.deepStrictEqual(w.propsSchreiben, []);
  // ohne Schlüssel: null, in jeder Übersicht
  delete w.props.PUSH_VAPID_OEFFENTLICH;
  assert.strictEqual(p('uebersicht').push, null);
  const b = p('buchen', { art: 'Bruch', standort: 'Lager Süd', flaschen: 1, datum: heuteText() });
  assert.ok('push' in b.uebersicht);
  assert.strictEqual(b.uebersicht.push, null);
});

// Editor ---------------------------------------------------------------------------------------------------------

test('pushTesten: je Gerät Kennung, Status und Antwort im Log, keine Adressen und Schlüssel', () => {
  const { w, kk } = weltMitGeraeten();
  w.pushStatus = { [APPLE]: 403, [GOOGLE]: 201 };
  w.pushText = '{"reason":"BadJwtToken"}' + 'x'.repeat(300);
  kk.pushTesten(' Nina ');
  assert.deepStrictEqual(w.pushAnfragen.map((x) => [x.url, x.method, x.payload]), [[APPLE, 'post', ''], [GOOGLE, 'post', '']]);
  assert.strictEqual(w.logs.length, 1);
  const zeilen = w.logs[0].split('\n');
  assert.strictEqual(zeilen[0], 'Mitteilung an 2 Geräte von Nina geschickt, üblich ist HTTP 201:');
  assert.strictEqual(zeilen[1], 'Gerät ' + kennung(APPLE) + ': HTTP 403 ' + w.pushText.slice(0, 200));
  assert.strictEqual(zeilen[2], 'Gerät ' + kennung(GOOGLE) + ': HTTP 201 ' + w.pushText.slice(0, 200));
  logsSauber(w);
  assert.deepStrictEqual(w.sheetIds, [], 'ohne das Sheet');
  // abgelaufenes Gerät: Eintrag gelöscht, steht im Log
  leeren(w);
  w.pushStatus = { [APPLE]: 410 };
  w.pushText = '';
  kk.pushTesten('Nina');
  assert.deepStrictEqual(w.logs[0].split('\n').slice(1), ['Gerät ' + kennung(APPLE) + ': HTTP 410 (Gerät gibt es nicht mehr, Eintrag gelöscht)', 'Gerät ' + kennung(GOOGLE) + ': HTTP 201']);
  assert.deepStrictEqual(w.propsSchreiben, ['delete push:Nina:' + kennung(APPLE)]);
  // der Knopf: Mark hat hier kein Gerät
  leeren(w);
  kk.pushTestenMark();
  assert.deepStrictEqual(w.logs, ['Für Mark ist kein Gerät angemeldet. In der App bei den Aufgaben die Mitteilungen einschalten.']);
  assert.deepStrictEqual(w.pushAnfragen, []);
  // ein Gerät: Einzahl
  leeren(w);
  kk.pushTesten('Jonas');
  assert.strictEqual(w.logs[0], 'Mitteilung an 1 Gerät von Jonas geschickt, üblich ist HTTP 201:\nGerät ' + kennung(MOZILLA) + ': HTTP 201');
  // ein Push-Dienst ist nicht erreichbar: Fehlertyp und Meldung ohne Adresse, die Geräte bei den anderen Diensten bekommen sie
  leeren(w);
  geraetSetzen(w, 'Jonas', APPLE_2, '2026-11-04T10:00:00.000Z');
  w.pushKaputt = (url) => url === MOZILLA;
  kk.pushTesten('Jonas');
  assert.deepStrictEqual(w.logs, ['Mitteilung an 2 Geräte von Jonas geschickt, üblich ist HTTP 201:\nGerät ' + kennung(MOZILLA) +
    ': Senden gescheitert (Error) DNS error: (entfernt)\nGerät ' + kennung(APPLE_2) + ': HTTP 201']);
  logsSauber(w);
  // der Push-Dienst wiederholt in seiner Antwort die Adresse, ihren Pfad oder das Token: nichts davon steht im Log
  leeren(w);
  w.pushKaputt = false;
  const pfad = (url) => url.slice(/^https:\/\/[^/]+/.exec(url)[0].length);
  w.pushText = (url) => '<html>\n  <p>The requested URL <code>' + pfad(url) + '</code> was not found.</p>\n ' + url + ' Geraet ' + pfad(url).split('/').pop() +
    ' Token ' + /t=([^,]+),/.exec(w.pushAnfragen.find((x) => x.url === url).headers.Authorization)[1] + ' https://anders.example/x?y=1 Ende';
  w.pushStatus = () => 400;
  kk.pushTesten('Jonas');
  assert.strictEqual(w.logs[0].split('\n')[1], 'Gerät ' + kennung(MOZILLA) +
    ': HTTP 400 <html> <p>The requested URL <code>(entfernt)</code> was not found.</p> (entfernt) Geraet (entfernt) Token (entfernt) (Adresse) Ende');
  logsSauber(w, [pfad(MOZILLA), pfad(APPLE_2), 'gAAAAErfundenVier0004', 'QErfundenesGeraet', 'eyJ']);
  w.pushText = '';
  w.pushStatus = null;
  delete w.props['push:Jonas:' + kennung(APPLE_2)];
  // ohne Namen, ohne Schlüssel
  assert.throws(() => kk.pushTesten(), /pushTesten\('Jonas'\)/);
  assert.throws(() => kk.pushTesten('  '), /Name fehlt/);
  const ohne = welt(true);
  ohne.kk.pushTesten('Nina');
  assert.deepStrictEqual(ohne.w.logs, ['Mitteilungen sind noch nicht eingerichtet: zuerst pushEinrichten() ausführen.']);
});

test('pushAnzeigen: je Person die Zahl der Geräte, keine Adressen und Schlüssel', () => {
  const { w, kk } = weltMitGeraeten();
  kk.pushAnzeigen();
  assert.deepStrictEqual(w.logs, ['Mitteilungen sind eingerichtet.\nJonas: 1 Gerät\nNina: 2 Geräte']);
  logsSauber(w, [kennung(APPLE), w.props.PUSH_VAPID_OEFFENTLICH]);
  w.props['push:Nina:aaaaaaaaaaaaaaaa'] = '{kaputt';
  leeren(w);
  kk.pushAnzeigen();
  assert.deepStrictEqual(w.logs, ['Mitteilungen sind eingerichtet.\nJonas: 1 Gerät\nNina: 2 Geräte\nUnlesbare Einträge (an sie wird nicht gesendet): 1']);
  const ohne = welt(true);
  ohne.kk.pushAnzeigen();
  assert.deepStrictEqual(ohne.w.logs, ['Mitteilungen sind noch nicht eingerichtet: pushEinrichten() ausführen.\nNoch kein Gerät angemeldet.']);
  assert.deepStrictEqual(w.propsSchreiben.concat(ohne.w.propsSchreiben), []);
});

test('Adapter: Geräte-Einträge schreiben und löschen geht nur für push:<Name>:<Kennung>', () => {
  const { w, kk } = welt();
  const u = kk.umgebung_();
  for (const s of ['CODE:Jonas', 'CODE_SALZ', 'PUSH_VAPID_PRIVAT', 'PUSH_VAPID_OEFFENTLICH', 'push:Jonas', 'push:Jonas:abc', 'push::0123456789abcdef', 'x', '', null, undefined]) {
    assert.throws(() => u.pushSchreiben(s, '{}'), /Kein Geräte-Eintrag/, String(s));
    assert.throws(() => u.pushLoeschen(s), /Kein Geräte-Eintrag/, String(s));
  }
  assert.deepStrictEqual(w.propsSchreiben, []);
  u.pushSchreiben('push:Jonas:0123456789abcdef', '{"a":1}');
  assert.strictEqual(w.props['push:Jonas:0123456789abcdef'], '{"a":1}');
  // nach dem Schreiben liest die Umgebung neu
  assert.strictEqual(u.eigenschaften()['push:Jonas:0123456789abcdef'], '{"a":1}');
  u.pushLoeschen('push:Jonas:0123456789abcdef');
  assert.ok(!('push:Jonas:0123456789abcdef' in u.eigenschaften()));
  assert.deepStrictEqual(w.propsSchreiben, ['set push:Jonas:0123456789abcdef', 'delete push:Jonas:0123456789abcdef']);
});

// Repo -----------------------------------------------------------------------------------------------------------

test('PushLogik.js ist reine Logik, keine Trennpunkte in Texten für Menschen, Scope für externe Dienste im Manifest', () => {
  const src = path.join(__dirname, '..', 'api', 'src');
  const lies = (d) => fs.readFileSync(path.join(src, d), 'utf8');
  const logik = lies('PushLogik.js');
  assert.doesNotMatch(logik, /\b(Utilities|PropertiesService|UrlFetchApp|LockService|CacheService|SpreadsheetApp|Logger|console)\b/);
  const konfig = lies('Konfig.js');
  const api = lies('Api.js');
  const neu = konfig.slice(konfig.indexOf('// Mitteilungen aufs Handy')) + logik + api.slice(api.indexOf('// Mitteilungen aufs Handy'), api.indexOf('// Adapter'));
  assert.ok(neu.length > 20000);
  assert.doesNotMatch(neu, /[\u00b7\u2022]/);
  // kein Schlüssel und keine Mail-Adresse im Code
  assert.doesNotMatch(konfig + logik + api, /mailto:|[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[a-z]{2,}/);
  const manifest = JSON.parse(lies('appsscript.json'));
  assert.deepStrictEqual(manifest.oauthScopes, ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/script.scriptapp',
    'https://www.googleapis.com/auth/script.external_request']);
  // gesendet wird nur an einer Stelle, mit fetchAll und ohne Weiterleitungen
  assert.strictEqual(api.split('UrlFetchApp.').length - 1, 1);
  assert.match(api, /UrlFetchApp\.fetchAll\(gruppe\.map\(\(p\) => \(\{\s*url: p\.url, method: 'post', headers: p\.kopfzeilen, payload: '', muteHttpExceptions: true, followRedirects: false,\s*\}\)\)\)/);
});
