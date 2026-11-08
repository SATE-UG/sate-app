/**
 * Reine Logik ohne Google-Dienste (unter Node testbar, siehe test/logik.test.js).
 * Alles, was Google braucht (Zufall, SHA-256, Skripteigenschaften, Sheet), kommt als Funktion herein.
 */

/**
 * Erzeugt einen Zugangscode aus Zufallsbytes. `zufall(n)` liefert n Bytes (0–255).
 * Rejection Sampling: Bytes ab 248 (= 8 × 31) werden verworfen, damit jedes Zeichen gleich wahrscheinlich ist.
 * Rückgabe ohne Bindestriche (normalisiert).
 */
function codeErzeugen(zufall) {
  const n = CODE_ALPHABET.length;
  const grenze = 256 - (256 % n);
  let code = '';
  let runden = 0;
  while (code.length < CODE_LAENGE) {
    if (++runden > 100) throw new Error('Zufallsquelle liefert nichts Brauchbares');
    const bytes = zufall(32);
    for (let i = 0; i < bytes.length && code.length < CODE_LAENGE; i++) {
      const b = bytes[i] & 0xff;
      if (b < grenze) code += CODE_ALPHABET[b % n];
    }
  }
  return code;
}

/** Code zum Anzeigen in Vierergruppen: ABCD-EFGH-JKMN. */
function codeAnzeigen(code) {
  return String(code).match(/.{1,4}/g).join('-');
}

/** Eingabe vereinheitlichen: Großbuchstaben, Leerzeichen und Bindestriche weg. Ungültig → ''. */
function codeNormalisieren(eingabe) {
  if (typeof eingabe !== 'string' || eingabe.length > 100) return '';
  const s = eingabe.toUpperCase().replace(/[\s\-‐-―_.]/g, '');
  if (s.length !== CODE_LAENGE) return '';
  for (let i = 0; i < s.length; i++) if (CODE_ALPHABET.indexOf(s[i]) < 0) return '';
  return s;
}

/** Bytes (auch vorzeichenbehaftet wie in Apps Script) → Hex-Text. */
function hexAusBytes(bytes) {
  return Array.from(bytes, (b) => ((b & 0xff) < 16 ? '0' : '') + (b & 0xff).toString(16)).join('');
}

/** Gesalzener Hash eines normalisierten Codes. `sha256Hex(text)` liefert den SHA-256 als Hex. */
function codeHash(salz, codeNorm, sha256Hex) {
  return sha256Hex(HASH_VERSION + ':' + salz + ':' + codeNorm);
}

/** Vergleich in gleicher Zeit, egal wo der erste Unterschied ist. */
function gleich(a, b) {
  a = String(a);
  b = String(b);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Name bereinigen: getrimmt, 1–MAX_NAME_ZEICHEN Zeichen, keine Steuerzeichen. Ungültig → ''. */
function nameBereinigen(name) {
  if (typeof name !== 'string') return '';
  const s = name.trim().replace(/\s+/g, ' ');
  if (!s || s.length > MAX_NAME_ZEICHEN || /[\u0000-\u001f\u007f]/.test(s)) return '';
  return s;
}

/** Alle Skripteigenschaften (Objekt) → Liste der Code-Einträge, nach Name sortiert. Kaputte Einträge fallen weg. */
function eintraegeLesen(eigenschaften) {
  const aus = [];
  Object.keys(eigenschaften || {}).forEach((k) => {
    if (k.indexOf(CODE_PRAEFIX) !== 0) return;
    let e;
    try { e = JSON.parse(eigenschaften[k]); } catch (err) { return; }
    if (!e || typeof e.hash !== 'string') return;
    aus.push({
      name: k.slice(CODE_PRAEFIX.length), hash: e.hash, gesperrt: e.gesperrt === true,
      angelegt: e.angelegt || '', gesperrtAm: e.gesperrtAm || '',
    });
  });
  return aus.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Name zum Hash, nur bei nicht gesperrtem Eintrag. Vergleicht immer alle Einträge. Kein Treffer → null. */
function nameZumHash(eintraege, hash) {
  let treffer = null;
  eintraege.forEach((e) => {
    if (gleich(e.hash, hash) && !e.gesperrt && treffer === null) treffer = e.name;
  });
  return treffer;
}

/** Anfrage-Text (JSON `{code, aktion}`) prüfen. Rückgabe { code, aktion } oder { fehler }. */
function anfrageLesen(text) {
  if (typeof text !== 'string' || !text || text.length > MAX_ANFRAGE_ZEICHEN) return { fehler: FEHLER_ANFRAGE };
  let o;
  try { o = JSON.parse(text); } catch (err) { return { fehler: FEHLER_ANFRAGE }; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { fehler: FEHLER_ANFRAGE };
  if (typeof o.code !== 'string' || typeof o.aktion !== 'string') return { fehler: FEHLER_ANFRAGE };
  return { code: o.code, aktion: o.aktion };
}

/**
 * Zellwert → Zahl. Zahlen bleiben, Texte im deutschen Format („8.041“, „7,3“) werden gelesen.
 * Leer, Datum, Wahrheitswert oder Unlesbares → null.
 */
function zahlLesen(wert) {
  if (typeof wert === 'number') return isFinite(wert) ? wert : null;
  if (typeof wert !== 'string') return null;
  let s = wert.replace(/[\s  ]/g, '');
  if (!/^-?(\d|\d{1,3}(\.\d{3})+)\d*(,\d+)?$/.test(s)) return null;
  s = s.replace(/\./g, '').replace(',', '.');
  const z = Number(s);
  return isFinite(z) ? z : null;
}

/** Antwort auf `ping`. */
function pingAntwort(name, bestandRoh, reichweiteRoh, jetzt) {
  return { ok: true, name: name, bestand: zahlLesen(bestandRoh), reichweite: zahlLesen(reichweiteRoh), zeit: jetzt.toISOString() };
}

/**
 * Eine Anfrage bearbeiten. `umgebung` liefert:
 *   salz() → Text oder null, eintraege() → Liste (eintraegeLesen), sha256Hex(text),
 *   kennzahlen() → { bestand, reichweite } (Rohwerte aus dem Sheet), jetzt() → Date.
 * Das Sheet wird erst nach gültigem Code gelesen.
 */
function bearbeiten(text, umgebung) {
  const a = anfrageLesen(text);
  if (a.fehler) return { ok: false, fehler: a.fehler };
  const norm = codeNormalisieren(a.code);
  const salz = norm ? umgebung.salz() : null;
  if (!salz) return { ok: false, fehler: FEHLER_CODE };
  const name = nameZumHash(umgebung.eintraege(), codeHash(salz, norm, umgebung.sha256Hex));
  if (name === null) return { ok: false, fehler: FEHLER_CODE };
  if (a.aktion === 'ping') {
    const k = umgebung.kennzahlen();
    return pingAntwort(name, k.bestand, k.reichweite, umgebung.jetzt());
  }
  return { ok: false, fehler: FEHLER_AKTION };
}
