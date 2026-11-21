/**
 * Mitteilungen aufs Handy (Web Push) ohne Google-Dienste (unter Node testbar, siehe test/push.test.js): base64url,
 * Rechnen auf der Kurve P-256, ECDSA-Signatur (ES256) für das VAPID-Token (RFC 8292), Endpunkte prüfen, Geräte in den
 * Skripteigenschaften verwalten, Aktionen `pushAnmelden` und `pushAbmelden`. Apps Script hat ES256 nicht eingebaut,
 * deshalb hier mit BigInt (V8-Laufzeit). SHA-256 und HMAC-SHA256 kommen als Funktionen herein (Adapter in Api.js):
 *   sha256(bytes) → Bytes, hmacSha256(schluesselBytes, datenBytes) → Bytes; Bytes sind Listen aus Zahlen 0–255.
 * Gesendet wird ohne Inhalt (leerer Body): Deshalb braucht es nur das Token, keine Verschlüsselung.
 */

// Bytes und Text -------------------------------------------------------------------------------------------

/** Die 64 Zeichen von base64url (RFC 4648 Abschnitt 5). */
const BASE64URL_ZEICHEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Bytes (auch vorzeichenbehaftet wie in Apps Script) → base64url ohne Füllzeichen. */
function base64urlAusBytes(bytes) {
  let aus = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const rest = bytes.length - i;
    const n = ((bytes[i] & 0xff) << 16) | ((rest > 1 ? bytes[i + 1] & 0xff : 0) << 8) | (rest > 2 ? bytes[i + 2] & 0xff : 0);
    aus += BASE64URL_ZEICHEN[(n >> 18) & 63] + BASE64URL_ZEICHEN[(n >> 12) & 63] +
      (rest > 1 ? BASE64URL_ZEICHEN[(n >> 6) & 63] : '') + (rest > 2 ? BASE64URL_ZEICHEN[n & 63] : '');
  }
  return aus;
}

/**
 * base64url ohne Füllzeichen → Bytes (0–255). Kein Text, fremde Zeichen (auch `=`, `+`, `/`), unmögliche Länge oder
 * übrige Bits ungleich null → null.
 */
function bytesAusBase64url(text) {
  if (typeof text !== 'string' || text.length % 4 === 1) return null;
  const aus = [];
  let puffer = 0;
  let bits = 0;
  for (let i = 0; i < text.length; i++) {
    const w = BASE64URL_ZEICHEN.indexOf(text[i]);
    if (w < 0) return null;
    puffer = (puffer << 6) | w;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      aus.push((puffer >> bits) & 0xff);
      puffer &= (1 << bits) - 1;
    }
  }
  return puffer === 0 ? aus : null;
}

/** Text → Bytes in UTF-8 (einzelne halbe Ersatzzeichen werden wie üblich zu U+FFFD). */
function utf8Bytes(text) {
  const aus = [];
  for (const zeichen of String(text)) {
    let c = zeichen.codePointAt(0);
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) aus.push(c);
    else if (c < 0x800) aus.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) aus.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else aus.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return aus;
}

/** Bytes (höchstwertiges zuerst, auch vorzeichenbehaftet) → nicht negative ganze Zahl (BigInt). Leer → 0. */
function zahlAusBytes(bytes) {
  return bytes.length ? BigInt('0x' + hexAusBytes(bytes)) : BigInt(0);
}

/** Nicht negative ganze Zahl (BigInt) → genau `laenge` Bytes (höchstwertiges zuerst). Passt sie nicht hinein: Fehler. */
function bytesAusZahl(zahl, laenge) {
  const hex = zahl.toString(16);
  if (zahl < BI0 || hex.length > 2 * laenge) throw new Error('Zahl passt nicht in ' + laenge + ' Bytes');
  const voll = hex.padStart(2 * laenge, '0');
  const aus = [];
  for (let i = 0; i < voll.length; i += 2) aus.push(parseInt(voll.slice(i, i + 2), 16));
  return aus;
}

// Kurve P-256 ----------------------------------------------------------------------------------------------

/**
 * Kleine ganze Zahlen als BigInt. Bewusst über BigInt(…) statt mit der Schreibweise `1n`: So hängt nichts davon ab,
 * ob jeder Schritt bis zum Apps-Script-Editor diese Schreibweise kennt.
 */
const BI0 = BigInt(0);
const BI1 = BigInt(1);
const BI2 = BigInt(2);
const BI3 = BigInt(3);
const BI4 = BigInt(4);
const BI8 = BigInt(8);

/**
 * P-256 (secp256r1, FIPS 186-4 D.1.2.3): y² = x³ − 3x + b über dem Körper mit `P256_P` Elementen. `P256_N` ist die
 * Zahl der Punkte (Ordnung des Basispunkts), `P256_GX`/`P256_GY` der Basispunkt G.
 */
const P256_P = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
const P256_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const P256_B = BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b');
const P256_GX = BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296');
const P256_GY = BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5');
/** Länge einer Koordinate, eines privaten Schlüssels und von r bzw. s in Bytes. */
const P256_BYTES = 32;

/** Rest von `a` geteilt durch `m`, immer von 0 bis m − 1 (auch für negative a). */
function modulo(a, m) {
  const r = a % m;
  return r < BI0 ? r + m : r;
}

/** Kehrwert von `a` modulo `m` (erweiterter euklidischer Algorithmus). Gibt es keinen (a ≡ 0): Fehler. */
function modKehrwert(a, m) {
  let r0 = modulo(a, m);
  let r1 = m;
  let s0 = BI1;
  let s1 = BI0;
  while (r1 !== BI0) {
    const q = r0 / r1;
    const r2 = r0 - q * r1;
    const s2 = s0 - q * s1;
    r0 = r1;
    r1 = r2;
    s0 = s1;
    s1 = s2;
  }
  if (r0 !== BI1) throw new Error('Kein Kehrwert');
  return modulo(s0, m);
}

/** Rest modulo P256_P. */
const modP_ = (a) => modulo(a, P256_P);

/**
 * Intern rechnet die Kurve mit Jacobi-Koordinaten [X, Y, Z] (der Punkt ist x = X/Z², y = Y/Z³): So braucht eine ganze
 * Skalarmultiplikation nur einen Kehrwert am Ende statt einen je Schritt. Z = 0 ist der unendlich ferne Punkt.
 */
const P256_UNENDLICH_ = [BI1, BI1, BI0];

/** Punkt { x, y } (oder null = unendlich fern) → Jacobi-Koordinaten. */
function punktJacobi_(p) {
  return p ? [p.x, p.y, BI1] : P256_UNENDLICH_;
}

/** Jacobi-Koordinaten → Punkt { x, y } mit Koordinaten von 0 bis P256_P − 1, unendlich fern → null. */
function punktAusJacobi_(j) {
  if (j[2] === BI0) return null;
  const z = modKehrwert(j[2], P256_P);
  const zz = modP_(z * z);
  return { x: modP_(j[0] * zz), y: modP_(j[1] * zz * z) };
}

/** Verdopplung in Jacobi-Koordinaten (Formeln für a = −3). */
function jacobiDoppelt_(j) {
  const X = j[0];
  const Y = j[1];
  const Z = j[2];
  if (Z === BI0 || Y === BI0) return P256_UNENDLICH_;
  const delta = modP_(Z * Z);
  const gamma = modP_(Y * Y);
  const beta = modP_(X * gamma);
  const alpha = modP_(BI3 * (X - delta) * (X + delta));
  const X3 = modP_(alpha * alpha - BI8 * beta);
  const Z3 = modP_((Y + Z) * (Y + Z) - gamma - delta);
  const Y3 = modP_(alpha * (BI4 * beta - X3) - BI8 * gamma * gamma);
  return [X3, Y3, Z3];
}

/** Addition in Jacobi-Koordinaten, auch für gleiche Punkte (dann Verdopplung) und P + (−P) (unendlich fern). */
function jacobiPlus_(a, b) {
  if (a[2] === BI0) return b;
  if (b[2] === BI0) return a;
  const z1z1 = modP_(a[2] * a[2]);
  const z2z2 = modP_(b[2] * b[2]);
  const u1 = modP_(a[0] * z2z2);
  const u2 = modP_(b[0] * z1z1);
  const s1 = modP_(a[1] * b[2] * z2z2);
  const s2 = modP_(b[1] * a[2] * z1z1);
  const h = modP_(u2 - u1);
  const r = modP_(s2 - s1);
  if (h === BI0) return r === BI0 ? jacobiDoppelt_(a) : P256_UNENDLICH_;
  const hh = modP_(h * h);
  const hhh = modP_(h * hh);
  const v = modP_(u1 * hh);
  const X3 = modP_(r * r - hhh - BI2 * v);
  const Y3 = modP_(r * (v - X3) - s1 * hhh);
  const Z3 = modP_(a[2] * b[2] * h);
  return [X3, Y3, Z3];
}

/** Basispunkt G als { x, y }. */
function p256Basispunkt() {
  return { x: P256_GX, y: P256_GY };
}

/** Liegt { x, y } auf der Kurve (Koordinaten von 0 bis P256_P − 1 und y² = x³ − 3x + b)? null (unendlich fern) → false. */
function punktAufKurve(p) {
  if (!p || typeof p.x !== 'bigint' || typeof p.y !== 'bigint') return false;
  if (p.x < BI0 || p.x >= P256_P || p.y < BI0 || p.y >= P256_P) return false;
  return modP_(p.y * p.y - (p.x * p.x * p.x - BI3 * p.x + P256_B)) === BI0;
}

/** Punkt-Addition: zwei Punkte { x, y } (null = unendlich fern) → ihre Summe als { x, y } oder null. */
function punktAddieren(p, q) {
  return punktAusJacobi_(jacobiPlus_(punktJacobi_(p), punktJacobi_(q)));
}

/** Punkt-Verdopplung: { x, y } (null = unendlich fern) → 2 × P als { x, y } oder null. */
function punktVerdoppeln(p) {
  return punktAusJacobi_(jacobiDoppelt_(punktJacobi_(p)));
}

/**
 * Skalarmultiplikation k × P (verdoppeln und addieren, höchstwertiges Bit zuerst): `k` nicht negative ganze Zahl
 * (BigInt), `p` Punkt { x, y } oder null. Rückgabe { x, y } oder null (unendlich fern, z. B. für k = 0 oder k = P256_N).
 */
function punktMal(k, p) {
  if (typeof k !== 'bigint' || k < BI0) throw new Error('Skalar ungültig');
  const basis = punktJacobi_(p);
  const bits = k.toString(2);
  let erg = P256_UNENDLICH_;
  for (let i = 0; i < bits.length; i++) {
    erg = jacobiDoppelt_(erg);
    if (bits[i] === '1') erg = jacobiPlus_(erg, basis);
  }
  return punktAusJacobi_(erg);
}

// Schlüssel und Signatur -----------------------------------------------------------------------------------

/** Privater Schlüssel: genau 32 Bytes und als Zahl d mit 1 ≤ d < P256_N. */
function pushPrivatGueltig(bytes) {
  if (!bytes || bytes.length !== P256_BYTES) return false;
  const d = zahlAusBytes(bytes);
  return d >= BI1 && d < P256_N;
}

/** Öffentlicher Schlüssel zum privaten: der Punkt d × G unkomprimiert als 65 Bytes (0x04, X, Y). Ungültiger Schlüssel: Fehler. */
function pushOeffentlicherSchluessel(privatBytes) {
  if (!pushPrivatGueltig(privatBytes)) throw new Error('Privater Schlüssel ungültig');
  const q = punktMal(zahlAusBytes(privatBytes), p256Basispunkt());
  return [4].concat(bytesAusZahl(q.x, P256_BYTES), bytesAusZahl(q.y, P256_BYTES));
}

/** Ergebnis einer Hash-Funktion als Liste aus Zahlen 0–255 (Apps Script liefert Bytes mit Vorzeichen). */
const bytesOhneVorzeichen_ = (bytes) => Array.from(bytes, (b) => b & 0xff);

/**
 * ECDSA-Signatur auf P-256 mit SHA-256 (ES256) über `datenBytes`, mit dem privaten Schlüssel `privatBytes` (32 Bytes).
 * Die Zufallszahl k wird nach RFC 6979 aus Schlüssel und Nachricht abgeleitet (HMAC-SHA256): Dieselbe Eingabe ergibt
 * dieselbe Signatur, es braucht keine Zufallsquelle. Rückgabe: r und s roh hintereinander, 64 Bytes (so will es ein
 * JWT; s kann in der oberen Hälfte liegen).
 */
function ecdsaSignieren(datenBytes, privatBytes, sha256, hmacSha256) {
  if (!pushPrivatGueltig(privatBytes)) throw new Error('Privater Schlüssel ungültig');
  const hmac = (schluessel, daten) => bytesOhneVorzeichen_(hmacSha256(schluessel, daten));
  const d = zahlAusBytes(privatBytes);
  const hash = bytesOhneVorzeichen_(sha256(datenBytes));
  if (hash.length !== P256_BYTES) throw new Error('SHA-256 liefert keine 32 Bytes');
  // Hash und Ordnung sind gleich lang (256 Bit): Der Hash als Zahl modulo n ist die Zahl, die signiert wird
  const z = modulo(zahlAusBytes(hash), P256_N);
  const x = bytesAusZahl(d, P256_BYTES);
  const h = bytesAusZahl(z, P256_BYTES);
  // RFC 6979 Abschnitt 3.2, Schritte b bis g
  let v = new Array(P256_BYTES).fill(1);
  let k = new Array(P256_BYTES).fill(0);
  k = hmac(k, v.concat([0], x, h));
  v = hmac(k, v);
  k = hmac(k, v.concat([1], x, h));
  v = hmac(k, v);
  // Schritt h: Kandidaten ziehen, bis einer passt (praktisch immer der erste)
  for (let runde = 0; runde < 100; runde++) {
    v = hmac(k, v);
    const kandidat = zahlAusBytes(v);
    if (kandidat >= BI1 && kandidat < P256_N) {
      const r = modulo(punktMal(kandidat, p256Basispunkt()).x, P256_N);
      const s = r === BI0 ? BI0 : modulo(modKehrwert(kandidat, P256_N) * (z + r * d), P256_N);
      if (r !== BI0 && s !== BI0) return bytesAusZahl(r, P256_BYTES).concat(bytesAusZahl(s, P256_BYTES));
    }
    k = hmac(k, v.concat([0]));
    v = hmac(k, v);
  }
  throw new Error('Keine Signatur gefunden');
}

// VAPID ----------------------------------------------------------------------------------------------------

/**
 * VAPID-Token (RFC 8292): JWT `base64url(kopf).base64url(inhalt).base64url(signatur)` mit Kopf
 * {"typ":"JWT","alg":"ES256"} und Inhalt { aud, exp, sub }. `aud` = Ursprung des Endpunkts (pushUrsprung),
 * `ablaufSekunden` = Ablauf in Sekunden seit 1970, `sub` = PUSH_KONTAKT. Signiert wird `kopf.inhalt` (ecdsaSignieren).
 */
function vapidJwt(aud, ablaufSekunden, privatBytes, sha256, hmacSha256) {
  const teil = (o) => base64urlAusBytes(utf8Bytes(JSON.stringify(o)));
  const unsigniert = teil({ typ: 'JWT', alg: 'ES256' }) + '.' + teil({ aud: aud, exp: ablaufSekunden, sub: PUSH_KONTAKT });
  return unsigniert + '.' + base64urlAusBytes(ecdsaSignieren(utf8Bytes(unsigniert), privatBytes, sha256, hmacSha256));
}

/** Kopfzeilen für eine Mitteilung ohne Inhalt: Token und öffentlicher Schlüssel (base64url), Haltbarkeit, Dringlichkeit. */
function pushKopfzeilen(jwt, oeffentlich) {
  return { Authorization: 'vapid t=' + jwt + ', k=' + oeffentlich, TTL: String(PUSH_TTL_SEKUNDEN), Urgency: PUSH_DRINGLICHKEIT };
}

// Endpunkte und Geräte -------------------------------------------------------------------------------------

/**
 * Endpunkt eines Geräts prüfen (PUSH_HOSTS, PUSH_HOST_ENDEN in Konfig.js). Erlaubt → sein Ursprung `https://host`
 * (das `aud` im Token), sonst ''. Bewusst streng und ohne eigenes Zerlegen von URLs: Alles zwischen `https://` und
 * dem ersten `/` muss ein kleingeschriebener Hostname sein, damit ist auch kein Port und kein `name:passwort@` möglich.
 */
function pushUrsprung(endpunkt) {
  if (typeof endpunkt !== 'string' || endpunkt.length > MAX_PUSH_ENDPUNKT) return '';
  const m = PUSH_ENDPUNKT_MUSTER.exec(endpunkt);
  if (!m) return '';
  const host = m[1];
  if (host.length > MAX_HOST_ZEICHEN || PUSH_PROZENT_KAPUTT_MUSTER.test(endpunkt)) return '';
  if (!host.split('.').every((teil) => teil.length <= MAX_HOST_TEIL_ZEICHEN && PUSH_HOST_TEIL_MUSTER.test(teil))) return '';
  const erlaubt = PUSH_HOSTS.indexOf(host) >= 0 ||
    PUSH_HOST_ENDEN.some((ende) => host.length > ende.length && host.slice(-ende.length) === ende);
  return erlaubt ? 'https://' + host : '';
}

/** Kennung eines Geräts: die ersten PUSH_KENNUNG_HEX Hex-Zeichen von SHA-256 des Endpunkts. `sha256Hex(text)` → Hex. */
function pushKennung(endpunkt, sha256Hex) {
  return sha256Hex(endpunkt).slice(0, PUSH_KENNUNG_HEX);
}

/** Name der Skripteigenschaft für das Gerät `kennung` von `name`. */
function pushEigenschaftName(name, kennung) {
  return PUSH_PRAEFIX + name + ':' + kennung;
}

/** p256dh bzw. auth aus der Anfrage: base64url-Text mit 1 bis MAX_PUSH_SCHLUESSEL Zeichen? */
function pushSchluesselTextGueltig(wert) {
  return typeof wert === 'string' && wert.length >= 1 && wert.length <= MAX_PUSH_SCHLUESSEL && PUSH_SCHLUESSEL_MUSTER.test(wert);
}

/**
 * Alle Skripteigenschaften (Objekt) → das Schlüsselpaar { privat (32 Bytes), oeffentlich (base64url-Text, 65 Bytes) }.
 * Fehlt einer der beiden oder ist er unlesbar (privat nicht 1 ≤ d < n, öffentlich nicht 0x04 und 64 Bytes): null,
 * die Mitteilungen sind dann nicht eingerichtet. Ob die beiden zusammenpassen, prüft pushEinrichten() in Api.js.
 */
function pushSchluesselLesen(eigenschaften) {
  const e = eigenschaften || {};
  const privat = bytesAusBase64url(e[PUSH_PRIVAT_EIGENSCHAFT]);
  const oeffentlich = bytesAusBase64url(e[PUSH_OEFFENTLICH_EIGENSCHAFT]);
  if (!privat || !pushPrivatGueltig(privat)) return null;
  if (!oeffentlich || oeffentlich.length !== 1 + 2 * P256_BYTES || oeffentlich[0] !== 4) return null;
  return { privat: privat, oeffentlich: base64urlAusBytes(oeffentlich) };
}

/**
 * Alle Skripteigenschaften (Objekt) → Liste der Geräte { name, kennung, eigenschaft, endpoint, p256dh, auth, seit },
 * sortiert nach Name, dann „seit“ (ältestes zuerst), dann Kennung. `eigenschaft` ist der Name der Skripteigenschaft.
 * Kaputte Einträge fallen weg (kein JSON oder ein Endpunkt, der die Prüfung pushUrsprung nicht besteht): An so einen
 * Eintrag wird nie gesendet, auch wenn ihn jemand von Hand in die Skripteigenschaften schreibt.
 */
function pushGeraeteLesen(eigenschaften) {
  const text = (w) => (typeof w === 'string' ? w : '');
  const aus = [];
  Object.keys(eigenschaften || {}).forEach((k) => {
    const m = PUSH_EIGENSCHAFT_MUSTER.exec(k);
    if (!m) return;
    let e;
    try { e = JSON.parse(eigenschaften[k]); } catch (err) { return; }
    if (!e || typeof e !== 'object' || !pushUrsprung(e.endpoint)) return;
    aus.push({ name: m[1], kennung: m[2], eigenschaft: k, endpoint: e.endpoint, p256dh: text(e.p256dh), auth: text(e.auth), seit: text(e.seit) });
  });
  const vergleich = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return aus.sort((a, b) => vergleich(a.name, b.name) || vergleich(a.seit, b.seit) || vergleich(a.kennung, b.kennung));
}

/** Zahl der Einträge `push:…` in den Skripteigenschaften, die pushGeraeteLesen() nicht lesen kann. */
function pushKaputteEintraege(eigenschaften) {
  const alle = Object.keys(eigenschaften || {}).filter((k) => PUSH_EIGENSCHAFT_MUSTER.test(k)).length;
  return alle - pushGeraeteLesen(eigenschaften).length;
}

/**
 * Feld `push` für die App: null, solange das Schlüsselpaar fehlt, sonst { schluessel, geraete }. `schluessel` = der
 * öffentliche Schlüssel (base64url, damit meldet der Browser das Gerät beim Push-Dienst an), `geraete` = die Kennungen
 * der Geräte von `name` (ältestes zuerst). Endpunkte und Geräte anderer Personen gehen nie an die App.
 */
function pushStand(eigenschaften, name) {
  const s = pushSchluesselLesen(eigenschaften);
  if (!s) return null;
  return { schluessel: s.oeffentlich, geraete: pushGeraeteLesen(eigenschaften).filter((g) => g.name === name).map((g) => g.kennung) };
}

/**
 * Übersicht für die App (uebersichtBauen) um das Feld `push` der anfragenden Person ergänzen. Die Übersicht selbst
 * ist reine Logik ohne Namen und ohne Skripteigenschaften, deshalb kommt das Feld hier dazu: Jede Übersicht, die an
 * die App geht, läuft durch diese Funktion (bearbeiten() in Logik.js). `umgebung.eigenschaften()` → alle
 * Skripteigenschaften als Objekt. Keine Übersicht (null) bleibt null.
 */
function uebersichtMitPush(uebersicht, name, umgebung) {
  return uebersicht ? Object.assign(uebersicht, { push: pushStand(umgebung.eigenschaften(), name) }) : uebersicht;
}

// Senden ---------------------------------------------------------------------------------------------------

/**
 * Anfragen für eine Mitteilung ohne Inhalt an alle Geräte von `name`: Liste { kennung, eigenschaft, url, dienst,
 * kopfzeilen }, je Gerät eine (POST mit leerem Body, das macht der Adapter in Api.js). Das Token gilt ab `jetztMs`
 * (Millisekunden seit 1970) PUSH_TOKEN_SEKUNDEN lang und wird je Push-Dienst (`dienst` = Ursprung der Adresse) nur
 * einmal signiert. Ohne Schlüsselpaar oder ohne Geräte: leere Liste. `eigenschaft` = Name der Skripteigenschaft (zum
 * Löschen, wenn es das Gerät nicht mehr gibt).
 */
function pushAnfragen(eigenschaften, name, jetztMs, sha256, hmacSha256) {
  const s = pushSchluesselLesen(eigenschaften);
  if (!s) return [];
  const ablauf = Math.floor(jetztMs / 1000) + PUSH_TOKEN_SEKUNDEN;
  const tokens = Object.create(null);
  return pushGeraeteLesen(eigenschaften).filter((g) => g.name === name).map((g) => {
    const aud = pushUrsprung(g.endpoint);
    if (!tokens[aud]) tokens[aud] = vapidJwt(aud, ablauf, s.privat, sha256, hmacSha256);
    return { kennung: g.kennung, eigenschaft: g.eigenschaft, url: g.endpoint, dienst: aud, kopfzeilen: pushKopfzeilen(tokens[aud], s.oeffentlich) };
  });
}

/**
 * Anfragen (pushAnfragen) nach Push-Dienst bündeln: Liste von Listen, in der Reihenfolge, in der die Dienste zuerst
 * vorkommen. Je Dienst geht ein Abruf mit allen seinen Geräten gleichzeitig hinaus: Ist ein Dienst nicht erreichbar,
 * bekommen die Geräte bei den anderen Diensten ihre Mitteilung trotzdem.
 */
function pushNachDienst(plan) {
  const gruppen = [];
  const platz = Object.create(null);
  (plan || []).forEach((p) => {
    if (platz[p.dienst] === undefined) platz[p.dienst] = gruppen.push([]) - 1;
    gruppen[platz[p.dienst]].push(p);
  });
  return gruppen;
}

/**
 * Text vom Push-Dienst (Antwort oder Fehlermeldung) fürs Log, höchstens PUSH_LOG_ZEICHEN Zeichen in einer Zeile.
 * Heraus fällt alles, was eine Adresse ist oder aus den Anfragen `plan` (pushAnfragen) stammt: die Adressen der
 * Geräte, ihr Pfad und dessen Teile ab PUSH_LOG_TEIL_ZEICHEN Zeichen (auch entschlüsselt, falls `%` darin steht) und
 * das Token. So landet nie die Adresse eines Geräts im Log, auch wenn der Dienst sie in seiner Antwort wiederholt.
 */
function pushLogText(text, plan) {
  const geheim = [];
  const merken = (t) => { if (typeof t === 'string' && t.length >= PUSH_LOG_TEIL_ZEICHEN) geheim.push(t); };
  (plan || []).forEach((p) => {
    const pfad = String(p.url).slice(String(p.dienst || '').length);
    merken(p.url);
    [pfad].concat(pfad.split(/[\/?&=]/)).forEach((t) => {
      merken(t);
      try { merken(decodeURIComponent(t)); } catch (err) { /* kein gültiges %HH: dann nur der Text selbst */ }
    });
    const m = /^vapid t=([^,]+),/.exec((p.kopfzeilen && p.kopfzeilen.Authorization) || '');
    if (m) [m[1]].concat(m[1].split('.')).forEach(merken);
  });
  let s = String(text === undefined || text === null ? '' : text);
  // längste zuerst, damit von einem längeren Teil kein Rest stehen bleibt
  geheim.sort((a, b) => b.length - a.length).forEach((g) => { s = s.split(g).join('(entfernt)'); });
  return s.replace(/https?:\/\/[^\s"'<>]+/gi, '(Adresse)').replace(/\s+/g, ' ').trim().slice(0, PUSH_LOG_ZEICHEN);
}

/** Hat der Push-Dienst die Mitteilung angenommen (Statuscode 200 bis 299, üblich ist 201)? */
function pushAngenommen(status) {
  return typeof status === 'number' && status >= 200 && status <= 299;
}

/**
 * Mitteilung an `name` schicken, ohne dass je etwas daran scheitert: `u.pushSenden(name)` (Adapter in Api.js) → Zahl
 * der Geräte, die angenommen haben. Jeder Fehler wird geschluckt und zählt als 0. Immer erst nach der Sperre aufrufen.
 */
function pushBenachrichtigen(u, name) {
  try {
    const n = u.pushSenden(name);
    return typeof n === 'number' && n > 0 ? Math.floor(n) : 0;
  } catch (err) {
    return 0;
  }
}

// Ablauf ---------------------------------------------------------------------------------------------------

/**
 * Aktionen `pushAnmelden` und `pushAbmelden` (nur nach gültigem Code, `name` aus dem Code). Beide laufen unter der
 * Sperre und fassen nur Skripteigenschaften `push:…` an, nie das Sheet. `u` (umgebung) liefert dafür:
 *   sha256Hex(text), jetzt() → Date, mitSperre(fn) → { wert } oder { gesperrt: true },
 *   eigenschaftenFrisch() → alle Skripteigenschaften als Objekt, neu gelesen (unter der Sperre),
 *   pushSchreiben(eigenschaft, text) und pushLoeschen(eigenschaft) für einen Eintrag `push:<Name>:<Kennung>`.
 * `pushAnmelden`: Daten { endpoint, p256dh, auth }. Der Endpunkt muss die Prüfung pushUrsprung bestehen, p256dh und
 * auth sind base64url-Texte bis MAX_PUSH_SCHLUESSEL Zeichen, sonst FEHLER_ANFRAGE. Ohne Schlüsselpaar:
 * FEHLER_PUSH_EINRICHTUNG. Das Gerät wird für `name` eingetragen (dasselbe Gerät noch einmal: „seit“ bleibt, ohne
 * Änderung wird nichts geschrieben). Steht dieselbe Kennung bei einer anderen Person (das Handy hat den Zugangscode
 * gewechselt), fällt deren Eintrag weg. Mehr als MAX_PUSH_GERAETE Geräte: die ältesten fallen weg. Wer die Adresse
 * eines fremden Geräts kennt, könnte es so auf sich umhängen: Deshalb gehen Adressen nie an die App und nie ins Log.
 * `pushAbmelden`: Daten { endpoint } (Text bis MAX_PUSH_ENDPUNKT Zeichen). Löscht nur den Eintrag der eigenen Person;
 * gab es keinen, ist das kein Fehler.
 * Antwort beider: { ok: true, push } mit dem neuen Stand (pushStand). Fehler: { ok: false, fehler }.
 */
function pushAktion(aktion, daten, name, u) {
  const anmelden = aktion === 'pushAnmelden';
  const endpunkt = daten.endpoint;
  if (anmelden) {
    if (!pushUrsprung(endpunkt) || !pushSchluesselTextGueltig(daten.p256dh) || !pushSchluesselTextGueltig(daten.auth)) {
      return { ok: false, fehler: FEHLER_ANFRAGE };
    }
  } else if (typeof endpunkt !== 'string' || !endpunkt || endpunkt.length > MAX_PUSH_ENDPUNKT) {
    return { ok: false, fehler: FEHLER_ANFRAGE };
  }
  const kennung = pushKennung(endpunkt, u.sha256Hex);
  const r = u.mitSperre(() => {
    // Kopie: Sie wird mitgeführt, damit der neue Stand ohne ein weiteres Lesen der Skripteigenschaften feststeht
    const eig = Object.assign({}, u.eigenschaftenFrisch());
    if (anmelden && !pushSchluesselLesen(eig)) return { ok: false, fehler: FEHLER_PUSH_EINRICHTUNG };
    const schreiben = (k, text) => { u.pushSchreiben(k, text); eig[k] = text; };
    const loeschen = (k) => { u.pushLoeschen(k); delete eig[k]; };
    const eigene = pushEigenschaftName(name, kennung);
    if (anmelden) pushAnmelden_(daten, name, kennung, eigene, eig, u.jetzt(), schreiben, loeschen);
    else if (Object.prototype.hasOwnProperty.call(eig, eigene)) loeschen(eigene);
    return { ok: true, push: pushStand(eig, name) };
  });
  if (r.gesperrt) return { ok: false, fehler: FEHLER_BESCHAEFTIGT };
  return r.wert;
}

/**
 * Gerät `kennung` für `name` in die Skripteigenschaften `eig` eintragen (geprüfte Daten). Reihenfolge, damit ein
 * Fehler mittendrin nichts Falsches hinterlässt: (1) Dieselbe Kennung bei einer anderen Person fällt weg, bevor das
 * Gerät bei `name` steht (es hängt so nie an zwei Personen; scheitert das, ist nichts geändert). (2) Der eigene
 * Eintrag. (3) Zu viele eigene Geräte: Die ältesten fallen weg. Scheitert dieses Aufräumen, ist das Gerät trotzdem
 * angemeldet (kein Fehler für die App) und die nächste Anmeldung räumt nach.
 */
function pushAnmelden_(daten, name, kennung, eigene, eig, jetzt, schreiben, loeschen) {
  const geraete = pushGeraeteLesen(eig);
  // (1) auch ein unlesbarer Eintrag mit dieser Kennung
  Object.keys(eig).forEach((k) => {
    const m = PUSH_EIGENSCHAFT_MUSTER.exec(k);
    if (m && m[2] === kennung && k !== eigene) loeschen(k);
  });
  // (2)
  const alt = geraete.find((g) => g.eigenschaft === eigene);
  const unveraendert = alt && alt.endpoint === daten.endpoint && alt.p256dh === daten.p256dh && alt.auth === daten.auth;
  if (!unveraendert) {
    schreiben(eigene, JSON.stringify({ endpoint: daten.endpoint, p256dh: daten.p256dh, auth: daten.auth,
      seit: alt && alt.seit ? alt.seit : jetzt.toISOString() }));
  }
  // (3) nie das eben angemeldete
  const andere = geraete.filter((g) => g.name === name && g.eigenschaft !== eigene);
  try {
    andere.slice(0, Math.max(0, andere.length + 1 - MAX_PUSH_GERAETE)).forEach((g) => loeschen(g.eigenschaft));
  } catch (err) {
    // bleibt bis zur nächsten Anmeldung eines Geräts liegen
  }
}
