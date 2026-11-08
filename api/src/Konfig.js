/**
 * Konfiguration für die „SATE-App“-Schnittstelle (Apps-Script-Web-App).
 *
 * Hier stehen nur Namen und feste Werte, keine Geheimnisse und keine IDs (das Repo wird später öffentlich).
 * Die Sheet-ID steht in Lokal.js (nicht im Git, Vorlage: api/Lokal.example.js).
 * Zugangscodes liegen nur als gesalzener SHA-256-Hash in den Skripteigenschaften, nie im Code.
 */

/** Tab im Sheet „SATE Verkäufe“ mit den Kennzahlen. */
const UEBERSICHT_TAB = 'Übersicht';
/** Bestand rechnerisch (Flaschen). */
const ZELLE_BESTAND = 'B10';
/** Reichweite (Monate). */
const ZELLE_REICHWEITE = 'B13';
/** Ein Lesezugriff für beide Zellen: B10 ist Zeile 0, B13 ist Zeile 3. */
const BEREICH_KENNZAHLEN = 'B10:B13';

/** Zeichen für Zugangscodes: nur Großbuchstaben und Ziffern, ohne 0/O, 1/I/L (gut abtippbar). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Länge eines Codes (12 Zeichen aus 31 ≈ 59 Bit Zufall). Angezeigt in Vierergruppen: ABCD-EFGH-JKMN. */
const CODE_LAENGE = 12;
/** Skripteigenschaft pro Person: Präfix + Name → JSON { hash, gesperrt, angelegt, gesperrtAm }. */
const CODE_PRAEFIX = 'CODE:';
/** Skripteigenschaft mit dem Salz (einmal zufällig erzeugt, danach nie ändern, sonst sind alle Codes ungültig). */
const SALZ_EIGENSCHAFT = 'CODE_SALZ';
/** Vor das Salz gehängt, damit spätere Hash-Verfahren unterscheidbar bleiben. */
const HASH_VERSION = 'sate-app-v1';
/** Längster Name für eine Person. */
const MAX_NAME_ZEICHEN = 40;
/** Längster Anfrage-Text (alles darüber wird gar nicht erst gelesen). */
const MAX_ANFRAGE_ZEICHEN = 2000;

/** Fehlertexte, die die App anzeigt. */
const FEHLER_CODE = 'Code ungültig';
const FEHLER_ANFRAGE = 'Ungültige Anfrage';
const FEHLER_AKTION = 'Unbekannte Aktion';
const FEHLER_SERVER = 'Serverfehler, bitte später nochmal versuchen';
