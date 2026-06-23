# Konzept: DP-Quiz-Tool (Dienstprüfungs-Lernwerkzeug)

> Dieses File ist der zentrale Anker für die Entwicklung mit Claude Code.
> Es beschreibt Ziel, Datenstruktur, Funktionsumfang und technische Entscheidungen,
> damit jede neue Arbeitssitzung sofort wieder weiß, was gebaut werden soll.

---

## 1. Ziel

Ein lokal lauffähiges Web-Tool zum Üben für die elektronische Dienstprüfung
(BFA Kurs A2/v2, Prüfungstermin 05.08.2026). Es liest Multiple-Choice-Fragen
aus JSON-Dateien (eine Datei pro Fach) ein, stellt sie interaktiv dar, prüft
Antworten und liefert am Ende eine Auswertung inkl. Nachbesprechung der
falsch beantworteten Fragen.

Zielgruppe: ausschließlich der Ersteller selbst (kein Multi-User-System,
kein Login, keine Cloud-Synchronisation).

---

## 2. Tech-Stack

**Vanilla HTML / CSS / JavaScript** — bewusst kein Framework.

Begründung:
- Die Kernlogik (Frage anzeigen → Antwort werten → nächste Frage → Auswertung)
  ist überschaubar und braucht kein Component-Framework.
- Kein Build-Prozess nötig — Datei im Browser öffnen reicht.
- Einfach zu debuggen und zu erweitern, auch nach längeren Pausen.
- Falls das Projekt später deutlich wächst (z. B. umfangreiches Statistik-
  Dashboard), kann jederzeit zu React migriert werden — ist für v1 aber
  bewusst nicht nötig.

**Speicherung:** Browser `localStorage` (kein Backend, keine Datenbank).

---

## 3. Projektstruktur

```
dp-quiz-tool/
├── index.html
├── style.css
├── script.js
├── KONZEPT.md              ← dieses File
├── .gitignore
└── data/
    ├── quiz/               ← alle MC-Quiz-Files
    │   ├── quiz_BAO.json
    │   ├── quiz_ESt.json
    │   ├── quiz_USt.json
    │   ├── quiz_KoeSt.json
    │   ├── quiz_LSt.json
    │   ├── quiz_FinStrG.json
    │   ├── quiz_UGB.json
    │   ├── quiz_FLAG.json
    │   ├── quiz_DBA.json
    │   ├── quiz_Bewertung.json
    │   ├── quiz_Kleinabgaben.json
    │   └── quiz_Kundenservice.json
    ├── karteikarten/       ← eine Datei pro Obsidian-Note
    │   ├── ESt_Betriebsvermoegen.json
    │   ├── ESt_AfA.json
    │   ├── BAO_Ermessen.json
    │   └── ...
    └── vault/              ← Phase 2/3, noch leer
        └── graph.json      ← wird beim Vault-Parsing miterzeugt
```

**Dateinamen-Konvention MC-Fragen:** `quiz_<Fachname>.json` im Unterordner
`/data/quiz/`, automatisch erkannt — das Tool liest alle `quiz_*.json`-Files
in diesem Ordner ein, ohne dass Code-Anpassungen nötig sind, wenn ein neues
Fach hinzukommt.

**Dateinamen-Konvention Karteikarten:** `<Fach>_<Themenslug>.json` im
Unterordner `/data/karteikarten/`, ebenfalls automatisch erkannt.

---

## 3a. Lokale Entwicklung & Hosting

### Lokaler Dev-Server (zwingend nötig)
Das Tool lädt JSON-Dateien per `fetch()`. Dieser Browser-API-Aufruf
funktioniert **nicht** wenn `index.html` direkt per Doppelklick geöffnet
wird (`file://`-Protokoll blockiert `fetch()` aus Sicherheitsgründen).

Claude Code soll daher beim Setup einen einfachen lokalen Dev-Server
mit einrichten, z. B.:

```bash
# Python (überall verfügbar, kein Install nötig)
python -m http.server 8080

# oder Node.js (falls vorhanden)
npx serve .
```

Das Tool ist dann unter `http://localhost:8080` erreichbar.
Claude Code soll diese Anweisung als `README.md` im Projektordner
dokumentieren, damit nach längeren Pausen sofort klar ist, wie man
das Tool startet.

### Versionskontrolle: Git + GitHub
Das Projekt soll von Anfang an als **Git-Repository** angelegt werden.
Vorteile:
- Versionsverlauf aller Änderungen (MC-Fragen, Code, Konzept)
- Direktes Deployment auf GitHub Pages ohne Extra-Aufwand
- Backup außerhalb des lokalen Rechners

`.gitignore` soll mindestens enthalten:
```
.DS_Store
Thumbs.db
node_modules/
```

### Online-Hosting: GitHub Pages (primär)
**Empfehlung: GitHub Pages** — kostenlos, direkt aus dem Repository,
kein Build-Schritt nötig bei Vanilla HTML/JS.

Deployment-Ablauf:
1. Repository auf GitHub pushen (kann öffentlich oder privat sein —
   bei privatem Repository braucht man GitHub Pro für Pages, das
   kostenlose Tier erfordert ein öffentliches Repository)
2. In den Repository-Einstellungen GitHub Pages aktivieren
   (Branch: `main`, Ordner: `/` root)
3. Tool ist erreichbar unter `https://<username>.github.io/dp-quiz-tool/`

**Alternative: Netlify** — ebenfalls kostenlos, funktioniert per
Drag & Drop des Projektordners oder automatisch via GitHub-Sync.
Eigene URL wie `dp-quiz.netlify.app` inklusive. Kein Unterschied
in der Funktionalität für dieses Tool.

### Wichtig für den Code: Relative Pfade
Alle `fetch()`-Aufrufe im JavaScript müssen mit **relativen Pfaden**
arbeiten (z. B. `./data/quiz/quiz_BAO.json`), nie mit absoluten Pfaden
(nie `C:\Users\...` oder `/home/...`). Nur so funktioniert das Tool
sowohl lokal (`localhost:8080`) als auch auf GitHub Pages/Netlify ohne
Anpassung.

---

## 3b. Landing Page (Einstiegspunkt des Tools)

Beim Öffnen von `index.html` landet man auf einer zentralen Startseite,
die als Knotenpunkt zu allen drei Modulen dient (MC-Quiz, Karteikarten,
später Nachschlagewerk) — kein direkter Sprung in einen der Modi.

### Aufbau
- **Drei große, gleichwertige Kacheln/Cards**, nebeneinander (Desktop)
  bzw. untereinander (iPad/schmaler Viewport):
  1. **MC-Quiz** — führt zum Auswahlbildschirm aus Punkt 5.1
  2. **Karteikarten** — führt zum Auswahlbildschirm aus Punkt 5a
  3. **Nachschlagewerk** — in v1 sichtbar, aber **deaktiviert/ausgegraut**
     mit Hinweis „bald verfügbar" (Phase 2, siehe Punkt 11); kein toter
     Link, sondern bewusst als Vorschau auf den geplanten Ausbau sichtbar
- Jede Kachel enthält: Titel, kurze Beschreibungszeile (z. B. „370 Fragen
  aus 12 Fächern" / „Active Recall mit deinen Obsidian-Notizen"), Icon
  oder einfaches visuelles Unterscheidungsmerkmal

### Dashboard-Element (zusätzlich zu den Kacheln, nicht stattdessen)
Eine kompakte Übersicht — kein eigener Screen, sondern z. B. ein
dezenter Bereich ober- oder unterhalb der drei Kacheln — zeigt
kontextbezogene Infos aus dem in localStorage gespeicherten Verlauf:
- Letzter MC-Quiz-Score (z. B. „Letzter Test: BAO, 18/20")
- Zuletzt geübtes Fach/Thema (MC-Quiz und/oder Karteikarten)
- Optional: Datum der letzten Nutzung

Verhalten bei fehlendem Verlauf (erster Aufruf des Tools, leeres
localStorage): Dashboard-Bereich zeigt einen neutralen Einstiegstext
(z. B. „Noch keine Lernsession aufgezeichnet — leg los!") statt leer
oder fehlerhaft zu wirken.

### Designvorgabe
Für die Landing Page existiert bereits ein Mockup aus Claude Design.
Dieses Design ist **verbindlich**, nicht nur Inspiration: Farbschema,
Typografie, Layout und visuelle Gestaltung der Kacheln sowie des
Dashboard-Elements sind exakt nach diesem Mockup umzusetzen.
KONZEPT.md beschreibt hier ausschließlich die **Funktionalität** und
Struktur (welche Elemente vorhanden sein müssen, wie sie sich
verhalten) — das Mockup bestimmt die **Optik**. Bei Unklarheiten oder
Widersprüchen zwischen Mockup und diesem Dokument hat das Mockup
Vorrang für alles Visuelle, dieses Dokument Vorrang für alles
Funktionale (z. B. welche Daten im Dashboard angezeigt werden).

Dieselbe Designvorgabe (sofern das Mockup dafür Stile definiert) gilt
sinngemäß auch für die übrigen Screens des Tools (Quiz-Ansicht,
Karteikarten-Ansicht, Endauswertung), damit ein einheitliches
Erscheinungsbild über das gesamte Tool entsteht — nicht nur auf der
Landing Page.

---

## 4. Datenschema (JSON pro Fach) — MC-Fragen

Das Schema unterstützt zwei Fragetypen: `"single"` (eine richtige Antwort)
und `"multiple"` (mehrere richtige Antworten). Das Feld `typ` ist
**abwärtskompatibel** — fehlt es, behandelt das Tool die Frage als `"single"`.
Bestehende JSON-Files ohne `typ`-Feld müssen nicht angepasst werden.

### Single-Choice Beispiel
```json
{
  "fach": "FinStrG",
  "fragen": [
    {
      "id": "finstrg-01",
      "typ": "single",
      "frage": "Welche Schuldform erfordert § 34 FinStrG?",
      "optionen": [
        "Vorsatz (Wissentlichkeit)",
        "Leichte Fahrlässigkeit",
        "Grobe Fahrlässigkeit",
        "Bedingter Vorsatz reicht nicht aus"
      ],
      "korrekt": 2,
      "erklaerung": "§ 34 FinStrG verlangt grobe Fahrlässigkeit als Schuldform ..."
    }
  ]
}
```

### Multiple-Choice Beispiel
```json
{
  "fach": "BAO",
  "fragen": [
    {
      "id": "bao-ue-par14-05",
      "abschnitt": "§§ 1–4",
      "typ": "multiple",
      "frage": "Wofür ist der Zeitpunkt der Entstehung des Abgabenanspruchs relevant?",
      "optionen": [
        "Beginn der Bemessungsverjährung",
        "Möglichkeit einer Nachsicht",
        "Haftungsinanspruchnahme",
        "Fälligkeit",
        "Für einen Insolvenzantrag",
        "Veranlagung"
      ],
      "korrekt": [0, 2, 3, 5],
      "erklaerung": "Der Zeitpunkt der Entstehung des Abgabenanspruchs ist maßgeblich für den Beginn der Bemessungsverjährung, die Haftungsinanspruchnahme, die Fälligkeit und die Veranlagung."
    }
  ]
}
```

Feldbeschreibung:
- `fach` (string) — Anzeigename des Fachs
- `fragen` (array) — Liste der Fragen
  - `id` (string) — eindeutiger Identifier
  - `typ` (string, optional) — `"single"` oder `"multiple"`;
    fehlt das Feld, gilt `"single"` als Default (Abwärtskompatibilität)
  - `abschnitt` (string, optional) — Themenabschnitt innerhalb des Fachs
    (z. B. `"§§ 1–4"`), wird in der Auswertung zur Gliederung genutzt
  - `frage` (string) — ausformulierte Frage
  - `optionen` (array von strings) — Antwortmöglichkeiten;
    bei `"single"` typisch 4 Optionen, bei `"multiple"` können es mehr sein
  - `korrekt` — bei `"single"`: integer (0-basierter Index);
    bei `"multiple"`: array von integers (alle korrekten Indizes)
  - `erklaerung` (string) — fachliche Begründung, wird nach
    Beantwortung angezeigt

---

## 4a. Datenschema (JSON pro Note) — Karteikarten

```json
{
  "fach": "ESt",
  "thema": "Betriebsvermögen",
  "quelle_note": "ESt/Betriebsvermögen.md",
  "karten": [
    {
      "id": "est-bv-01",
      "frage": "Welche Arten von Vermögen gibt es im Steuerrecht?",
      "antwort": "Notwendiges Betriebsvermögen, notwendiges Privatvermögen, gewillkürtes Betriebsvermögen. (Im Bilanzaufbau zusätzlich: Anlagevermögen, Umlaufvermögen, Eigenkapital, Schulden)."
    }
  ]
}
```

Feldbeschreibung:
- `fach` (string) — abgeleitet aus dem **Ordnernamen**, in dem die Quell-Note
  im Obsidian-Vault liegt (z. B. Note in `Vault/ESt/Betriebsvermögen.md` → `fach: "ESt"`)
- `thema` (string) — abgeleitet aus dem **H1-Titel** der Note (erste Zeile `# ...`)
- `quelle_note` (string) — relativer Pfad zur Original-Note im Vault, für
  spätere Rückverlinkung
- `karten` (array) — Liste der Karteikarten aus dieser Note
  - `id` (string) — Format `<fachkürzel>-<themenslug>-<nummer>`
  - `frage` (string) — 1:1 aus dem Callout übernommen
  - `antwort` (string) — 1:1 aus dem Callout übernommen, mit einer
    Ausnahme: Obsidian-Wikilinks `[[Linktext]]` werden zu reinem
    `Linktext` bereinigt (Klammern entfernt), da sie im Tool nicht
    klickbar/navigierbar sind

### Parsing-Regel für Kontrollfragen-Callouts

Die Kontrollfragen stehen in Obsidian-Notes als eigener Abschnitt
(`## Kontrollfragen`) in folgendem Callout-Format:

```markdown
>[!question]- Frage hier?
>Antworttext hier, kann auch mehrzeilig sein
>mit weiteren Sätzen in eigenen Zeilen.
```

Parsing-Logik:
1. Suche nach Zeilen, die mit `>[!question]-` beginnen
2. Alles nach `>[!question]-` in derselben Zeile ist die Frage
3. Alle folgenden Zeilen, die mit `>` beginnen, gehören zur Antwort
   (Zeilenumbruch im Original wird als Leerzeichen oder Zeilenumbruch
   in der Antwort beibehalten)
4. Der Callout endet bei der ersten Zeile, die nicht mehr mit `>` beginnt
5. In der Antwort: `[[Wikilink]]` → `Wikilink` (Klammern entfernen)
6. Nur Notes mit einem `## Kontrollfragen`-Abschnitt werden verarbeitet;
   Notes ohne diesen Abschnitt werden übersprungen (kein Fehler)

---

## 5. Kernfunktionen

### 5.1 Fach- und Fragenauswahl (Startbildschirm)
- Für **jedes** im `/data/quiz`-Ordner gefundene Fach wird eine Zeile angezeigt mit:
  - Checkbox: Fach in den Test aufnehmen / ausschließen
  - Eingabefeld: Anzahl der Fragen aus diesem Fach (Standard: alle verfügbaren;
    Eingabe darf die tatsächlich vorhandene Fragenzahl nicht überschreiten)
- Mehrere Fächer gleichzeitig wählbar → **Gesamt-Modus** entsteht automatisch
  durch Auswahl mehrerer Fächer; ein Fach allein → **Einzel-Fach-Modus**.
- Button „Test starten" sammelt die gewählten Fragen, mischt sie fachübergreifend.

### 5.2 Zufällige Reihenfolge — Fragen UND Antworten
- Die Reihenfolge der Fragen im Testlauf wird gemischt.
- Pro Frage werden auch die `optionen` zufällig neu angeordnet
  (z. B. Fisher-Yates-Shuffle).
- **Wichtig:** Beim Mischen wird der ursprüngliche Index jeder Option
  mitgeführt (z. B. `{ text: "...", originalIndex: 2 }`). Die Prüfung auf
  „richtig/falsch" erfolgt immer über den Vergleich mit `korrekt` aus dem
  JSON, nicht über die angezeigte Position. So bleibt das JSON-Format
  unverändert, unabhängig von der Anzeige-Reihenfolge.
- Jeder Testlauf soll neu gemischt werden (auch bei Wiederholung desselben
  Fachs), damit keine Positions-Muster auswendig gelernt werden.
- **Wichtig für Multiple-Choice:** Die Shuffle-Logik gilt identisch auch
  für `typ: "multiple"` — `korrekt` ist ein Array von Original-Indizes,
  die nach dem Mischen über `originalIndex` korrekt zugeordnet werden.

### 5.3 Fragendarstellung & Auswertung pro Frage

#### Single-Choice (`typ: "single"` oder kein `typ`-Feld)
- Eine Frage wird mit ihren Antwortoptionen als **Radio-Buttons** angezeigt.
- Nach Auswahl einer Option: sofortiges visuelles Feedback
  (grün = richtig, rot = falsch gewählte Antwort; korrekte Antwort wird
  zusätzlich hervorgehoben, falls falsch gewählt).
- Die `erklaerung` wird direkt nach der Beantwortung eingeblendet.
- Navigation zur nächsten Frage erst nach Beantwortung möglich.

#### Multiple-Choice (`typ: "multiple"`)
- Die Antwortoptionen werden als **Checkboxen** dargestellt (nicht
  Radio-Buttons), da mehrere Antworten ausgewählt werden können.
- Ein Hinweis wird oberhalb der Optionen angezeigt, z. B.
  „Mehrere Antworten möglich — alle richtigen ankreuzen."
- **Kein sofortiges Feedback** nach Klick auf eine Checkbox — der Nutzer
  wählt zunächst alle Antworten, die er für richtig hält.
- Ein **„Auswerten"-Button** erscheint (und ist erst nach Auswahl von
  mindestens einer Option aktiv) — erst nach Klick darauf wird ausgewertet.
- Auswertungslogik: Eine Multiple-Choice-Frage gilt als **richtig**, wenn
  genau alle korrekten Optionen angekreuzt sind und keine falschen
  angekreuzt wurden (kein Teilpunkt-System in v1).
- Visuelles Feedback nach Auswertung:
  - **Grün** = korrekt ausgewählte Option (war richtig und wurde angekreuzt)
  - **Rot** = falsch ausgewählte Option (war falsch, wurde aber angekreuzt)
  - **Orange/Gelb** = vergessene korrekte Option (war richtig, wurde aber
    nicht angekreuzt)
  - Nicht ausgewählte, falsche Optionen bleiben neutral
- Die `erklaerung` wird nach dem Auswerten eingeblendet.
- Navigation zur nächsten Frage erst nach Auswertung möglich.

### 5.4 Endauswertung
- Gesamt-Score (z. B. „18 / 23 richtig", inkl. Prozentanzeige).
- Aufschlüsselung nach Fach, falls mehrere Fächer getestet wurden.
- Bei Fächern mit `abschnitt`-Feld (z. B. BAO): optionale Aufschlüsselung
  auch nach Abschnitt (z. B. „§§ 1–4: 4/5 richtig").
- Liste aller **falsch beantworteten Fragen** mit:
  - der gestellten Frage
  - bei Single-Choice: der eigenen (falschen) Antwort + der korrekten Antwort
  - bei Multiple-Choice: welche Optionen angekreuzt waren (inkl. Markierung
    welche davon falsch waren) + alle korrekten Optionen
  - der Erklärung
- Kein separater „Falsche nochmal üben"-Modus in v1 (Möglichkeit für
  spätere Erweiterung, siehe Punkt 7).

### 5.5 Persistenz (localStorage)
- Gespeichert werden soll:
  - Verlauf der Testläufe (Datum, gewählte Fächer, Score)
  - Historie pro Frage: wie oft richtig/falsch beantwortet (Basis für
    spätere Auswertungen, z. B. „Problemfragen" erkennen)
- Kein Cloud-Sync, rein lokal im Browser des jeweiligen Geräts.
- Da `localStorage` geräte- und browserspezifisch ist: Tool wird primär an
  einem Gerät/Browser regelmäßig genutzt (kein Anspruch auf
  geräteübergreifenden Sync in v1).

---

## 5a. Karteikarten-Modus (zweiter Tab/Modus im selben Tool)

### Herkunft der Daten
Die Karteikarten stammen aus Obsidian-Notes mit einem
`## Kontrollfragen`-Abschnitt (siehe Datenschema 4a und Parsing-Regel).
Sie werden **einmalig durch Claude Code** aus dem Vault ausgelesen und
als JSON-Dateien in `/data/karteikarten/` abgelegt — das Quiz-Tool selbst
liest zur Laufzeit nur noch fertige JSON-Dateien, greift nicht live auf
den Vault zu.

### Auswahlbildschirm
- Eigener Tab/Navigationspunkt neben dem MC-Quiz-Modus, z. B. „Karteikarten"
- Auswahl analog zum MC-Modus: Fächer (aus `fach`) zu-/abwählbar; optional
  zusätzlich nach `thema` filterbar, falls ein Fach mehrere Themen-Dateien hat
- Anzahl der Karten pro Auswahl einstellbar wie beim MC-Quiz

### Kartendarstellung
- Eine Karte zeigt zunächst nur die `frage`
- Per Klick/Tap deckt sich die Karte um und zeigt die `antwort`
  (klassisches Flip-Verhalten)
- Nach dem Aufdecken: Selbsteinschätzung durch den Nutzer, z. B. zwei
  Buttons „Gewusst" / „Nicht gewusst" — keine automatische Bewertung wie
  beim MC-Quiz, da es keine Distraktoren/korrekte Antwort-Indizes gibt
- Navigation zur nächsten Karte erst nach Selbsteinschätzung

### Persistenz Karteikarten (localStorage)
- Eigener Bereich in localStorage, getrennt vom MC-Quiz-Verlauf
- Gespeichert wird pro Karte: wie oft als „gewusst"/„nicht gewusst"
  eingeschätzt, Datum der letzten Durchsicht
- Kein Spaced-Repetition-Algorithmus (z. B. Leitner-System) in v1 — Karten
  werden bei jeder Runde aus der gewählten Menge neu gemischt angezeigt;
  eine Gewichtung nach Schwierigkeit ist eine mögliche spätere Erweiterung
  (siehe Punkt 7)

### Endauswertung Karteikarten-Runde
- Anzahl „gewusst" vs. „nicht gewusst" der Runde
- Liste der als „nicht gewusst" markierten Karten zur Nachschau (Frage +
  Antwort), analog zur Falsch-Liste im MC-Quiz

---

## 6. Ausdrücklich NICHT Teil von v1

- Kein Login- oder Benutzerverwaltungssystem
- Keine Cloud-Synchronisation / kein Backend
- Kein „Falsche Fragen gezielt wiederholen"-Modus (nur Anzeige am Ende)
- Keine Bearbeitung/Erstellung neuer Fragen oder Karteikarten direkt im
  Tool (Pflege ausschließlich über die JSON-Dateien bzw. die Quell-Notes
  im Obsidian-Vault)
- Keine Zeitmessung / kein Timer pro Frage oder Karte
- Kein automatischer Re-Sync mit dem Obsidian-Vault — Karteikarten-JSONs
  werden bei Bedarf manuell neu generiert (z. B. wenn Notes ergänzt
  wurden), nicht live beim Öffnen des Tools eingelesen
- Kein Spaced-Repetition-Algorithmus (Leitner-System o. ä.) für die
  Karteikarten in v1
- Kein Nachschlagewerk-Modul (vollständige, gerenderte Vault-Notes
  inkl. Navigation) — das ist als **Phase 2** separat unter Punkt 11
  festgehalten und wird erst angegangen, wenn der Vault weiter befüllt ist

---

## 7. Ideen für spätere Erweiterungen (nicht jetzt umsetzen)

- Modus „Nur falsch beantwortete Fragen wiederholen"
- Statistik-Dashboard: Trefferquote pro Fach über Zeit, „Problemfragen"
  (häufig falsch beantwortet) gesondert hervorheben
- Lernmodus ohne Wertung (zum reinen Durchklicken mit Erklärungen)
- Export der Statistik als Datei (z. B. zur Sicherung außerhalb von localStorage)
- Eventuell Integration/Abgleich mit dem Obsidian-Vault (z. B. Verlinkung
  einer Frage zur passenden Vault-Note) — für Karteikarten bereits über
  `quelle_note` im Schema vorbereitet, aber ohne aktive Verlinkung im UI
- Spaced-Repetition-Logik für Karteikarten (z. B. einfaches Leitner-System
  mit mehreren „Boxen", in denen Karten je nach Einschätzung wandern)
- Automatisiertes Re-Parsing des Vaults bei jeder Tool-Nutzung statt
  manueller Neugenerierung der Karteikarten-JSONs

---

## 8. Geräte-/Browser-Anforderungen

- Primär genutzt am PC (Dual-Monitor-Setup, Brave Browser).
- Soll responsiv genug sein, um auch auf dem iPad (Safari, ggf. Split View)
  benutzbar zu sein — kein dediziertes Mobile-Layout nötig, aber keine
  fixen Pixel-Breiten, die auf kleineren Bildschirmen brechen.

---

## 9. Definition of Done (v1)

- [x] Alle JSON-Dateien im `/data`-Ordner werden automatisch erkannt und
      als auswählbare Fächer im Startbildschirm angezeigt
- [x] Fächer einzeln zu-/abwählbar, Fragenanzahl pro Fach einstellbar
- [x] Test mischt Fragen fachübergreifend sowie die Antwortoptionen pro Frage
- [x] Richtig/Falsch-Erkennung funktioniert unabhängig von der
      Anzeige-Reihenfolge der Antworten (Index-Mapping wie in 5.2 beschrieben)
- [x] Erklärung wird nach jeder Beantwortung angezeigt
- [x] Endauswertung zeigt Score (gesamt + pro Fach) sowie alle falsch
      beantworteten Fragen mit korrekter Lösung und Erklärung
- [x] Testverlauf wird in localStorage gespeichert und bleibt nach
      Browser-Neustart erhalten
- [x] Funktioniert ohne Build-Schritt durch einfaches Öffnen von `index.html`
- [x] Layout funktioniert sowohl am Desktop (Dual-Monitor) als auch auf
      dem iPad (Safari)
- [x] Landing Page zeigt die drei Kacheln (MC-Quiz, Karteikarten,
      Nachschlagewerk als „bald verfügbar" ausgegraut) sowie ein
      Dashboard-Element mit letztem Score/zuletzt geübtem Fach (bzw.
      neutralem Einstiegstext bei leerem Verlauf)
- [x] Obsidian-Notes mit `## Kontrollfragen`-Abschnitt werden korrekt als
      Karteikarten-JSONs gemäß Schema 4a geparst (Fach aus Ordnername,
      Thema aus H1-Titel, Wikilinks bereinigt)
- [x] Karteikarten-Modus als eigener Tab erreichbar, mit Fach-/Themenauswahl,
      Flip-Mechanik und „Gewusst"/„Nicht gewusst"-Einschätzung
- [x] Karteikarten-Verlauf wird separat vom MC-Quiz-Verlauf in localStorage
      gespeichert und bleibt nach Browser-Neustart erhalten
- [x] Projekt ist als Git-Repository angelegt mit sinnvollem `.gitignore`
- [x] `README.md` im Projektordner erklärt wie der lokale Dev-Server
      gestartet wird und wie das Deployment auf GitHub Pages funktioniert
- [x] Alle `fetch()`-Pfade sind relativ (`./data/quiz/...`), sodass das
      Tool lokal (localhost) und auf GitHub Pages/Netlify ohne Anpassung läuft
- [x] Multiple-Choice-Fragen (`typ: "multiple"`) werden mit Checkboxen statt
      Radio-Buttons dargestellt, mit „Auswerten"-Button und dreifarbigem
      Feedback (grün = richtig angekreuzt / rot = falsch angekreuzt /
      orange = vergessene korrekte Option) nach der Auswertung
- [x] Abwärtskompatibilität: Fragen ohne `typ`-Feld werden als `"single"`
      behandelt — alle bestehenden JSON-Files funktionieren ohne Änderung

---

## 10. Hinweis zum Vault-Zugriff (einmaliger Parsing-Schritt)

Für das Auslesen der Obsidian-Notes benötigt Claude Code Lesezugriff auf
den Vault-Ordner auf der Festplatte. Empfohlenes Vorgehen:
- Pfad zum Vault als zusätzliches Arbeitsverzeichnis in Claude Code angeben,
  **oder**
- relevante Fach-Unterordner des Vaults in einen lokalen Ordner (z. B.
  `vault-export/`) kopieren, falls der Vault selbst nicht direkt
  freigegeben werden soll
- Das Parsing-Skript (von Claude Code erstellt) durchläuft die
  Ordnerstruktur, identifiziert Notes mit `## Kontrollfragen`-Abschnitt
  und erzeugt je Note eine JSON-Datei in `/data/karteikarten/`
- Dieser Schritt ist **kein** Teil des Laufzeitverhaltens des Tools
  selbst (siehe Punkt 6) — er wird bei Bedarf manuell erneut ausgeführt,
  wenn neue Kontrollfragen im Vault ergänzt wurden

---

## 11. Phase 2 (später, NICHT Teil der aktuellen Umsetzung): Nachschlagewerk

> Dieser Abschnitt ist bewusst als **Zukunftsplanung** markiert. Der Vault
> ist aktuell noch nicht fertig befüllt. Diese Phase wird erst angegangen,
> wenn v1 (MC-Quiz) und Phase 1.5 (Karteikarten) stehen und der Vault
> einen für sinnvolle Nutzung ausreichenden Reifegrad erreicht hat.
> Der Abschnitt dient dazu, die Idee und grobe Anforderungen jetzt schon
> festzuhalten, damit sie in einer späteren Session nicht neu erarbeitet
> werden müssen.

### Ziel
Der komplette (oder fachweise ausgewählte) Obsidian-Vault soll als
drittes Modul im selben Tool durchsuch- und lesbar sein — als digitales
Nachschlagewerk neben MC-Quiz und Karteikarten. Anders als beim
Karteikarten-Modus (der nur die `## Kontrollfragen`-Abschnitte extrahiert)
wird hier die **gesamte Note** inkl. aller Inhalte dargestellt.

### Darstellung
- Original-Markdown-Struktur bleibt erhalten und wird **gerendert**
  angezeigt (nicht als Rohtext mit sichtbaren `>`-Zeichen)
- Obsidian-Callouts (`[!abstract]`, `[!warning]`, `[!tip]`, `[!example]-`,
  `[!note]`, `[!info]`, `[!question]-` etc.) werden als entsprechend
  gestylte Boxen dargestellt (Farbe/Icon je nach Callout-Typ), analog zur
  Darstellung in Obsidian selbst — Callout-Styling richtet sich nach dem
  Claude-Design-Mockup (verbindliche Designvorgabe, siehe Punkt 3b)
- Foldable Callouts (Typen mit `-`, z. B. `[!example]-`) bleiben
  einklappbar/ausklappbar wie in Obsidian
- Tabellen, Codeblöcke, Listen, Fett-/Kursivschrift: Standard-Markdown-
  Rendering

### Navigation zwischen Notes
- Wikilinks (`[[Notename]]`) sind im gerenderten Text **klickbar**
- Klick navigiert innerhalb des Tools zur Ziel-Note (kein Verlassen des
  Tools, keine externe Obsidian-Anwendung nötig)
- Verweist ein Link auf eine Note, die nicht im für das Tool exportierten
  Bestand vorhanden ist (z. B. weil nur einzelne Fächer exportiert
  wurden), wird dies erkennbar dargestellt (z. B. ausgegraut oder mit
  Hinweis „Note nicht verfügbar"), statt zu einem Fehler zu führen

### Struktur / Navigation im Tool
- Übersicht der Notes gegliedert nach Fach (analog zur Ordnerstruktur
  im Vault)
- Suchfunktion über Notiztitel (Volltextsuche ist eine mögliche spätere
  Ausbaustufe, kein Muss für den ersten Wurf dieser Phase)

### Datenherkunft
- Wie beim Karteikarten-Modus: einmaliges Parsing durch Claude Code aus
  dem Vault-Ordner heraus, Ablage als strukturierte Dateien (Format wird
  bei Start dieser Phase final festgelegt — vermutlich eine JSON-Datei
  pro Note mit Rohinhalt + Metadaten, oder direkte Übernahme der
  `.md`-Dateien in einen `/data/vault/`-Ordner, falls eine
  Markdown-Rendering-Bibliothek im Tool direkt mit `.md`-Dateien
  arbeitet)
- Kein Live-Zugriff auf den Vault zur Laufzeit (gleiches Prinzip wie bei
  den Karteikarten, siehe Punkt 10)
- Manuelle Neugenerierung bei Vault-Änderungen, kein Auto-Sync in der
  ersten Ausbaustufe dieser Phase

### Offene Punkte, die bei Start dieser Phase zu klären sind
- Soll der gesamte Vault exportiert werden oder nur fertiggestellte
  Fächer?
- Wie werden Notes ohne zugehöriges Fach (z. B. allgemeine
  Methodik-Notes, falls vorhanden) einsortiert?
- Soll es eine Verlinkung vom MC-Quiz/Karteikarten zur passenden Note
  im Nachschlagewerk geben (z. B. „Mehr dazu in der Vault-Note")? Das
  Feld `quelle_note` im Karteikarten-Schema (Punkt 4a) ist dafür bereits
  vorbereitet

---

## 12. Phase 3 (später, NICHT Teil der aktuellen Umsetzung): Nachschlagewerk mit Graph-View

> Dieser Abschnitt baut auf Phase 2 (Punkt 11) auf und wird erst
> angegangen, wenn der Vault einen ausreichenden Reifegrad hat und
> Phase 2 (einfaches Nachschlagewerk) bereits steht. Die Graph-Ansicht
> ohne funktionierendes Nachschlagewerk dahinter wäre nur Dekoration —
> erst die Kombination beider ergibt echten Lernnutzen.

### Layout: Dreispaltig (analog zu Obsidian)

```
┌─────────────────────────────────────────────────────────────┐
│  Nachschlagewerk                                            │
├──────────────┬──────────────────────┬───────────────────────┤
│              │                      │                       │
│  Ordner-     │   Note-Reader        │   Graph-View          │
│  Verzeichnis │   (gerendertes       │   (D3.js,             │
│  (Fächer,    │   Markdown inkl.     │   interaktiv,         │
│  Rechts-     │   Callouts,          │   klickbar,           │
│  quellen)    │   klickbare Links)   │   zoombar)            │
│              │                      │                       │
│  Spalte 1    │   Spalte 2           │   Spalte 3            │
│  ~20 %       │   ~50 %              │   ~30 %               │
└──────────────┴──────────────────────┴───────────────────────┘
```

Auf dem iPad (schmaler Viewport): Spalten kollabieren zu einem
Tab-basierten Wechsel (Verzeichnis / Note / Graph), da dreispaltig
auf ~820px Breite nicht sinnvoll darstellbar ist.

---

### Spalte 1 — Ordner-Verzeichnis

- Baumstruktur analog zur Vault-Ordnerstruktur
  (z. B. Bundesabgabenordnung → BAO-Merksätze, Ermessen, Haftung …
  Rechtsquellen → BAO → § 1 BAO, § 4 BAO …)
- Klick auf eine Note öffnet sie in Spalte 2 (Note-Reader)
  und zentriert den Graph in Spalte 3 auf diesen Knoten
- Aktive Note wird im Verzeichnis hervorgehoben

---

### Spalte 2 — Note-Reader

- Gerendertes Markdown inkl. Obsidian-Callout-Styling
  (exakt wie in Phase 2 / Punkt 11 beschrieben)
- Wikilinks `[[Notename]]` sind klickbar → öffnen die Ziel-Note
  in derselben Spalte 2 (Navigation innerhalb des Readers),
  aktualisiert gleichzeitig den Graph in Spalte 3

#### Hover-Preview auf Wikilinks
Fährt der Nutzer mit der Maus über einen `[[Wikilink]]` im Text,
erscheint ein Tooltip/Popup neben dem Cursor mit einer Vorschau
der Ziel-Note:
- Zeigt nur den **Anfang der Note** (z. B. erste ~350 Zeichen oder
  bis zur ersten `---`-Trennlinie, was zuerst kommt)
- Gerendert (kein Rohtext), inkl. Fettschrift und Struktur
- Erscheint bei `mouseenter`, verschwindet bei `mouseleave`
- **Kein Netzwerk-Request beim Hover** — alle Note-Inhalte werden
  beim App-Start gecacht (da sie als statische Dateien in
  `/data/vault/` liegen), der Preview ist daher verzögerungsfrei
- Zeigt einen neutralen Hinweis, wenn die Ziel-Note nicht im
  exportierten Bestand vorhanden ist (z. B. „Note nicht verfügbar")

---

### Spalte 3 — Graph-View

**Rendering:** D3.js Force-Directed Graph (dieselbe Bibliothek ist
im Tool ohnehin verfügbar)

#### Visuelle Darstellung
- Jede Note = ein Knoten
- Jeder Wikilink = eine gerichtete Kante
- **Farbkodierung nach Fach/Ordner** (analog zum Screenshot):
  z. B. Orange = KöSt, Grün = ESt, Pink/Rot = BAO, Blau = USt —
  genaue Farben richten sich nach dem Claude-Design-Mockup
- **Knotengröße nach Verlinkungsgrad**: stark vernetzte Notes
  (viele eingehende Links) erscheinen größer
- Aktuell geöffnete Note (Spalte 2) wird im Graph hervorgehoben
  (z. B. heller Rand / größer / andere Farbe)

#### Interaktion
- **Zoom und Pan** (Mausrad + Drag auf freier Fläche)
- **Knoten verschieben** (Drag auf einzelnem Knoten)
- **Klick auf Knoten** → öffnet die Note in Spalte 2,
  Verzeichnis in Spalte 1 scrollt zur aktiven Note
- **Filterung nach Fach**: Checkbox oder Dropdown, um nur
  bestimmte Fach-Cluster anzuzeigen (z. B. nur BAO-Knoten)
- **Lokale Graph-Ansicht**: Toggle, der nur den aktuell
  geöffneten Knoten und seine direkten Nachbarn anzeigt
  (entspricht Obsidians Local Graph)

#### Was bewusst wegfällt (nicht Teil dieser Phase)
- Physik-Einstellungen per Schieberegler (wie in Obsidian)
- Tag-basierte Farbfilter (nur Ordner-basierte Farbkodierung)
- Globale Volltextsuche mit Live-Highlight im Graph
- Animationssteuerung

---

### Datengrundlage für den Graph

Beim Parsing des Vaults (Punkt 10) wird zusätzlich zu den einzelnen
Note-Dateien eine **Graph-Datei** erzeugt:

```json
{
  "nodes": [
    {
      "id": "BAO/Ermessen",
      "label": "Ermessen",
      "fach": "BAO",
      "pfad": "BAO/Ermessen.md"
    }
  ],
  "edges": [
    {
      "source": "BAO/Ermessen",
      "target": "BAO/Überblick & Wesen BAO"
    }
  ]
}
```

Diese Datei (`data/vault/graph.json`) wird beim App-Start einmalig
geladen und im Speicher gehalten — kein wiederholtes Parsing zur
Laufzeit.

> **Hinweis für das Parsing-Skript (Punkt 10):** Das Skript sollte
> bereits beim Karteikarten-Parsing `graph.json` miterzeugen, auch
> wenn Phase 3 noch nicht umgesetzt wird. Alle Wikilinks in allen
> Notes werden dabei erfasst und als Kantenliste gespeichert.
> Das spart später Arbeit, da das Skript nicht nochmals von Grund auf
> neu geschrieben werden muss.

---

### Offene Punkte für den Start dieser Phase
- Sollen Rechtsquellen-Notes (§ 1 BAO, § 4 EStG etc.) im Graph
  eine eigene Farbe/Form bekommen, um sie von thematischen Notes
  zu unterscheiden?
- Soll die Graph-Ansicht standardmäßig den Gesamt-Graph oder
  die lokale Ansicht der zuletzt geöffneten Note zeigen?
- Farbzuweisung der Fach-Cluster: final mit dem Claude-Design-
  Mockup abgleichen
