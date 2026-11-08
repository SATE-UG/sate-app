# SATE-App

App fürs SATE-Team (5 Leute, alle iPhone). Stand 2026-11-08: Mini-Version für den ersten iPhone-Test. Nach dem Zugangscode zeigt sie „Hallo <Name>“, den rechnerischen Bestand in Flaschen und die Reichweite in Monaten aus dem Google Sheet „SATE Verkäufe“ (Tab `Übersicht`, Zellen B10 und B13). Seit Task 4 (2026-11-08) rechnet die Schnittstelle zusätzlich Bestand pro Standort, Bestellstatus und Verkäufe-Auswertung (Aktion `uebersicht`, siehe unten). Seit Task 5 (2026-11-08) kann die Schnittstelle auch eintragen (`buchen`, `stornieren`, `verkaufStandort`, dazu `verlauf`). Seit Task 6 (2026-11-08) zeigt die PWA das alles in vier Reitern (siehe „PWA-Details“).

Entschieden (Mark, 2026-11-08):
- **Oberfläche als PWA** in `docs/`, später über GitHub Pages aus `/docs`. Das Repo wird dafür **öffentlich**, deshalb steht nichts Geheimes im Git.
- **Daten über eine Apps-Script-Web-App** in `api/` im Konto mark.reimer@trinksate.de. Scope `spreadsheets` (`SpreadsheetApp.openById` verlangt den vollen Scope, auch nur zum Lesen; später schreibt die App ins Lager-Log) und seit Task 4 `script.scriptapp` (für den täglichen Trigger). Geschrieben wird nur: Zeilen ans Ende von `Lager-Log` und `Abfüllungen`, Spalte L in `Verkäufe` und `Lager!B2:F5` (siehe „Eintragen“).
- **Anmeldung per persönlichem Zugangscode** statt Google-Login.

## Aufbau
| Pfad | Inhalt |
|---|---|
| `api/src/appsscript.json` | Manifest: Europe/Berlin, V8, Web-App (`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`), Scopes `spreadsheets` und `script.scriptapp` |
| `api/src/Konfig.js` | Feste Werte: Tab, Zellen, Code-Alphabet und -Länge, Namen der Skripteigenschaften, Fehlertexte |
| `api/src/Logik.js` | Reine Logik ohne Google: Code erzeugen/normalisieren, Hash, Anfrage prüfen, Zahlen lesen, Antwort bauen |
| `api/src/LagerLogik.js` | Rein: Datumshilfen (Seriennummer, Monatsende, Berlin), Einstellungen, Lager-Log mit Storno, Bestand/Schwund pro Standort, Gesamtbestand, Ø-Abverkauf, Bestellstatus, Werte für Tab Lager |
| `api/src/VerkaufLogik.js` | Rein: Tab Verkäufe lesen, Auswertung pro Monat, Kanal und Top-Kunden |
| `api/src/UebersichtLogik.js` | Rein: baut die Antwort der Aktion `uebersicht` aus den Rohwerten der Tabs |
| `api/src/SchreibLogik.js` | Rein: Eintragen (Prüfregeln, Formel-Schutz, Abfüllungsnummer, Negativ-Warnung, Storno, Verlauf, Doppelklick-Schutz, Verkäufe Spalte L) |
| `api/src/Api.js` | `doGet`, `doPost`, `einrichten`, `codeAnlegen`, `codeSperren`, `codesAnzeigen`, `lagerTabSchreiben`, `taeglich`, `triggerEinrichten` und die Google-Anbindung (jeder Tab einmal per `getValues`) |
| `api/src/Lokal.js` | **Nicht im Git** (`.gitignore`), wird aber mit `clasp push` hochgeladen: Sheet-ID |
| `api/Lokal.example.js` | Vorlage für `Lokal.js` |
| `.clasp.json` | Skriptprojekt „SATE-App“, `rootDir: api/src` |
| `docs/` | PWA: `index.html`, `kern.js` (Zustand, Speicher, Schnittstelle, Rückfrage), `ansichten.js` (Übersicht, Verkäufe, Lager), `eintragen.js` (Formular), `app.js` (Anmeldung, Reiter und Ansichten-Leiste, Laden, Offline-Banner), `gesten.js` (Ziehen zum Aktualisieren, Zoom-Sperre), `update.js` (automatisches Update), `hilfen.js` (reine Hilfen, getestet), `style.css`, `config.js` (Web-App-URL), `manifest.webmanifest`, `sw.js`, `icons/`, `bilder/` (Logo, Flasche, Herz, Doppelpfeil) |
| `werkzeuge/bilder.js` | Erzeugt App-Icons und `docs/bilder/` aus den SATE-Originalen mit macOS-Bordmitteln |
| `test/` | Node-Tests (`npm test`), Google-Attrappen in `test/google.js`, erfundene Testdaten in `test/daten.js` (**nie echte Verkaufsdaten**, das Repo ist öffentlich) |

## Schnittstelle
- `POST` an die Web-App-URL (`…/exec`), Body JSON `{"code": "ABCD-EFGH-JKMN", "aktion": "ping"}`, `Content-Type: text/plain` (dann schickt der Browser keinen CORS-Preflight, den Apps Script nicht beantwortet).
- `ping` → `{"ok": true, "name": "Jonas", "bestand": 8041, "reichweite": 7.3, "zeit": "2026-11-08T15:05:00.000Z"}`. Leere oder unlesbare Zellen kommen als `null`.
- `uebersicht` → `{ok, name, stand, heute, kennzahlen, bestellung, lager, verkaeufe, abfuellungen, verkaufListe, hinweise}` (rund 4 KB):
  - `kennzahlen`: `abgefuellt`, `verkauft`, `bestandRechnerisch` (Übersicht B8–B10), `gesamtbestand` mit `gesamtQuelle` (`inventur` oder `rechnerisch`), `bestandGezaehlt` (Summe der gezählten Standorte), `kisten`, `abverkaufProMonat` mit `abverkaufVon`/`abverkaufBis`, `mindestbestand`, `flaschenProKiste`.
  - `bestellung`: `reichweite` (Monate), `leerAm`, `spaetestensBestellen` (`JJJJ-MM-TT`), `status` (`ok` | `bald` | `jetzt bestellen` | `null`), `vorlaufMonate`, `pufferWochen`.
  - `lager`: pro Standort `{standort, bestand, kisten, letzteInventur, schwund}` (`null` = noch keine Inventur).
  - `verkaeufe`: `monate` (13 Monate inkl. laufendem: `{monat, flaschen, umsatz}`), `letzte12` (12 volle Monate) und `jahr` (Januar bis laufender Monat), je `{von, bis, flaschen, umsatz, kanaele, kunden}` (Top 10).
  - `verkaufListe`: Rechnungen der letzten 60 Tage (höchstens 100, neueste zuerst) `{rechnung, datum, kunde, kanal, flaschen, standort, standortGesetzt, gemischt}`; `standort` ist der wirksame (Regel 1), `standortGesetzt` = Spalte L belegt. Zum Umhängen Berliner Verkäufe.
  - `hinweise`: höchstens 20 Texte (z. B. „Noch keine Inventur …“, kaputte Lager-Log-Zeilen, Storno auf unbekannte ID).
- `verlauf` → `{ok, name, eintraege}`: letzte 30 Lager-Log-Zeilen, neueste zuerst, je `{zeile, id, datum, standort, art, flaschen, nach, wer, kommentar, erfasst, stornoVon, storniert, stornierbar}`.
- Schreib-Aktionen siehe „Eintragen“.
- Falscher oder gesperrter Code → `{"ok": false, "fehler": "Code ungültig"}`. Das Sheet wird erst nach gültigem Code gelesen.
- Kaputte Anfrage → `Ungültige Anfrage`, andere Aktion → `Unbekannte Aktion`, Fehler beim Sheet → `Serverfehler, …` (im Log nur der Fehlertyp).
- `GET` liefert nur einen kurzen Text ohne Daten.
- Codes stehen nie in URLs und werden nie geloggt (einzige Ausnahme: einmal beim Anlegen, siehe unten).

## Eintragen (Task 5, 2026-11-08)
Alle drei Aktionen brauchen einen gültigen Code, schreiben unter `LockService.getScriptLock()` (`tryLock` 10 s, sonst „Gerade trägt jemand anderes ein …“) und antworten mit `{ok: true, name, id?, hinweise, uebersicht}` (frische `uebersicht`-Daten, die App muss nicht neu laden). `Wer` ist immer der Name aus dem Code.
- `buchen` `{art, standort, nachStandort?, flaschen, datum, kommentar?, bestaetigt?, anfrageId?}`
  - Art: Inventur, Abfüllung, Umlagerung, Promo, Eigenverbrauch, Bruch (Storno nur über `stornieren`). Standort aus den Einstellungen, Abfüllung ohne Standort → Hauptlager (erster Standort). Umlagerung: Nach-Standort aus den Einstellungen und ≠ Standort.
  - Flaschen ganze Zahl 1–50.000 (Inventur 0–50.000). Datum `JJJJ-MM-TT`, höchstens heute (seit 2026-11-08, keine Zukunftsbuchungen), höchstens 400 Tage zurück (Berlin). Kommentar ≤ 200 Zeichen, Steuerzeichen werden zu Leerzeichen.
  - Würde ein betroffener Standort mit Inventur (bei Umlagerung der Ausgangsstandort) ins Minus rutschen: nichts geschrieben, Antwort `{ok: false, brauchtBestaetigung: true, warnung}`. Mit `bestaetigt: true` nochmal schicken.
  - Eine Zeile A–J per `setValues` hinter die letzte Zeile mit Inhalt (Zeilen nur mit Auswahllisten zählen als leer; ist das Blatt voll, kommen Zeilen dazu). Erst Zahlenformate, dann die Werte; steht in der Zielzeile schon etwas (auch eine Formel), wird nichts geschrieben. Datum und „Erfasst am“ als echte Datumswerte, ID `L<Zeitstempel>-<4 Zeichen>` (mit `anfrageId`: feste ID `LA-<20 Hex>`, siehe Doppelklick-Schutz).
  - Abfüllung: zusätzlich eine Zeile in `Abfüllungen`: A „N. Abfüllung“ (höchste nicht stornierte Nummer + 1), B 1. des Monats (Format `MM.yyyy`), C Flaschen, D `SATE-App, <Wer>, <Datum>, ID <id>` (die ID verbindet die Zeile mit dem Lager-Log). Steht dort schon eine Zeile mit dieser ID, wird keine zweite angehängt (Hinweis). `Übersicht!B8` (`=SUM('Abfüllungen'!C2:C)`) nimmt neue Zeilen automatisch mit.
- `stornieren` `{id, bestaetigt?, anfrageId?}`: hängt eine Storno-Zeile an (Datum heute, Standort des Originals, C „Storno“, G Beschreibung des Originals, J = id). Nicht erlaubt: unbekannte ID, Storno-Zeile, schon storniert, ID mehrfach. Abfüllung: zusätzlich Gegenzeile „Storno N. Abfüllung“ mit negativen Flaschen in `Abfüllungen` (nichts wird gelöscht, B8 stimmt damit wieder, die Nummer wird wieder frei). Fehlt die passende App-Zeile, kommt ein Hinweis, dass Mark dort von Hand korrigieren muss.
- `verkaufStandort` `{rechnung, standort, bestaetigt?, anfrageId?}`: setzt Spalte L aller Zeilen in `Verkäufe` mit genau dieser Rechnungsnummer in J; `standort` leer = zurück auf Standard (Regel 1). Nur Spalte L, A–K nie. Die Zellen werden einzeln geschrieben; scheitert eine, kommen die schon geschriebenen auf ihren alten Wert zurück (best effort) und die Antwort ist „Speichern hat nicht geklappt, nichts geändert …“ bzw., wenn auch das Zurücksetzen scheitert, „… nur teilweise geklappt, bitte Mark Bescheid geben (Rechnung …)“. Tab Lager nur nach Erfolg.
- Negativ-Warnung gilt auch für `stornieren` und `verkaufStandort` (alle Standorte mit Inventur): ohne `bestaetigt: true` nichts geschrieben, Antwort `brauchtBestaetigung`.
- Doppelklick-Schutz: `anfrageId` (8–64 Zeichen `A–Z a–z 0–9 _ -`, sonst `Ungültige Anfrage`). Gleiche ID derselben Person schreibt nicht nochmal, sondern liefert Erfolg mit derselben ID (`wiederholt: true`) und frischer Übersicht. Schneller Weg: CacheService (10 Minuten, vorherige Antwort). Sicherer Weg (seit 2026-11-08, auch ohne Cache): bei `buchen` und `stornieren` ist die Lager-Log-ID fest `LA-` + 20 Hex-Zeichen aus SHA-256 über Aktion, Name und `anfrageId`; steht sie unter der Sperre schon im Lager-Log, wird nichts geschrieben. Warnungen und Fehler werden nicht gemerkt.
- Alle Texte gegen Formel-Injektion: beginnt ein Text mit `=`, `+`, `-`, `@`, Tab, Zeilenumbruch oder einer Ziffer, wird ein `'` vorangestellt (Sheets speichert dann reinen Text).
- Danach wird `Lager!B2:F5` neu geschrieben. Klappt das (oder die Abfüllungen-Zeile) nicht, bleibt die Buchung stehen und es kommt ein Hinweis.
- Fehler sind kurze deutsche Texte (z. B. „Flaschen: bitte eine ganze Zahl von 1 bis 50.000“, „Eintrag ist schon storniert“, „Rechnung nicht gefunden“), nie interne Details.

## Fachregeln (Mark, 2026-11-08)
Tabs: `Verkäufe` (A–K schreibt die Belege-Kette, nie anfassen; L = Standort), `Lager-Log`, `App-Einstellungen` (nach Text in Spalte A gelesen), `Abfüllungen`, `Übersicht` (nur lesen), `Lager` (das Skript schreibt nur B2:F5).
1. Standort eines Verkaufs: Spalte L, sonst Kanal Berlin → „Standort für Kanal Berlin“, sonst „Standort für Verkäufe“.
2. Lagerdatum: Rechnungsdatum (B). Kunde enthält „Dörflinger“ → letzter Tag des Vormonats (die Rechnung deckt den Vormonat). Ohne B (Altliste) → letzter Tag des Monats aus A.
3. Bestand = letzte Inventur (Ende des Inventurtags) + Zugänge − Abgänge mit Datum **nach** dem Inventurtag. Mehrere Inventuren am selben Tag: die zuletzt erfasste („Erfasst am“, sonst Zeilenreihenfolge). Ohne Inventur: `null`.
   - Seit 2026-11-08: Lager-Log-Zeilen (auch Inventuren) und Verkäufe mit (Lager)datum **nach heute** (Berlin) zählen noch nicht (auch Storno-Zeilen), dazu ein Hinweis. Altzeilen ohne Rechnungsdatum erst, wenn ihr Monat nach dem laufenden liegt.
4. Storno: Art „Storno“ mit „Storno von“ = ID nimmt die Zeile heraus; unbekannte ID → Hinweis.
5. Schwund = Soll (aus der vorigen Inventur) − gezählt; bei der ersten Inventur `null`.
6. Gesamtbestand: alle Standorte gezählt → Summe, sonst `Übersicht!B10` (Quelle `rechnerisch`).
7. Ø = Flaschen der letzten N **vollen** Monate / N (N aus den Einstellungen, Monat = Rechnungsmonat). Reichweite = (Gesamt − Mindestbestand) / Ø, leer am = heute + Reichweite (Monat = 365,25/12 Tage), spätestens bestellen = leer am − Vorlauf (Monate) − Puffer (Wochen). Vorbei → „jetzt bestellen“, ≤ 30 Tage → „bald“, sonst „ok“.
   - Unterschied zu `Übersicht!B12`: Dort zählen 12 Monate **inklusive** des laufenden Monats (`>= EDATE(letzter Monat; −11)`, geteilt durch 12).
8. Auswertung pro Monat, Kanal (Unbekanntes → „Sonstiges“) und Top-10-Kunden; gleiche Namen (Groß/klein, Leerzeichen egal) werden zusammengefasst.

## Tab Lager und täglicher Trigger
- `lagerTabSchreiben()` schreibt `Lager!B2:F5` (Bestand, Kisten, letzte Inventur als Datum bzw. „noch keine“, Schwund, Stand = jetzt). Die Zeilen ordnet Spalte A2:A5 zu (Standortnamen, „Summe“).
- `taeglich()` ruft das auf. `triggerEinrichten()` legt den Trigger täglich 7–8 Uhr an und löscht erst danach ältere `taeglich`-Trigger.
- Wegen des neuen Scopes `script.scriptapp` muss Mark im Editor einmal eine Funktion ausführen (z. B. `triggerEinrichten`) und die Berechtigungen freigeben. Bis dahin antwortet die Web-App nicht.

## Zugangscodes
- Pro Person ein zufälliger Code aus 12 Zeichen (Großbuchstaben und Ziffern ohne 0/O/1/I/L, ≈ 59 Bit), angezeigt als `ABCD-EFGH-JKMN`. Groß-/Kleinschreibung, Leerzeichen und Striche sind beim Eintippen egal.
- Gespeichert wird nur ein gesalzener SHA-256-Hash in den Skripteigenschaften (`CODE:<Name>` → `{hash, gesperrt, angelegt}`). Das Salz (`CODE_SALZ`) entsteht beim ersten `codeAnlegen` zufällig. **Salz nie ändern oder löschen**, sonst gelten alle Codes nicht mehr.
- Zufall: SHA-256 über `Utilities.getUuid()` (zufällige UUIDs), gleichverteilt aufs Alphabet abgebildet.

So legt Mark einen Code an (Apps-Script-Editor, `clasp open-script` oder script.google.com):
1. Für das Team gibt es fertige Knöpfe in `Api.js`: `codeAnlegenMark`, `codeAnlegenJonas`, `codeAnlegenDave`, `codeAnlegenJan`, `codeAnlegenPaul` (oben im Editor auswählen, „Ausführen“). Für andere Namen eine Hilfsfunktion wie `function aufruf() { codeAnlegen('Laura'); }` in `Api.js` ergänzen und pushen (Dateien, die nur im Editor angelegt werden, überschreibt `clasp push`).
2. Nach dem Ausführen steht im Ausführungsprotokoll einmal `Zugangscode für Jonas: ABCD-EFGH-JKMN`. Code persönlich weitergeben, nicht in Gruppen posten.

- **Neuer Code** für dieselbe Person: wieder `codeAnlegen('Jonas')`, der alte gilt sofort nicht mehr.
- **Sperren:** `codeSperren('Jonas')`. Die App meldet beim nächsten Laden „Code gilt nicht“ und meldet ab.
- **Übersicht:** `codesAnzeigen()` loggt nur Namen und Status (aktiv/gesperrt seit), keine Codes und keine Hashes.
- Achtung: Das Ausführungsprotokoll (und ggf. die „Ausführungen“-Liste) zeigt den Code beim Anlegen. Wer Zugriff aufs Skriptprojekt hat, kann ihn dort lesen, also nur Mark.

## Einrichten
1. `npm test` (Node ≥ 20, keine Abhängigkeiten).
2. `cp api/Lokal.example.js api/src/Lokal.js` und die Sheet-ID von „SATE Verkäufe“ eintragen (steht in der Sheet-URL).
3. `clasp push --force` (lädt alles aus `api/src` hoch, auch `Lokal.js`).
4. Im Editor einmal `einrichten` ausführen und die Berechtigung „Tabellen ansehen“ freigeben. Im Log steht danach `Übersicht!B10 … = <Bestand>`.
5. Zugangscodes anlegen (siehe oben).

## Bereitstellen (erst nach Marks OK)
Stand 2026-11-08: Web-App bereitgestellt (URL in `docs/config.js`), Repo `SATE-UG/sate-app` auf GitHub. Updates mit `clasp create-deployment -i <deploymentId> -d "…"` (gleiche URL).
1. Web-App bereitstellen: `clasp create-deployment --description "…"` (oder im Editor „Bereitstellen → Neue Bereitstellung → Web-App“). Ausführen als: ich (mark.reimer@trinksate.de), Zugriff: jeder (auch anonym), wie im Manifest. Die URL endet auf `/exec`.
   - Danach Code-Änderungen: `clasp push --force` und die **bestehende** Bereitstellung aktualisieren (`clasp update-deployment <deploymentId>` bzw. im Editor „Bereitstellungen verwalten → Bearbeiten → Neue Version“), damit die URL gleich bleibt.
   - Hinweis: Lässt die Google-Workspace-Verwaltung von trinksate.de anonymen Zugriff nicht zu, bietet der Editor „jeder“ nicht an. Dann im Admin-Bereich prüfen.
2. Die URL in `docs/config.js` bei `apiUrl` eintragen und `VERSION` in `docs/sw.js` hochzählen.
3. GitHub-Repo anlegen, pushen, unter Settings → Pages „Deploy from a branch“, Branch `main`, Ordner `/docs`.
4. iPhone: Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“. Danach startet „SATE“ wie eine App.

## Lokal anschauen
`python3 -m http.server 8000 --directory docs` und http://localhost:8000 öffnen. Ohne eingetragene Web-App-URL meldet die App „noch nicht fertig eingerichtet“.

## PWA-Details
- Ablauf: erster Start → „Dein Zugangscode“ → Aktion `uebersicht` → Code in `localStorage` (nur bei Erfolg; geht `localStorage` nicht, z. B. im privaten Modus, gilt der Code nur bis zum Schließen). Oben Logo und runder „Neu laden“-Knopf, darunter die Stand-Zeit; unten vier Reiter mit Symbol (gewählter weiß, Ansicht wird gemerkt):
  - **Übersicht:** Bestell-Karte (Pille „Alles gut“ / „Bald bestellen“ / „Jetzt bestellen“, „spätestens bestellen bis“ groß, „leer etwa am“, Balken Reichweite 0–12 Monate mit Strich bei Vorlauf + Puffer), Kacheln Bestand („aus Inventur“/„rechnerisch“), Kisten, Reichweite, Ø pro Monat, Standorte mit Anteils-Balken bzw. „noch keine Inventur“, Hinweise der Schnittstelle, „Abmelden“ (mit Rückfrage).
  - **Verkäufe:** Balkendiagramm der 13 Monate als eigenes SVG in einer Karte (Flaschen/Umsatz umschaltbar, Monat antippen zeigt die Zahlen oben und färbt den Balken gelb, vorgewählt ist der letzte volle Monat, laufender Monat gestrichelt), darunter Summen-Kacheln, Kanäle mit Anteils-Balken und Top 10 Kunden für „Dieses Jahr“, „Vorjahr“ oder „Gesamt“.
  - **Lager:** Karte pro Standort (Bestand, Kisten, letzte Inventur, Schwund bzw. „noch keine Inventur“), Verlauf mit Symbol je Art (Aktion `verlauf`, „Storno“ mit Rückfrage), „Verkäufe zuordnen“ (Rechnungen der letzten 60 Tage, Standort per Auswahl, Aktion `verkaufStandort`).
  - **Eintragen:** Art als Kacheln mit Symbol und kurzer Erklärung, Standort (bei Umlagerung „von“/„nach“), Kisten × Flaschen pro Kiste + einzelne Flaschen (Summe darunter), Datum (Standard heute, höchstens heute), Kommentar. Prüft vor dem Senden wie die Schnittstelle.
- Schreiben: `anfrageId` pro Formular-Entwurf (bleibt bei erneutem Tippen nach Zeitüberschreitung gleich, damit nichts doppelt landet). Will der Server ein „trotzdem“ (`brauchtBestaetigung`), kommt seine Warnung als Rückfrage, bei Ja dieselbe Anfrage mit `bestaetigt: true`. Die frische Übersicht aus der Antwort wird übernommen, Rückmeldung als kurzer Hinweis über der Leiste.
- Die letzte Übersicht liegt in `localStorage` (`sate.uebersicht`) und erscheint beim Start sofort („Gespeicherter Stand von …, lädt neu …“). Abmelden löscht Code, gespeicherte Übersicht und gemerkte Ansicht, leert das Eintragen-Formular samt `anfrageId` und schließt offene Rückfragen und Hinweise. Antworten, die nach dem Abmelden oder während einer Schreib-Aktion ankommen, werden verworfen (Wettläufe).
- Bei Netzfehlern bleiben Code und Daten gespeichert, bei „Code ungültig“ wird beides gelöscht.
- `sw.js` cacht die App-Hülle (Cache `sate-huelle-<VERSION>`); Anfragen an die Schnittstelle (POST, fremder Host) gehen immer übers Netz. **Nach jeder Änderung in `docs/` die `VERSION` in `sw.js` hochzählen**, sonst zeigen installierte iPhones die alte Fassung.
- **Komfort (seit v9, Task 15, 2026-11-08):**
  - **Wischen zwischen den Reitern (seit v11, 2026-11-08, vorher eigene JS-Geste):** natives waagerechtes Scrollen mit CSS Scroll Snap. Die vier Ansichten liegen nebeneinander in `#ansichten` (`overflow-x: auto`, `scroll-snap-type: x mandatory`, `overscroll-behavior-x: contain`, kein Scrollbalken); jede Ansicht ist eine volle Seite (`scroll-snap-align: start`, `scroll-snap-stop: always`) und scrollt senkrecht für sich (eigenes iOS-Momentum und Gummiband, eigene Scroll-Position je Reiter). Kopf mit Stand-Zeile, Offline-Banner und Fehler steht oben fest, die Tab-Bar unten (Inhalt läuft unter ihr durch). Angemeldet ist die Seite selbst eine feste Hülle (`100dvh`, `overflow: hidden`).
    - Tab-Bar antippen → `scrollTo` weich (bei „Bewegung reduzieren“ springen); den schon gewählten Reiter nochmal antippen → Ansicht nach oben. Beim Scrollen markiert die Tab-Bar schon die überwiegend sichtbare Ansicht (`H.reiterPosition`); übernommen (gemerkt, andere Ansichten `inert`, im Lager Verlauf laden, VoiceOver-Ansage „Verkäufe, Reiter 2 von 4“ nur nach Wischen) wird sie erst, wenn sie eingerastet steht (`scrollend`, sonst 150 ms Ruhe).
    - Start, Anmelden, Drehen/andere Breite: ohne Animation direkt auf den gemerkten Reiter (kein Durchrutschen).
    - Diagramm: `touch-action: manipulation`, Monat antippen bleibt Tippen, waagerecht scrollt die Leiste. Formularfelder und Auswahllisten normal bedienbar.
  - **Ziehen zum Aktualisieren:** in einer Ansicht ganz oben nach unten ziehen (Schwelle 70 px nach `H.gummiband`, Pfeil dreht sich, dann Kreisel), gleiche Funktion wie der Neu-laden-Knopf (`S.aktualisieren`). Bezogen auf `scrollTop` der Ansicht; den Inhalt bewegt nur das native iOS-Gummiband, `gesten.js` misst nur den Fingerweg (passive Listener, kein `preventDefault`). Nicht, wenn die Ansicht gescrollt ist, ein Eingabefeld den Fokus hat, eine Rückfrage offen ist oder die Leiste waagerecht unterwegs ist.
  - **Kein Zoomen (Mark, 2026-11-08):** Viewport `maximum-scale=1, user-scalable=no`, die Safari-Gesten `gesturestart/-change/-end` werden abgefangen (einzige nicht passive Listener), `touch-action: pan-x pan-y` auf Seite, Leiste und Ansichten (gilt nur bis zum nächsten Scroll-Container, deshalb mehrfach) und `manipulation` auf Bedienelementen gegen Doppeltipp-Zoom. Eingabefelder ≥ 16 px Schrift (sonst zoomt iOS beim Fokus). Die Systemschriftgröße (Textgröße in den iOS-Einstellungen) bleibt unberührt.
  - **Automatisches Update (`update.js`):** Übernimmt ein neuer Service Worker, lädt die App selbst neu, aber nur ohne ungespeicherte Eingaben im Formular, ohne offene Rückfrage und ohne laufendes Speichern; sonst Banner „Neue Version – tippen zum Laden“ (beim Zurückkehren in die App mit leerem Formular lädt sie dann selbst). Pro Version höchstens einmal (Version fragt die App beim Service Worker ab, Merker in `sessionStorage`), keine Schleife. Beim Start und beim Zurückkehren in die App (höchstens einmal pro Minute) `registration.update()`. **Gilt ab v9:** Wer noch v8 installiert hat, bekommt v9 einmal wie bisher (App einmal schließen und neu öffnen); ab dann kommen Updates automatisch.
  - **Trends** (`H.monatsTrend`): In Verkäufe unter dem gewählten Monat „±x % zum Vormonat“ und „zum Vorjahresmonat“, nur wenn der Vergleichswert > 0 ist; der laufende Monat heißt „bisher“ und wird nicht verglichen. Übersicht: Karte „Letzter voller Monat“ mit Flaschen und Trend (antippen öffnet Verkäufe). Pfeil plus Vorzeichen, Grün/Rot nur auf Pfeil und Zahl (Kontrast ≥ 6:1). **Grenze:** `verkaeufe.monate` hat nur 13 Monate, der Vorjahresmonat eines vollen Monats steht darin nie; gezeigt wird deshalb derzeit nur der Vormonat. Liefert die Schnittstelle später mehr Monate (z. B. 25), erscheint der Vorjahresvergleich ohne App-Änderung.
  - **Offline-Banner** „Offline – zeigt gespeicherten Stand“, wenn das Gerät offline ist oder der letzte Abruf an fehlender Verbindung scheiterte (Zeitüberschreitung zählt nicht); verschwindet beim nächsten erfolgreichen Abruf, bei wiederkehrendem Netz lädt die App selbst neu.
  - **Stand-Zeit relativ** („Aktualisiert gerade eben / vor 5 Min. / vor 2 Std.“, sonst Datum, `H.relativZeit`), läuft jede Minute mit; bewusst keine Live-Region (VoiceOver bekommt nach dem Neuladen „Aktualisiert.“ angesagt).
  - **Tipp-Rückmeldung:** Knöpfe, Art-Kacheln, Tabs, Segmente leicht kleiner/heller beim Tippen (100 ms), kein grauer Tipp-Kasten, keine Textauswahl auf Bedienelementen.
- Keine fremden Bibliotheken, kein CDN. Content-Security-Policy erlaubt nur eigene Dateien und Verbindungen zu `script.google.com`/`script.googleusercontent.com`.
- Abstände für Notch und Home-Leiste (`viewport-fit=cover`, `env(safe-area-inset-*)`, Statusleiste `black-translucent`).

## Branding (seit 2026-11-08, überarbeitet 2026-11-08 in Task 14)
Ziel (Mark): professionell und aufgeräumt wie eine iOS-Finanz-App, aber klar SATE.
- **Marke:** schwarzer Grund, weiß, Logo (Männchen + „SATE“) oben links bzw. groß auf der Anmeldeseite, „Trink SATE!“ mit Herz unten, Doppelpfeil im Anmelde-Knopf. `theme_color`/`background_color` schwarz.
- **Schrift:** Fließtext, Zahlen und Bedienelemente in der iOS-Systemschrift (`-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`), Zahlen mit `tabular-nums`. Courier New nur als Marken-Akzent: Seiten- und Abschnitts-Überschriften im Slide-Stil („**Hallo** Mark“, „**Standorte**“) und die Fußzeile.
- **Farben:** Karten `#1C1C1E`, Eingaben/Knöpfe `#2C2C2E`, Trennlinien `rgba(255,255,255,.08)`, Nebentext `#98989F`. Eine Akzentfarbe `#E8C547` (warmes Gelb wie der Secco) nur für „bald/jetzt bestellen“, gewählte Elemente (Art-Kachel, Diagramm-Monat, Fokus) und den Erfolgs-Haken. Rot `#FF8F85` nur für Fehler und Storno. Kontraste nach WCAG AA gerechnet (stehen oben in `style.css`).
- **Formen:** Karten mit 16 px Radius, Knöpfe 12 px (Primär weiß mit schwarzer Schrift, sonst grau), Eingaben grau gefüllt ≥ 48 px hoch und ≥ 16 px Schrift, Segmented Control als Pille, Reiterleiste unten durchscheinend (`backdrop-filter`) mit Symbol + Text. Symbole selbst gezeichnet als Inline-SVG (Reiter in `index.html`, übrige in `kern.js` unter `S.ICONS`), keine Bibliothek.
- **Feinschliff:** Skeleton beim ersten Laden, Kreisel in der Stand-Zeile und im Neu-laden-Knopf, Toast mit Haken bzw. Ausrufezeichen, freundliche leere Zustände, kurze Übergänge (abgeschaltet bei `prefers-reduced-motion`).

Bilder neu erzeugen (Originale im Crawler-Repo `assets/`, werden nur gelesen):
```
osascript -l JavaScript werkzeuge/bilder.js ~/GitHub/sate-eventcrawler-muc/assets "$PWD/docs"
```
Das schneidet die Originale auf den sichtbaren Bereich zu (wie `_load_asset` im Crawler) und schreibt Größen für 3×-Retina: `bilder/logo.png` (120 px hoch), `flasche.png` (108), `herz.png` (72), `pfeil.png` (60), Icons 180/192/512 (Strichmännchen weiß auf Schwarz, 70 % breit, deckend). Danach `VERSION` in `docs/sw.js` hochzählen.

## Sicherheitsregeln
- **Nichts Geheimes ins Repo** (wird öffentlich): keine Sheet-ID, keine Codes, keine Schlüssel. Die Sheet-ID steht nur in `api/src/Lokal.js`. Vor jedem Commit: `npm test` (prüft, dass die ID aus `Lokal.js` in keiner Git-Datei steht) bzw. `git grep <Sheet-ID>`.
- Die Web-App läuft als Mark. Sie schreibt nur nach gültigem Code und nur wie unter „Eintragen“ beschrieben (Lager-Log und Abfüllungen anhängen, Verkäufe Spalte L, `Lager!B2:F5`), nie die Spalten A–K im Tab Verkäufe. Die Google-Attrappen in `test/google.js` werfen bei jedem anderen Schreibversuch.
- Codes nur persönlich weitergeben. Verloren oder Person nicht mehr im Team: `codeSperren`.
- Bekannte Grenze (Codex-Review 2026-11-08): Fehlversuche werden nicht gedrosselt. Erraten ist bei ≈ 59 Bit praktisch ausgeschlossen, aber massenhafte Anfragen an die öffentliche URL könnten die Apps-Script-Kontingente aufbrauchen. Eine Drosselung im Skript hilft dagegen kaum (die Anfrage läuft trotzdem); bei Bedarf neue Bereitstellung = neue URL.
- Nicht automatisch getestet: `kern.js`, `ansichten.js`, `eintragen.js`, `app.js`, `gesten.js` und `sw.js` im Browser (Scroll Snap, Ziehen und Zoom-Sperre wurden 2026-11-08 im Desktop-Browser mit Handy-Größe und der Attrappe geprüft, das Gefühl auf dem iPhone nicht) (`update.js` hat einen Test mit Schein-Service-Worker) (Task 6 wurde von Hand mit einer lokalen Attrappe der Schnittstelle geprüft, nicht im Repo), der echte POST/Redirect zu Apps Script und das Verhalten auf dem iPhone.
