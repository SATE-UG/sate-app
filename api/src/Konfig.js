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
/**
 * Tab Lager: ab A2 je Standort eine Zeile, danach „Summe“. Das Skript liest A2:A21, schreibt nur B2:F<Zeile von Summe>.
 * Neuer Standort: Zeile über „Summe“ einfügen (Name wie in App-Einstellungen → Standorte).
 */
const LAGER_NAMEN_BEREICH = 'A2:A21';
const LAGER_ERSTE_ZEILE = 2;
const LAGER_SUMME = 'Summe';
/** Zahlenformate für Lager B–F: Bestand, Kisten, Letzte Inventur, Schwund, Stand. */
const LAGER_FORMATE = ['#,##0', '#,##0.0', 'dd.MM.yyyy', '#,##0', 'dd.MM.yyyy HH:mm'];
/** Täglicher Trigger: Funktion und Stunde (Apps Script startet ihn irgendwann zwischen 7 und 8 Uhr). */
const TRIGGER_FUNKTION = 'taeglich';
const TRIGGER_STUNDE = 7;

/** Spalten im Tab Verkäufe (0 = A). Die Belege-Kette schreibt A–K, hier wird nur gelesen. */
const VK = { MONAT: 0, DATUM: 1, QUELLE: 2, KANAL: 3, KUNDE: 4, FLASCHEN: 5, UMSATZ: 8, RECHNUNG: 9, KOMMENTAR: 10, STANDORT: 11 };
/**
 * Bezug einer Gutschrift bzw. eines Stornos im Kommentar (Spalte K), wie ihn die Belege-Kette schreibt:
 * „Gutschrift zu RE760175“, „Storno zu RE760175“ (seit v39 für First in, First out in der App).
 */
const VK_BEZUG_MUSTER = /(?:Gutschrift|Storno)\s+zu\s+([^\s;,]+)/i;
/** Erwartete Spaltenköpfe (Schutz gegen verschobene Spalten). */
const VK_KOPF = {
  0: 'Monat', 1: 'Datum', 3: 'Kanal', 4: 'Kunde', 5: 'Flaschen', 8: 'Umsatz netto inkl. Pfand (€)', 9: 'Rechnung', 11: 'Standort',
};
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

/** Arten, bei denen Flaschen ohne Verkauf weggehen (für `uebersicht.abgaenge`: Die App zieht ihre Herstellkosten vom Rohertrag ab). */
const ABGANG_ARTEN = ['Promo', 'Eigenverbrauch', 'Bruch'];

/** Tab App-Einstellungen: Text in Spalte A (exakt) → Schlüssel und Standardwert, falls die Zeile fehlt. */
const EINSTELLUNGEN = [
  { text: 'Standorte', schluessel: 'standorte', standard: 'Dörflinger Karlsruhe;Dave Berlin;Mark Berlin' },
  { text: 'Standort für Verkäufe', schluessel: 'standortVerkaeufe', standard: 'Dörflinger Karlsruhe' },
  { text: 'Standort für Kanal Berlin', schluessel: 'standortBerlin', standard: 'Dave Berlin' },
  { text: 'Standort nach Kunde', schluessel: 'kundenStandorte', standard: '', leerErlaubt: true },
  { text: 'Vorlaufzeit Abfüller (Monate)', schluessel: 'vorlaufMonate', standard: 2, zahl: true, ganz: true },
  { text: 'Puffer (Wochen)', schluessel: 'pufferWochen', standard: 2, zahl: true },
  { text: 'Mindestbestand (Flaschen)', schluessel: 'mindestbestand', standard: 0, zahl: true },
  { text: 'Zeitraum für Ø-Abverkauf (Monate)', schluessel: 'abverkaufMonate', standard: 6, zahl: true, ganz: true, min: 1 },
  { text: 'Flaschen pro Kiste', schluessel: 'flaschenProKiste', standard: 24, zahl: true, min: 1 },
];
/**
 * Bestand zum Jahresende (seit v42, Lagerabgleich im Gewinn): Zeilen im Tab App-Einstellungen mit diesem Muster in A,
 * z. B. „Bestand 31.12.2025 (€)“ mit dem Wert der Vorräte laut Jahresabschluss. Freiwillig, kein Hinweis, wenn sie fehlen.
 */
const BESTAND_JAHRESENDE_MUSTER = /^Bestand 31\.12\.(\d{4}) \(€\)$/;
/** Jahresinventur: Zählungen vom 31.12. bis zu diesem Tag im Januar (MM-TT) gelten als Bestand zum 31.12. */
const JAHRESINVENTUR_BIS = '01-15';
/** Bestellstatus: „bald“, wenn der späteste Bestelltermin höchstens so viele Tage entfernt ist. */
const BALD_TAGE = 30;
/** Durchschnittliche Monatslänge in Tagen (für „leer am“ aus der Reichweite in Monaten). */
const TAGE_PRO_MONAT = 365.25 / 12;
/** Höchstens so viele Hinweise in der Antwort. */
const MAX_HINWEISE = 20;
/** Top-Kunden in der Auswertung. */
const TOP_KUNDEN = 10;
/** Wie viele Inventuren pro Standort die Übersicht mitschickt (Jahresinventur zum 31.12. trotz späterer Zählung). */
const INVENTUREN_ANZAHL = 6;

// Schreib-Logik (Task 5) ----------------------------------------------------------------------------------

/** Arten, die die App buchen darf (Storno nur über die Aktion `stornieren`). */
const BUCHBARE_ARTEN = ['Inventur', 'Abfüllung', 'Umlagerung', 'Promo', 'Eigenverbrauch', 'Bruch'];
/** Höchstens so viele Flaschen pro Buchung (Inventur darf 0 sein, alles andere ab 1). */
const MAX_FLASCHEN = 50000;
/** Längster Kommentar (Zeichen). */
const MAX_KOMMENTAR = 200;
/**
 * Buchungsdatum: höchstens so viele Tage in der Zukunft bzw. zurück (Kalendertage in Europe/Berlin). Seit dem
 * Codex-Befund vom 2026-11-08 höchstens heute: Zukunftsbuchungen würden den Bestand sofort verändern.
 */
const MAX_TAGE_ZUKUNFT = 0;
const MAX_TAGE_ZURUECK = 400;
/** So lange wartet eine Schreib-Anfrage auf die Sperre, dann kommt FEHLER_BESCHAEFTIGT. */
const SPERRE_MS = 10000;
/** Doppelklick-Schutz: gleiche anfrageId innerhalb dieser Zeit wird nicht doppelt geschrieben (CacheService). */
const ANFRAGE_CACHE_SEKUNDEN = 600;
const ANFRAGE_ID_MUSTER = /^[A-Za-z0-9_-]{8,64}$/;
/**
 * Mit anfrageId bekommt die Lager-Log-Zeile eine feste ID: Präfix + die ersten Hex-Zeichen von SHA-256 über Aktion,
 * Name und anfrageId. So erkennt der Server eine Wiederholung auch ohne Cache im Lager-Log selbst wieder.
 * Zufalls-IDs (idErzeugen) beginnen mit „L“ + Zeitstempel und kommen dem Präfix nie in die Quere.
 */
const ANFRAGE_ID_PRAEFIX = 'LA-';
const ANFRAGE_ID_HEX = 20;
/** Aktion verlauf: so viele Einträge (neueste zuerst). */
const VERLAUF_ANZAHL = 30;
/** uebersicht.verkaufListe: Rechnungen der letzten so vielen Tage, höchstens so viele. */
const VERKAUF_LISTE_TAGE = 60;
const MAX_VERKAUF_LISTE = 100;
/** Zahlenformate beim Anhängen (Spalte 1 = A). */
const LL_SPALTEN = 10;
const LL_FORMATE = { 1: 'dd.MM.yyyy', 8: 'dd.MM.yyyy HH:mm:ss' };
/** Tab Abfüllungen: A Abfüllung, B Monat, C Flaschen, D Quelle, E Herstellkosten pro Flasche (freiwillige Spalte). */
const AB = { NAME: 0, MONAT: 1, FLASCHEN: 2, QUELLE: 3, KOSTEN: 4 };
const AB_KOPF = { 0: 'Abfüllung', 1: 'Monat', 2: 'Flaschen' };
/**
 * Kopf der freiwilligen Spalte E (seit 2026-11-10). Nur wenn er genau so in E1 steht, liest die App die Herstellkosten
 * pro Flasche je Abfüllung (für Rohertrag und Marge nach First in, First out) und schreibt sie bei einer neuen
 * Abfüllung dazu. Die Zahlen stehen nur im Sheet, nie im Repo.
 */
const AB_KOSTEN_KOPF = 'Kosten/Fl (€)';
const AB_FORMATE = { 2: 'MM.yyyy', 3: '#,##0' };
const AB_FORMATE_KOSTEN = { 2: 'MM.yyyy', 3: '#,##0', 5: '0.0000 "€"' };
/**
 * Tab „Lexware-Kosten“ (seit v38, nur lesen): schreibt das Belege-Skript (sate-belege, docs/lexware-api.md Abschnitt 4)
 * täglich neu, eine Zeile pro Eingangsbeleg und Kategorie, Gutschriften negativ. Fehlt der Tab, liefert die Übersicht
 * `kosten: null` und die App zeigt keinen Gewinn. Spalten A Datum, B Lieferant, C Belegnr., D Typ, E Kategorie,
 * F Gruppe, G Art, H netto (€), I USt (€), J brutto (€), K Status, L Lexware-ID; gelesen werden nur A, E, G, H, K, L und
 * seit v40 B (Lieferant, nur wenn B1 genau „Lieferant“ heißt, sonst fehlt die Auswertung je Lieferant).
 */
const LEXWARE_KOSTEN_TAB = 'Lexware-Kosten';
const LK = { DATUM: 0, LIEFERANT: 1, KATEGORIE: 4, ART: 6, NETTO: 7, STATUS: 10, ID: 11 };
const LK_LIEFERANT_KOPF = 'Lieferant';
const LK_KOPF = { 0: 'Datum', 4: 'Kategorie', 6: 'Art', 7: 'netto (€)', 10: 'Status', 11: 'Lexware-ID' };
/**
 * Werte der Spalte Art: `Ware` steckt über die Herstellkosten je Abfüllung schon im Wareneinsatz und zählt nicht in den
 * Gewinn, `Sonstiges` sind die sonstigen Kosten. Alles andere (leer: Beleg in Lexware noch ohne Kategorie) wird ''.
 */
const KOSTEN_ARTEN = ['Ware', 'Sonstiges'];
/** Status, der nicht zählt (storniert), und Status „in Lexware noch zu prüfen“. */
const KOSTEN_STATUS_ZAEHLT_NICHT = /^voided$/i;
const KOSTEN_STATUS_OFFEN = /^(blank|unchecked)$/i;

/**
 * Tab „Lexware-Rechnungen“ (seit v41, nur lesen): schreibt das Belege-Skript (sate-belege, docs/lexware-api.md
 * Abschnitt 6) täglich neu, eine Zeile pro Ausgangsrechnung bzw. Gutschrift ab 2025, Gutschriften negativ. Fehlt der
 * Tab, liefert die Übersicht `forderungen: null` und die App zeigt nichts dazu. Spalten A Belegnr., B Typ, C Datum,
 * D Fällig am, E Kunde, F brutto (€), G offen (€), H Status, I Währung, J Lexware-ID, K geändert, L Kunden-ID; gelesen
 * werden A, C, D, E, G, H, I, L.
 */
const LEXWARE_RECHNUNGEN_TAB = 'Lexware-Rechnungen';
const LR = { NR: 0, TYP: 1, DATUM: 2, FAELLIG: 3, KUNDE: 4, OFFEN: 6, STATUS: 7, WAEHRUNG: 8, KUNDE_ID: 11, NETTO: 12 };
const LR_KOPF = { 0: 'Belegnr.', 2: 'Datum', 3: 'Fällig am', 4: 'Kunde', 6: 'offen (€)', 7: 'Status', 8: 'Währung', 11: 'Kunden-ID' };
/** Nur diese Status zählen als offene Forderung (`paid`, `paidoff`, `voided` und Entwürfe nicht). */
const RECHNUNG_STATUS_OFFEN = /^(open|overdue)$/i;
const RECHNUNG_STATUS_UEBERFAELLIG = /^overdue$/i;
/**
 * Einnahmen für den Gewinn (seit v42, Lexware-API Task 19): Spalte M „netto (€)“ im Tab Lexware-Rechnungen (schreibt das
 * Belege-Skript seit 2026-11-20), dazu Zeilen mit Typ „Einnahme“ bzw. „Einnahme-Gutschrift“ (Buchhaltungsbelege, z. B.
 * SumUp). Gutschriften zählen negativ, `voided` gar nicht, Monat = Belegdatum (C). Ohne die Spalte: keine Einnahmen.
 */
const LR_NETTO_KOPF = 'netto (€)';
/**
 * Tab „Lexware-GuV“ (seit v42, nur lesen, freiwillig): je Jahr eine Zeile mit den Zahlen der GuV aus Lexware, von Hand
 * bzw. von Claude eingetragen. A Jahr, B Stand, C Umsatzerlöse, D sonstige betriebliche Erträge, E Materialaufwand,
 * F sonstige betriebliche Aufwendungen, G Zinsen und ähnliche Aufwendungen, H Ergebnis laut Lexware, I Quelle,
 * J Kommentar. Aufwände positiv. Gibt es für ein Jahr eine Zeile, ist ihr Ergebnis die Grundlage des Jahresgewinns.
 */
const LEXWARE_GUV_TAB = 'Lexware-GuV';
const GUV_KOPF = ['Jahr', 'Stand', 'Umsatzerlöse (€)', 'Sonstige betriebliche Erträge (€)', 'Materialaufwand (€)',
  'Sonstige betriebliche Aufwendungen (€)', 'Zinsen und ähnliche Aufwendungen (€)', 'Ergebnis laut Lexware (€)'];
const RECHNUNG_STATUS_STORNIERT = /^voided$/i;
const RECHNUNG_TYP_GUTSCHRIFT = /gutschrift/i;
/**
 * Rechtsformen, die beim Abgleich Lexware-Kunde → Kunde in der App am Namensende nicht zählen („Kultursphäre GmbH“
 * passt zu „Kultursphäre“). Nur ganze Wörter nach dem Entfernen von Satzzeichen, nur am Ende.
 */
const KUNDE_RECHTSFORMEN = ['gmbh', 'mbh', 'ug', 'haftungsbeschrankt', 'ag', 'kg', 'ohg', 'gbr', 'ek', 'ev', 'co', 'ltd', 'inc', 'se'];

/** Herstellkosten pro Flasche beim Eintragen: über 0 bis so viele Euro. */
const MAX_KOSTEN_PRO_FLASCHE = 100;

/** Fehlertexte beim Eintragen (die App zeigt sie so an). */
const FEHLER_BESCHAEFTIGT = 'Gerade trägt jemand anderes ein, bitte gleich nochmal versuchen';
const FEHLER_ART = 'Bitte eine gültige Art wählen';
const FEHLER_KOSTEN = 'Herstellkosten pro Flasche: bitte einen Betrag über 0 bis 100 Euro';
const FEHLER_STANDORT = 'Standort unbekannt';
const FEHLER_NACH = 'Nach-Standort fehlt, ist unbekannt oder gleich dem Standort';
const FEHLER_FLASCHEN = 'Flaschen: bitte eine ganze Zahl von 1 bis 50.000';
const FEHLER_FLASCHEN_INVENTUR = 'Flaschen: bitte eine ganze Zahl von 0 bis 50.000';
const FEHLER_DATUM = 'Datum ungültig';
const FEHLER_DATUM_ZUKUNFT = 'Datum liegt in der Zukunft (höchstens heute)';
const FEHLER_DATUM_ALT = 'Datum liegt mehr als 400 Tage zurück';
const FEHLER_KOMMENTAR = 'Kommentar zu lang (höchstens 200 Zeichen)';
const FEHLER_STORNO_FEHLT = 'Eintrag nicht gefunden';
const FEHLER_STORNO_STORNO = 'Ein Storno kann man nicht stornieren';
const FEHLER_STORNO_DOPPELT = 'Eintrag ist schon storniert';
const FEHLER_STORNO_MEHRFACH = 'Diese ID steht mehrfach im Lager-Log, bitte Mark Bescheid geben';
const FEHLER_RECHNUNG = 'Rechnung nicht gefunden';
const FEHLER_ZUORDNEN = 'Speichern hat nicht geklappt, nichts geändert. Bitte gleich nochmal versuchen';
const FEHLER_ZUORDNEN_TEILWEISE = 'Speichern hat nur teilweise geklappt, bitte Mark Bescheid geben';
