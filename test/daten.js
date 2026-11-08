'use strict';

// Synthetische Testdaten (frei erfunden, keine echten Verkaufsdaten: das Repo ist öffentlich).

/** Datum → `JJJJ-MM-TT` in Europe/Berlin (wie Utilities.formatDate im Adapter). */
const berlinFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const berlin = (d) => berlinFormat.format(d);

/** Sheets-Seriennummer eines Tages (so liefert getValues() Zahlen mit Datumsmuster, z. B. Altzeilen in Spalte A). */
const serie = (j, m, t) => Date.UTC(j, m - 1, t) / 86400000 + 25569;

/** Datumszelle wie von getValues(): Mitternacht des Tages in Berlin. */
function zelle(j, m, t) {
  const mittag = new Date(Date.UTC(j, m - 1, t, 12));
  const stunde = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(mittag));
  return new Date(Date.UTC(j, m - 1, t, 12 - (stunde - 12) - 12));
}

const verkaufKopf = () => ['Monat', 'Datum', 'Quelle', 'Kanal', 'Kunde', 'Flaschen', 'Preis/Fl netto (€)', 'Pfand/Fl (€)',
  'Umsatz netto inkl. Pfand (€)', 'Rechnung', 'Kommentar', 'Standort'];
const lagerKopf = () => ['Datum', 'Standort', 'Art', 'Flaschen', 'Nach-Standort', 'Wer', 'Kommentar', 'Erfasst am', 'ID', 'Storno von'];

/** App-Einstellungen mit erfundenen Standorten. */
const einstellungen = () => [
  ['Einstellung', 'Wert', 'Erklärung'],
  ['Standorte', 'Lager Süd; Lager Nord;Lager Ost', 'erster = Hauptlager'],
  ['Standort für Verkäufe', 'Lager Süd'],
  ['Standort für Kanal Berlin', 'Lager Nord'],
  ['Vorlaufzeit Abfüller (Monate)', 2],
  ['Puffer (Wochen)', '2'],
  ['Mindestbestand (Flaschen)', 0],
  ['Zeitraum für Ø-Abverkauf (Monate)', 3],
  ['Flaschen pro Kiste', 24],
];

/** Verkäufe-Zeile: Altliste (Monat als Seriennummer, kein Datum) oder mit Rechnungsdatum (Datumszellen). */
function altzeile(j, m, kanal, kunde, flaschen, umsatz) {
  return [serie(j, m, 1), '', 'Altliste', kanal, kunde, flaschen, 1, 0.08, umsatz, '', '', ''];
}
function rechnungszeile(j, m, t, kanal, kunde, flaschen, umsatz, standort) {
  return [zelle(j, m, 1), zelle(j, m, t), 'Lexware', kanal, kunde, flaschen, 1, 0.08, umsatz, 'RE1', '', standort || ''];
}

module.exports = { berlin, serie, zelle, verkaufKopf, lagerKopf, einstellungen, altzeile, rechnungszeile };
