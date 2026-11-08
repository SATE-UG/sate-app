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

// Lese-Logik (Task 4) -------------------------------------------------------------------------------------

/** Zeitzone für „heute“ und Datumszellen (das Sheet steht ebenfalls auf Europe/Berlin). */
const ZEITZONE = 'Europe/Berlin';
/** Tabs im Sheet „SATE Verkäufe“. */
const VERKAEUFE_TAB = 'Verkäufe';
const LAGER_LOG_TAB = 'Lager-Log';
const LAGER_TAB = 'Lager';
const EINSTELLUNGEN_TAB = 'App-Einstellungen';
const ABFUELLUNGEN_TAB = 'Abfüllungen';
/** Übersicht!B8:B13: Abgefüllt, Verkauft, Bestand rechnerisch, Kisten, Ø 12 Monate, Reichweite (nur lesen). */
const BEREICH_UEBERSICHT = 'B8:B13';
/** Tab Lager: Namen in A2:A5 (drei Standorte + „Summe“), das Skript schreibt nur B2:F5. */
const LAGER_NAMEN_BEREICH = 'A2:A5';
const LAGER_BEREICH = 'B2:F5';
const LAGER_SUMME = 'Summe';
/** Zahlenformate für B2:F5: Bestand, Kisten, Letzte Inventur, Schwund, Stand. */
const LAGER_FORMATE = ['#,##0', '#,##0.0', 'dd.MM.yyyy', '#,##0', 'dd.MM.yyyy HH:mm'];
/** Täglicher Trigger: Funktion und Stunde (Apps Script startet ihn irgendwann zwischen 7 und 8 Uhr). */
const TRIGGER_FUNKTION = 'taeglich';
const TRIGGER_STUNDE = 7;

/** Spalten im Tab Verkäufe (0 = A). Die Belege-Kette schreibt A–K, hier wird nur gelesen. */
const VK = { MONAT: 0, DATUM: 1, QUELLE: 2, KANAL: 3, KUNDE: 4, FLASCHEN: 5, UMSATZ: 8, STANDORT: 11 };
/** Erwartete Spaltenköpfe (Schutz gegen verschobene Spalten). */
const VK_KOPF = { 0: 'Monat', 1: 'Datum', 3: 'Kanal', 4: 'Kunde', 5: 'Flaschen', 8: 'Umsatz netto inkl. Pfand (€)', 11: 'Standort' };
/** Kanäle wie im Tab Übersicht; Leeres oder Unbekanntes zählt als „Sonstiges“. */
const KANAELE = ['Karlsruhe', 'Berlin', 'Heilbronn', 'München', 'Ape', 'Aktion', 'Sonstiges'];
const KANAL_UNBEKANNT = 'Sonstiges';
/** Kunde, dessen Rechnung den Abverkauf des Vormonats abdeckt (Teiltext, Groß/klein egal). */
const KUNDE_VORMONAT = 'dörflinger';

/** Spalten im Tab Lager-Log (0 = A). */
const LL = { DATUM: 0, STANDORT: 1, ART: 2, FLASCHEN: 3, NACH: 4, WER: 5, KOMMENTAR: 6, ERFASST: 7, ID: 8, STORNO_VON: 9 };
const LL_KOPF = { 0: 'Datum', 1: 'Standort', 2: 'Art', 3: 'Flaschen', 4: 'Nach-Standort', 8: 'ID', 9: 'Storno von' };
/** Arten im Lager-Log und ihre Richtung: +1 Zugang, −1 Abgang (Inventur und Storno gesondert). */
const LAGER_ARTEN = {
  Inventur: 0, 'Abfüllung': 1, Umlagerung: -1, Promo: -1, Eigenverbrauch: -1, Bruch: -1, Storno: 0,
};

/** Tab App-Einstellungen: Text in Spalte A (exakt) → Schlüssel und Standardwert, falls die Zeile fehlt. */
const EINSTELLUNGEN = [
  { text: 'Standorte', schluessel: 'standorte', standard: 'Dörflinger Karlsruhe;Dave Berlin;Mark Berlin' },
  { text: 'Standort für Verkäufe', schluessel: 'standortVerkaeufe', standard: 'Dörflinger Karlsruhe' },
  { text: 'Standort für Kanal Berlin', schluessel: 'standortBerlin', standard: 'Dave Berlin' },
  { text: 'Vorlaufzeit Abfüller (Monate)', schluessel: 'vorlaufMonate', standard: 2, zahl: true, ganz: true },
  { text: 'Puffer (Wochen)', schluessel: 'pufferWochen', standard: 2, zahl: true },
  { text: 'Mindestbestand (Flaschen)', schluessel: 'mindestbestand', standard: 0, zahl: true },
  { text: 'Zeitraum für Ø-Abverkauf (Monate)', schluessel: 'abverkaufMonate', standard: 6, zahl: true, ganz: true, min: 1 },
  { text: 'Flaschen pro Kiste', schluessel: 'flaschenProKiste', standard: 24, zahl: true, min: 1 },
];
/** Bestellstatus: „bald“, wenn der späteste Bestelltermin höchstens so viele Tage entfernt ist. */
const BALD_TAGE = 30;
/** Durchschnittliche Monatslänge in Tagen (für „leer am“ aus der Reichweite in Monaten). */
const TAGE_PRO_MONAT = 365.25 / 12;
/** Höchstens so viele Hinweise in der Antwort. */
const MAX_HINWEISE = 20;
/** Top-Kunden in der Auswertung. */
const TOP_KUNDEN = 10;
