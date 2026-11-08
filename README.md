# SATE-App

App fürs SATE-Team (5 Leute, alle iPhone). Stand 2026-11-08: Mini-Version für den ersten iPhone-Test. Nach dem Zugangscode zeigt sie „Hallo <Name>“, den rechnerischen Bestand in Flaschen und die Reichweite in Monaten aus dem Google Sheet „SATE Verkäufe“ (Tab `Übersicht`, Zellen B10 und B13). Seit Task 4 (2026-11-08) rechnet die Schnittstelle zusätzlich Bestand pro Standort, Bestellstatus und Verkäufe-Auswertung (Aktion `uebersicht`, siehe unten); die PWA zeigt das erst ab Task 6. Lager-Eingaben kommen später.

Entschieden (Mark, 2026-11-08):
- **Oberfläche als PWA** in `docs/`, später über GitHub Pages aus `/docs`. Das Repo wird dafür **öffentlich**, deshalb steht nichts Geheimes im Git.
- **Daten über eine Apps-Script-Web-App** in `api/` im Konto mark.reimer@trinksate.de. Scope `spreadsheets` (`SpreadsheetApp.openById` verlangt den vollen Scope, auch nur zum Lesen; später schreibt die App ins Lager-Log) und seit Task 4 `script.scriptapp` (für den täglichen Trigger). Die Web-App liest nur; geschrieben wird nur `Lager!B2:F5` (täglich bzw. per `lagerTabSchreiben`).
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
| `api/src/Api.js` | `doGet`, `doPost`, `einrichten`, `codeAnlegen`, `codeSperren`, `codesAnzeigen`, `lagerTabSchreiben`, `taeglich`, `triggerEinrichten` und die Google-Anbindung (jeder Tab einmal per `getValues`) |
| `api/src/Lokal.js` | **Nicht im Git** (`.gitignore`), wird aber mit `clasp push` hochgeladen: Sheet-ID |
| `api/Lokal.example.js` | Vorlage für `Lokal.js` |
| `.clasp.json` | Skriptprojekt „SATE-App“, `rootDir: api/src` |
| `docs/` | PWA: `index.html`, `app.js`, `hilfen.js` (reine Hilfen, getestet), `style.css`, `config.js` (Web-App-URL), `manifest.webmanifest`, `sw.js`, `icons/`, `bilder/` (Logo, Flasche, Herz, Doppelpfeil) |
| `werkzeuge/bilder.js` | Erzeugt App-Icons und `docs/bilder/` aus den SATE-Originalen mit macOS-Bordmitteln |
| `test/` | Node-Tests (`npm test`), Google-Attrappen in `test/google.js`, erfundene Testdaten in `test/daten.js` (**nie echte Verkaufsdaten**, das Repo ist öffentlich) |

## Schnittstelle
- `POST` an die Web-App-URL (`…/exec`), Body JSON `{"code": "ABCD-EFGH-JKMN", "aktion": "ping"}`, `Content-Type: text/plain` (dann schickt der Browser keinen CORS-Preflight, den Apps Script nicht beantwortet).
- `ping` → `{"ok": true, "name": "Jonas", "bestand": 8041, "reichweite": 7.3, "zeit": "2026-11-08T15:05:00.000Z"}`. Leere oder unlesbare Zellen kommen als `null`.
- `uebersicht` → `{ok, name, stand, heute, kennzahlen, bestellung, lager, verkaeufe, abfuellungen, hinweise}` (rund 4 KB):
  - `kennzahlen`: `abgefuellt`, `verkauft`, `bestandRechnerisch` (Übersicht B8–B10), `gesamtbestand` mit `gesamtQuelle` (`inventur` oder `rechnerisch`), `bestandGezaehlt` (Summe der gezählten Standorte), `kisten`, `abverkaufProMonat` mit `abverkaufVon`/`abverkaufBis`, `mindestbestand`, `flaschenProKiste`.
  - `bestellung`: `reichweite` (Monate), `leerAm`, `spaetestensBestellen` (`JJJJ-MM-TT`), `status` (`ok` | `bald` | `jetzt bestellen` | `null`), `vorlaufMonate`, `pufferWochen`.
  - `lager`: pro Standort `{standort, bestand, kisten, letzteInventur, schwund}` (`null` = noch keine Inventur).
  - `verkaeufe`: `monate` (13 Monate inkl. laufendem: `{monat, flaschen, umsatz}`), `letzte12` (12 volle Monate) und `jahr` (Januar bis laufender Monat), je `{von, bis, flaschen, umsatz, kanaele, kunden}` (Top 10).
  - `hinweise`: höchstens 20 Texte (z. B. „Noch keine Inventur …“, kaputte Lager-Log-Zeilen, Storno auf unbekannte ID).
- Falscher oder gesperrter Code → `{"ok": false, "fehler": "Code ungültig"}`. Das Sheet wird erst nach gültigem Code gelesen.
- Kaputte Anfrage → `Ungültige Anfrage`, andere Aktion → `Unbekannte Aktion`, Fehler beim Sheet → `Serverfehler, …` (im Log nur der Fehlertyp).
- `GET` liefert nur einen kurzen Text ohne Daten.
- Codes stehen nie in URLs und werden nie geloggt (einzige Ausnahme: einmal beim Anlegen, siehe unten).

## Fachregeln (Mark, 2026-11-08)
Tabs: `Verkäufe` (A–K schreibt die Belege-Kette, nie anfassen; L = Standort), `Lager-Log`, `App-Einstellungen` (nach Text in Spalte A gelesen), `Abfüllungen`, `Übersicht` (nur lesen), `Lager` (das Skript schreibt nur B2:F5).
1. Standort eines Verkaufs: Spalte L, sonst Kanal Berlin → „Standort für Kanal Berlin“, sonst „Standort für Verkäufe“.
2. Lagerdatum: Rechnungsdatum (B). Kunde enthält „Dörflinger“ → letzter Tag des Vormonats (die Rechnung deckt den Vormonat). Ohne B (Altliste) → letzter Tag des Monats aus A.
3. Bestand = letzte Inventur (Ende des Inventurtags) + Zugänge − Abgänge mit Datum **nach** dem Inventurtag. Mehrere Inventuren am selben Tag: die zuletzt erfasste („Erfasst am“, sonst Zeilenreihenfolge). Ohne Inventur: `null`.
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
- Ablauf: erster Start → „Dein Zugangscode“ → `ping` → Code in `localStorage` (nur bei Erfolg; geht `localStorage` nicht, z. B. im privaten Modus, gilt der Code nur bis zum Schließen). Danach „Hallo <Name>“, Bestand (z. B. 8.041 Flaschen), Reichweite (z. B. 7,3 Monate), Stand. Knöpfe „Neu laden“ und „Abmelden“ (löscht den gespeicherten Code).
- Bei Netzfehlern bleibt der Code gespeichert, bei „Code ungültig“ wird er gelöscht.
- `sw.js` cacht die App-Hülle (Cache `sate-huelle-<VERSION>`); Anfragen an die Schnittstelle (POST, fremder Host) gehen immer übers Netz. **Nach jeder Änderung in `docs/` die `VERSION` in `sw.js` hochzählen**, sonst zeigen installierte iPhones die alte Fassung.
- Keine fremden Bibliotheken, kein CDN. Content-Security-Policy erlaubt nur eigene Dateien und Verbindungen zu `script.google.com`/`script.googleusercontent.com`.
- Abstände für Notch und Home-Leiste (`viewport-fit=cover`, `env(safe-area-inset-*)`, Statusleiste `black-translucent`).

## Branding (seit 2026-11-08)
Look wie die Event-Slides des Crawlers (`sate-eventcrawler-muc/examples/`): immer schwarz, weiße Schrift, keine Farben, Schrift Courier New (Systemschrift, auch auf dem iPhone). Oben links Logo (Männchen + „SATE“), Überschrift „**Hallo** Name“ (fett + normal wie „**Freitag** Events“), SATE-Flasche als Aufzählungszeichen, unten „Trink SATE!“ mit Herz, Knöpfe weiß umrandet, Doppelpfeil im Anmelde-Knopf. `theme_color`/`background_color` schwarz.

Bilder neu erzeugen (Originale im Crawler-Repo `assets/`, werden nur gelesen):
```
osascript -l JavaScript werkzeuge/bilder.js ~/GitHub/sate-eventcrawler-muc/assets "$PWD/docs"
```
Das schneidet die Originale auf den sichtbaren Bereich zu (wie `_load_asset` im Crawler) und schreibt Größen für 3×-Retina: `bilder/logo.png` (120 px hoch), `flasche.png` (108), `herz.png` (72), `pfeil.png` (60), Icons 180/192/512 (Strichmännchen weiß auf Schwarz, 70 % breit, deckend). Danach `VERSION` in `docs/sw.js` hochzählen.

## Sicherheitsregeln
- **Nichts Geheimes ins Repo** (wird öffentlich): keine Sheet-ID, keine Codes, keine Schlüssel. Die Sheet-ID steht nur in `api/src/Lokal.js`. Vor jedem Commit: `npm test` (prüft, dass die ID aus `Lokal.js` in keiner Git-Datei steht) bzw. `git grep <Sheet-ID>`.
- Die Web-App läuft als Mark und liest nur. Geschrieben wird nur `Lager!B2:F5` (Trigger bzw. Editor), nie die Spalten A–K im Tab Verkäufe.
- Codes nur persönlich weitergeben. Verloren oder Person nicht mehr im Team: `codeSperren`.
- Bekannte Grenze (Codex-Review 2026-11-08): Fehlversuche werden nicht gedrosselt. Erraten ist bei ≈ 59 Bit praktisch ausgeschlossen, aber massenhafte Anfragen an die öffentliche URL könnten die Apps-Script-Kontingente aufbrauchen. Eine Drosselung im Skript hilft dagegen kaum (die Anfrage läuft trotzdem); bei Bedarf neue Bereitstellung = neue URL.
- Nicht automatisch getestet: `app.js` und `sw.js` im Browser, der echte POST/Redirect zu Apps Script und das Verhalten auf dem iPhone. Das kommt mit dem iPhone-Test nach dem Bereitstellen.
