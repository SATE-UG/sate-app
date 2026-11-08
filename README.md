# SATE-App

App fürs SATE-Team (5 Leute, alle iPhone). Stand 2026-11-08: Mini-Version für den ersten iPhone-Test. Nach dem Zugangscode zeigt sie „Hallo <Name>“, den rechnerischen Bestand in Flaschen und die Reichweite in Monaten aus dem Google Sheet „SATE Verkäufe“ (Tab `Übersicht`, Zellen B10 und B13). Verkäufe, Bestand pro Standort und Lager-Eingaben kommen später.

Entschieden (Mark, 2026-11-08):
- **Oberfläche als PWA** in `docs/`, später über GitHub Pages aus `/docs`. Das Repo wird dafür **öffentlich**, deshalb steht nichts Geheimes im Git.
- **Daten über eine Apps-Script-Web-App** in `api/` im Konto mark.reimer@trinksate.de. Sie liest das Sheet nur (Scope `spreadsheets.readonly`) und ändert nichts.
- **Anmeldung per persönlichem Zugangscode** statt Google-Login.

## Aufbau
| Pfad | Inhalt |
|---|---|
| `api/src/appsscript.json` | Manifest: Europe/Berlin, V8, Web-App (`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`), nur Scope `spreadsheets.readonly` |
| `api/src/Konfig.js` | Feste Werte: Tab, Zellen, Code-Alphabet und -Länge, Namen der Skripteigenschaften, Fehlertexte |
| `api/src/Logik.js` | Reine Logik ohne Google: Code erzeugen/normalisieren, Hash, Anfrage prüfen, Zahlen lesen, Antwort bauen |
| `api/src/Api.js` | `doGet`, `doPost`, `einrichten`, `codeAnlegen`, `codeSperren`, `codesAnzeigen` und die Google-Anbindung |
| `api/src/Lokal.js` | **Nicht im Git** (`.gitignore`), wird aber mit `clasp push` hochgeladen: Sheet-ID |
| `api/Lokal.example.js` | Vorlage für `Lokal.js` |
| `.clasp.json` | Skriptprojekt „SATE-App“, `rootDir: api/src` |
| `docs/` | PWA: `index.html`, `app.js`, `hilfen.js` (reine Hilfen, getestet), `style.css`, `config.js` (Web-App-URL), `manifest.webmanifest`, `sw.js`, `icons/` |
| `werkzeuge/icons.js` | Erzeugt die vorläufigen Icons („SATE“ weiß auf dunkel) mit macOS-Bordmitteln |
| `test/` | Node-Tests (`npm test`), Google-Attrappen in `test/google.js` |

## Schnittstelle
- `POST` an die Web-App-URL (`…/exec`), Body JSON `{"code": "ABCD-EFGH-JKMN", "aktion": "ping"}`, `Content-Type: text/plain` (dann schickt der Browser keinen CORS-Preflight, den Apps Script nicht beantwortet).
- `ping` → `{"ok": true, "name": "Jonas", "bestand": 8041, "reichweite": 7.3, "zeit": "2026-11-08T15:05:00.000Z"}`. Leere oder unlesbare Zellen kommen als `null`.
- Falscher oder gesperrter Code → `{"ok": false, "fehler": "Code ungültig"}`. Das Sheet wird erst nach gültigem Code gelesen.
- Kaputte Anfrage → `Ungültige Anfrage`, andere Aktion → `Unbekannte Aktion`, Fehler beim Sheet → `Serverfehler, …` (im Log nur der Fehlertyp).
- `GET` liefert nur einen kurzen Text ohne Daten.
- Codes stehen nie in URLs und werden nie geloggt (einzige Ausnahme: einmal beim Anlegen, siehe unten).

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
**Noch nicht gemacht** (Stand 2026-11-08): kein `clasp deploy`, kein GitHub-Repo, kein Push, kein GitHub Pages.
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
- Hell/dunkel nach Systemeinstellung, Abstände für Notch und Home-Leiste (`viewport-fit=cover`, `env(safe-area-inset-*)`).
- Icons sind vorläufig (`osascript -l JavaScript werkzeuge/icons.js "$PWD/docs/icons"`). Kommt das Logo: PNGs gleicher Größe ersetzen (180, 192, 512) und `VERSION` hochzählen.

## Sicherheitsregeln
- **Nichts Geheimes ins Repo** (wird öffentlich): keine Sheet-ID, keine Codes, keine Schlüssel. Die Sheet-ID steht nur in `api/src/Lokal.js`. Vor jedem Commit: `npm test` (prüft, dass die ID aus `Lokal.js` in keiner Git-Datei steht) bzw. `git grep <Sheet-ID>`.
- Die Web-App läuft als Mark und liest nur. Sie schreibt nichts ins Sheet oder Drive.
- Codes nur persönlich weitergeben. Verloren oder Person nicht mehr im Team: `codeSperren`.
- Bekannte Grenze (Codex-Review 2026-11-08): Fehlversuche werden nicht gedrosselt. Erraten ist bei ≈ 59 Bit praktisch ausgeschlossen, aber massenhafte Anfragen an die öffentliche URL könnten die Apps-Script-Kontingente aufbrauchen. Eine Drosselung im Skript hilft dagegen kaum (die Anfrage läuft trotzdem); bei Bedarf neue Bereitstellung = neue URL.
- Nicht automatisch getestet: `app.js` und `sw.js` im Browser, der echte POST/Redirect zu Apps Script und das Verhalten auf dem iPhone. Das kommt mit dem iPhone-Test nach dem Bereitstellen.
