#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// parse-karteikarten.mjs
//
// Einmaliger Parsing-Schritt (KONZEPT.md Punkt 4a / 10): liest alle Obsidian-
// Notes mit einem `## Kontrollfragen`-Abschnitt aus dem Vault und erzeugt je
// Note eine JSON-Datei in data/karteikarten/.
//
// Aufruf:
//   node tools/parse-karteikarten.mjs "<Pfad-zum-Vault>"
//
// Ohne Argument wird der unten gesetzte DEFAULT_VAULT verwendet.
// Der Schritt ist KEIN Teil des Laufzeitverhaltens des Tools — bei neuen
// Kontrollfragen im Vault einfach erneut ausführen.
// ─────────────────────────────────────────────────────────────────────────────

import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname, basename, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const OUT_DIR = join(PROJECT_ROOT, 'data', 'karteikarten');
const VAULT_OUT_DIR = join(PROJECT_ROOT, 'data', 'vault');

const DEFAULT_VAULT = 'C:\\Users\\domin\\Documents\\Obsidian\\Steuer Gesetz';
const VAULT = process.argv[2] || DEFAULT_VAULT;

// Ordnername (Langform im Vault) → Fach-Kürzel (konsistent zum MC-Quiz).
// Fallback: Originaler Ordnername, falls kein Mapping existiert.
const FACH_MAP = {
  'Einkommensteuer':      'ESt',
  'Körperschaftsteuer':   'KöSt',
  'Umsatzsteuer':         'USt',
  'Bundesabgabenordnung': 'BAO',
  'EStG':                 'ESt',
  'KStG':                 'KöSt',
  'UStG':                 'USt',
  'BAO':                  'BAO',
};

// ── Helfer ───────────────────────────────────────────────────────────────────

// [[Ziel|Anzeige]] → Anzeige ; [[Ziel]] → Ziel
function cleanWikilinks(text) {
  return text.replace(/\[\[([^\]]+?)\]\]/g, (_, inner) => {
    const parts = inner.split('|');
    return (parts[1] ?? parts[0]).trim();
  });
}

// Sammelt alle Wikilink-Ziele aus einem Text (ohne Alias/Heading-Anker)
function extractWikilinkTargets(text) {
  const out = [];
  for (const m of text.matchAll(/\[\[([^\]]+?)\]\]/g)) {
    let target = m[1].split('|')[0].split('#')[0].trim();
    if (target) out.push(target);
  }
  return out;
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

// Extrahiert den Inhalt des `## Kontrollfragen`-Abschnitts (bis zur nächsten
// `## `-Überschrift oder Dateiende). Gibt null zurück, wenn nicht vorhanden.
function extractKontrollfragenSection(lines) {
  const startIdx = lines.findIndex(l => /^##\s+Kontrollfragen\s*$/.test(l.trim()));
  if (startIdx === -1) return null;
  const body = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i].trim())) break; // nächste H2 beendet den Abschnitt
    body.push(lines[i]);
  }
  return body;
}

// Parst `>[!question]- ...`-Callouts in [{ frage, antwort }]
function parseCallouts(sectionLines) {
  const karten = [];
  let cur = null;
  for (const raw of sectionLines) {
    const m = raw.match(/^>\s*\[!question\]-?\s*(.*)$/);
    if (m) {
      if (cur) karten.push(cur);
      cur = { frage: m[1].trim(), antwortLines: [] };
    } else if (cur && /^>/.test(raw)) {
      cur.antwortLines.push(raw.replace(/^>\s?/, ''));
    } else if (cur) {
      // Erste Zeile, die nicht mit > beginnt → Callout endet
      karten.push(cur);
      cur = null;
    }
  }
  if (cur) karten.push(cur);

  return karten
    .map(k => ({
      frage:   cleanWikilinks(k.frage).trim(),
      antwort: cleanWikilinks(k.antwortLines.join('\n').replace(/\s+$/,'')).trim(),
    }))
    .filter(k => k.frage.length > 0 && k.antwort.length > 0);
}

// ── Hauptlauf ────────────────────────────────────────────────────────────────

const mdFiles = await walk(VAULT);
const generated = [];
let skipped = 0;

// Ausgabeordner frisch aufsetzen
await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

for (const file of mdFiles) {
  const text = await readFile(file, 'utf8');
  const lines = text.split(/\r?\n/);

  const section = extractKontrollfragenSection(lines);
  if (!section) { skipped++; continue; }

  const karten = parseCallouts(section);
  if (karten.length === 0) { skipped++; continue; }

  // Fach = unmittelbarer Elternordner (gemappt auf Kürzel)
  const rel = relative(VAULT, file);
  const parentFolder = rel.split(sep).slice(-2, -1)[0] || 'Allgemein';
  const fach = FACH_MAP[parentFolder] || parentFolder;

  // Thema = H1-Titel (erste `# ...`-Zeile), sonst Dateiname
  const h1 = lines.find(l => /^#\s+/.test(l.trim()));
  const thema = cleanWikilinks(h1 ? h1.replace(/^#\s+/, '').trim() : basename(file, '.md'));

  const themenslug = slugify(thema);
  const fachLower  = slugify(fach);

  const out = {
    fach,
    thema,
    quelle_note: rel.split(sep).join('/'),
    karten: karten.map((k, i) => ({
      id: `${fachLower}-${themenslug}-${String(i + 1).padStart(2, '0')}`,
      frage:   k.frage,
      antwort: k.antwort,
    })),
  };

  const outName = `${fach}_${themenslug}.json`;
  await writeFile(join(OUT_DIR, outName), JSON.stringify(out, null, 2) + '\n', 'utf8');
  generated.push({ outName, fach, thema, n: karten.length });
}

// ── Manifest (Laufzeit-Discovery, da Browser keine Ordner listen kann) ───────
generated.sort((a, b) => a.fach.localeCompare(b.fach) || a.thema.localeCompare(b.thema));
await writeFile(
  join(OUT_DIR, '_manifest.json'),
  JSON.stringify({ dateien: generated.map(g => g.outName) }, null, 2) + '\n',
  'utf8'
);

// ── Graph (Vorgriff Phase 3, KONZEPT.md Punkt 12) ────────────────────────────
// Knoten = jede Note, Kanten = jeder (auflösbare) Wikilink. Wird beim
// Karteikarten-Parsing miterzeugt, damit Phase 3 nicht neu beginnen muss.
const nodes = [];
const byBasename = new Map();   // Dateiname ohne .md → node.id (zur Kantenauflösung)
const linkSources = [];         // { id, targets[] }

for (const file of mdFiles) {
  const text = await readFile(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const rel = relative(VAULT, file);
  const id = rel.split(sep).join('/').replace(/\.md$/, '');
  const base = basename(file, '.md');
  const parentFolder = rel.split(sep).slice(-2, -1)[0] || 'Allgemein';
  const fach = FACH_MAP[parentFolder] || parentFolder;
  const h1 = lines.find(l => /^#\s+/.test(l.trim()));
  const label = cleanWikilinks(h1 ? h1.replace(/^#\s+/, '').trim() : base);

  nodes.push({ id, label, fach, pfad: rel.split(sep).join('/') });
  if (!byBasename.has(base)) byBasename.set(base, id);
  linkSources.push({ id, targets: extractWikilinkTargets(text) });
}

const edgeSet = new Set();
const edges = [];
for (const { id, targets } of linkSources) {
  for (const t of targets) {
    const targetId = byBasename.get(t);
    if (!targetId || targetId === id) continue;   // unauflösbar oder Selbstlink
    const key = `${id} ${targetId}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edges.push({ source: id, target: targetId });
  }
}

await mkdir(VAULT_OUT_DIR, { recursive: true });
await writeFile(
  join(VAULT_OUT_DIR, 'graph.json'),
  JSON.stringify({ nodes, edges }, null, 2) + '\n',
  'utf8'
);

// ── Bericht ──────────────────────────────────────────────────────────────────
console.log(`\nVault: ${VAULT}`);
console.log(`Markdown-Dateien gesamt: ${mdFiles.length}`);
console.log(`Karteikarten-Dateien erzeugt: ${generated.length} (übersprungen: ${skipped})\n`);
let totalCards = 0;
for (const g of generated) {
  totalCards += g.n;
  console.log(`  ${g.fach.padEnd(6)} ${g.thema.padEnd(42)} ${g.n} Karten  → ${g.outName}`);
}
console.log(`\nKarten gesamt: ${totalCards}`);
console.log(`Ausgabeordner: ${OUT_DIR}`);
console.log(`Graph: ${nodes.length} Knoten, ${edges.length} Kanten → ${join(VAULT_OUT_DIR, 'graph.json')}\n`);
