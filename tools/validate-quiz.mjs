#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// validate-quiz.mjs
//
// Lint-Skript für die Quiz-JSONs (KONZEPT.md Punkt 4, „Validierung neuer
// Fragen"). Reines Entwicklungs-Hilfsmittel — NICHT Teil der Laufzeit-Logik.
//
// Aufruf:
//   node tools/validate-quiz.mjs                 (prüft data/quiz/quiz_*.json)
//   node tools/validate-quiz.mjs <datei> [...]   (prüft gezielte Dateien)
//
// Exit-Code 1, wenn Fehler gefunden wurden (Warnungen allein → Exit 0).
// ─────────────────────────────────────────────────────────────────────────────

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUIZ_DIR = join(__dirname, '..', 'data', 'quiz');
const TYPEN = ['single','multiple','zuordnung','permutation','luecke'];

const dateien = process.argv.length > 2
  ? process.argv.slice(2)
  : (await readdir(QUIZ_DIR)).filter(f => /^quiz_.+\.json$/.test(f)).sort().map(f => join(QUIZ_DIR, f));

let fehlerGesamt = 0, warnGesamt = 0, fragenGesamt = 0;

for (const pfad of dateien) {
  const fehler = [], warnungen = [];
  let daten;
  try {
    daten = JSON.parse(await readFile(pfad, 'utf8'));
  } catch (e) {
    console.log(`\n✗ ${basename(pfad)}: JSON nicht lesbar — ${e.message}`);
    fehlerGesamt++;
    continue;
  }

  const fragen = Array.isArray(daten.fragen) ? daten.fragen : [];
  if (!daten.fach) warnungen.push('Feld "fach" fehlt');
  if (!fragen.length) warnungen.push('keine Fragen enthalten');

  const gesehen = new Set();
  fragen.forEach((q, idx) => {
    const wo = `#${idx} (id: ${q.id ?? '—'})`;
    const typ = q.typ ?? 'single';

    if (q.typ !== undefined && !TYPEN.includes(q.typ)) fehler.push(`${wo}: unbekannter typ "${q.typ}"`);
    if (!q.id) warnungen.push(`${wo}: keine id`);
    else if (gesehen.has(q.id)) fehler.push(`${wo}: id "${q.id}" ist doppelt`);
    else gesehen.add(q.id);
    if (!q.erklaerung) warnungen.push(`${wo}: keine erklaerung`);

    if (typ === 'single' || typ === 'multiple') {
      if (!Array.isArray(q.optionen) || q.optionen.length < 2) {
        fehler.push(`${wo}: optionen fehlen oder < 2`);
        return;
      }
      const idx_ok = i => Number.isInteger(i) && i >= 0 && i < q.optionen.length;
      if (typ === 'single') {
        // Schema sagt Integer; ein einelementiges Array wird vom Tool
        // toleriert (wird normalisiert) → nur Warnung, kein Fehler.
        let k = q.korrekt;
        if (Array.isArray(k)) {
          if (k.length === 1) { warnungen.push(`${wo}: korrekt als Array [${k[0]}] statt Integer`); k = k[0]; }
          else { fehler.push(`${wo}: single mit ${k.length} korrekten Antworten — typ "multiple" gemeint?`); k = undefined; }
        }
        if (k !== undefined && !idx_ok(k)) fehler.push(`${wo}: korrekt (${k}) ausserhalb von optionen`);
      } else {
        if (!Array.isArray(q.korrekt) || q.korrekt.length === 0) {
          fehler.push(`${wo}: korrekt muss bei multiple ein nicht-leeres Array sein`);
        } else {
          q.korrekt.filter(i => !idx_ok(i)).forEach(i => fehler.push(`${wo}: korrekt-Index ${i} ausserhalb von optionen`));
          if (new Set(q.korrekt).size !== q.korrekt.length) warnungen.push(`${wo}: korrekt enthaelt Duplikate`);
          if (q.korrekt.length === q.optionen.length) warnungen.push(`${wo}: alle Optionen als korrekt markiert — pruefen`);
        }
      }
    }

    else if (typ === 'zuordnung' || typ === 'permutation') {
      if (!Array.isArray(q.kategorien) || !q.kategorien.length) { fehler.push(`${wo}: kategorien fehlen`); return; }
      if (!Array.isArray(q.elemente)   || !q.elemente.length)   { fehler.push(`${wo}: elemente fehlen`);   return; }
      if (!Array.isArray(q.loesung))                            { fehler.push(`${wo}: loesung fehlt`);     return; }
      if (q.loesung.length !== q.elemente.length)
        fehler.push(`${wo}: loesung.length (${q.loesung.length}) != elemente.length (${q.elemente.length})`);
      q.loesung.forEach((k, i) => {
        if (!Number.isInteger(k) || k < 0 || k >= q.kategorien.length)
          fehler.push(`${wo}: loesung[${i}] = ${k} ausserhalb von kategorien (0..${q.kategorien.length-1})`);
      });
      if (typ === 'permutation' && q.kategorien.length !== q.elemente.length)
        warnungen.push(`${wo}: permutation mit kategorien.length (${q.kategorien.length}) != elemente.length (${q.elemente.length})`);
    }

    else if (typ === 'luecke') {
      if (typeof q.text !== 'string' || !q.text) { fehler.push(`${wo}: text fehlt`); return; }
      if (!Array.isArray(q.luecken))             { fehler.push(`${wo}: luecken fehlen`); return; }
      const platzhalter = [...q.text.matchAll(/\{(\d+)\}/g)].map(m => Number(m[1]));
      if (platzhalter.length !== q.luecken.length)
        fehler.push(`${wo}: ${platzhalter.length} Platzhalter im text, aber ${q.luecken.length} luecken`);
      platzhalter.forEach((n, i) => {
        if (n !== i) warnungen.push(`${wo}: Platzhalter an Position ${i} ist {${n}} — erwartet {${i}}`);
      });
      q.luecken.forEach((l, i) => {
        if (!Array.isArray(l.optionen) || l.optionen.length < 2)
          fehler.push(`${wo}: luecken[${i}].optionen fehlen oder < 2`);
        else if (!Number.isInteger(l.loesung) || l.loesung < 0 || l.loesung >= l.optionen.length)
          fehler.push(`${wo}: luecken[${i}].loesung = ${l.loesung} ausserhalb der optionen (0..${l.optionen.length-1})`);
      });
    }
  });

  fragenGesamt += fragen.length;
  fehlerGesamt += fehler.length;
  warnGesamt   += warnungen.length;

  const status = fehler.length ? '✗' : warnungen.length ? '!' : '✓';
  console.log(`\n${status} ${basename(pfad)} — ${fragen.length} Fragen, ${fehler.length} Fehler, ${warnungen.length} Warnungen`);
  fehler.forEach(f    => console.log(`    FEHLER  ${f}`));
  warnungen.slice(0, 15).forEach(w => console.log(`    warnung ${w}`));
  if (warnungen.length > 15) console.log(`    … und ${warnungen.length - 15} weitere Warnungen`);
}

console.log(`\n──\nGeprüft: ${dateien.length} Dateien, ${fragenGesamt} Fragen`);
console.log(`Fehler: ${fehlerGesamt} · Warnungen: ${warnGesamt}\n`);
process.exit(fehlerGesamt > 0 ? 1 : 0);
