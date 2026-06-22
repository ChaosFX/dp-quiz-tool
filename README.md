# DP-Quiz-Tool

Lokales Lernwerkzeug zur Vorbereitung auf die elektronische Dienstprüfung
(BFA Kurs A2/v2, Prüfungstermin **05.08.2026**). Reines Vanilla
HTML/CSS/JS, kein Build-Schritt, Daten im Browser-`localStorage`.

Drei Module über eine zentrale Landing Page:
- **MC-Quiz** — Multiple-Choice-Fragen aus `data/quiz/`
- **Karteikarten** — Active Recall aus den Obsidian-Kontrollfragen (`data/karteikarten/`)
- **Nachschlagewerk** — Platzhalter, Phase 2/3 (siehe `KONZEPT.md`)

Das maßgebliche Konzept steht in [`KONZEPT.md`](KONZEPT.md).

---

## Lokal starten

Das Tool lädt JSON-Dateien per `fetch()`. Das funktioniert **nicht** beim
direkten Öffnen von `index.html` per Doppelklick (`file://` blockiert
`fetch()`). Es wird ein lokaler HTTP-Server gebraucht:

```bash
# Python (überall vorhanden, kein Install nötig)
python -m http.server 8080

# oder Node.js
npx serve .
```

Dann im Browser öffnen: **http://localhost:8080**

---

## Daten pflegen

### MC-Quiz-Fragen
Fragen werden direkt in den `data/quiz/quiz_<Fach>.json`-Dateien gepflegt
(Schema siehe `KONZEPT.md` Punkt 4). Nach dem Hinzufügen einer **neuen**
Fach-Datei einmal das Manifest neu bauen, damit das Tool sie erkennt:

```bash
node tools/build-quiz-manifest.mjs
```

(Reine Inhaltsänderungen an bestehenden Dateien brauchen das nicht.)

### Karteikarten (aus dem Obsidian-Vault)
Die Karteikarten werden aus Obsidian-Notes mit einem
`## Kontrollfragen`-Abschnitt generiert. Bei neuen/geänderten
Kontrollfragen das Parsing-Skript erneut ausführen:

```bash
node tools/parse-karteikarten.mjs "<Pfad-zum-Vault>"
```

Ohne Pfad-Argument wird der im Skript gesetzte Standard-Vault verwendet.
Das Skript erzeugt:
- je Note eine JSON-Datei in `data/karteikarten/`
- `data/karteikarten/_manifest.json` (Laufzeit-Discovery)
- `data/vault/graph.json` (Wikilink-Graph, Vorgriff auf Phase 3)

---

## Online stellen: GitHub Pages

Vanilla HTML/JS ohne Build → direkt aus dem Repository deploybar.

1. Repository auf GitHub pushen
   ```bash
   git remote add origin https://github.com/<username>/dp-quiz-tool.git
   git push -u origin main
   ```
   (Für **GitHub Pages im kostenlosen Tier** muss das Repository
   **öffentlich** sein; private Repos brauchen GitHub Pro.)
2. Repo-Einstellungen → **Pages** → Source: Branch `main`, Ordner `/` (root)
3. Erreichbar unter `https://<username>.github.io/dp-quiz-tool/`

**Alternative: Netlify** — Projektordner per Drag & Drop hochladen oder
via GitHub-Sync; eigene URL wie `dp-quiz.netlify.app` inklusive.

> Alle `fetch()`-Pfade im Code sind **relativ** (`./data/quiz/...`),
> daher läuft das Tool lokal und auf GitHub Pages/Netlify ohne Anpassung.

---

## Projektstruktur

```
dp-quiz-tool/
├── index.html
├── style.css
├── script.js
├── README.md
├── KONZEPT.md
├── .gitignore
├── tools/
│   ├── parse-karteikarten.mjs    Vault → Karteikarten-JSON + graph.json
│   └── build-quiz-manifest.mjs   data/quiz/ → _manifest.json
└── data/
    ├── quiz/            MC-Quiz-Fragen (quiz_*.json) + _manifest.json
    ├── karteikarten/    Karteikarten je Note + _manifest.json
    └── vault/           graph.json (Phase 2/3)
```
