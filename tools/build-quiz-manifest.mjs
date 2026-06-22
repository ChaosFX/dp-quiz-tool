#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// build-quiz-manifest.mjs
//
// Erzeugt data/quiz/_manifest.json mit der Liste aller quiz_*.json-Dateien.
// Da der Browser keinen Ordner auflisten kann, liest das Tool zur Laufzeit
// dieses Manifest. Neues Fach hinzufügen = quiz_<Fach>.json ablegen und dieses
// Skript einmal ausführen — keine Code-Änderung nötig.
//
//   node tools/build-quiz-manifest.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUIZ_DIR = join(__dirname, '..', 'data', 'quiz');

const dateien = (await readdir(QUIZ_DIR))
  .filter(f => /^quiz_.+\.json$/.test(f))
  .sort();

await writeFile(
  join(QUIZ_DIR, '_manifest.json'),
  JSON.stringify({ dateien }, null, 2) + '\n',
  'utf8'
);

console.log(`data/quiz/_manifest.json geschrieben: ${dateien.length} Fächer`);
for (const f of dateien) console.log(`  ${f}`);
