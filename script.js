'use strict';

// ── Konfiguration ──────────────────────────────────────────────────────────
const EXAM_DATE = new Date('2026-08-05');

const STORAGE = {
  theme:     'dpquiz_theme',
  history:   'dpquiz_history',     // MC-Testläufe
  qstats:    'dpquiz_qstats',      // MC pro Frage
  fcHistory: 'dpquiz_fc_history',  // Karteikarten-Runden
  fcStats:   'dpquiz_fc_stats',    // Karteikarten pro Karte
};

// Relative Pfade (führendes ./), damit das Tool lokal (localhost) und auf
// GitHub Pages/Netlify ohne Anpassung läuft.
const QUIZ_DIR     = './data/quiz/';
const QUIZ_MANIFEST = './data/quiz/_manifest.json';
const FC_DIR       = './data/karteikarten/';
const FC_MANIFEST  = './data/karteikarten/_manifest.json';

// ── State ──────────────────────────────────────────────────────────────────
let subjects = [];   // MC: [{ fach, fragen[] }]
let sel      = {};   // MC: { fach: { on, count } }
let quiz     = { items: [], answers: [], i: 0 };

let decks    = [];   // FC: [{ file, fach, thema, quelle_note, karten[] }]
let fcGroups = {};   // FC: { fach: { decks[], on, count, themaOn:{file:bool} } }
let fcRound  = { cards: [], i: 0, results: [], flipped: false };

// ── DOM / Utilities ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const screens = {
  landing:    $('screen-landing'),
  start:      $('screen-start'),
  quiz:       $('screen-quiz'),
  auswertung: $('screen-auswertung'),
  fcSelect:   $('screen-fc-select'),
  fcCard:     $('screen-fc-card'),
  fcResults:  $('screen-fc-results'),
};
let activeScreen = 'landing';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pctColor(p) { return p >= 80 ? 'var(--ok)' : p >= 50 ? 'var(--accent)' : 'var(--no)'; }
function datumStr(ts) {
  return new Date(ts).toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function zeige(name) {
  activeScreen = name;
  Object.values(screens).forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
  screens[name].style.display = 'block';
  requestAnimationFrame(() => screens[name].classList.add('active'));
  window.scrollTo(0, 0);
}

// Minimaler Markdown-Renderer für Karteikarten-Antworten
function mdToHtml(src) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const inline = s => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const lines = src.split('\n');
  let html = '', inList = false;
  for (const line of lines) {
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(li[1])}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      if (line.trim()) html += `<p>${inline(line)}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}

// ── localStorage ─────────────────────────────────────────────────────────────
function lsGet(key)  { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; } }
function lsArr(key)  { return lsGet(key) || []; }

function saveHistory(entry)   { const h = lsArr(STORAGE.history);   h.unshift(entry); localStorage.setItem(STORAGE.history,   JSON.stringify(h.slice(0,50))); }
function saveFcHistory(entry) { const h = lsArr(STORAGE.fcHistory); h.unshift(entry); localStorage.setItem(STORAGE.fcHistory, JSON.stringify(h.slice(0,50))); }
function updateQstat(qid, ok) {
  const s = lsGet(STORAGE.qstats) || {};
  if (!s[qid]) s[qid] = { right: 0, wrong: 0 };
  ok ? s[qid].right++ : s[qid].wrong++;
  localStorage.setItem(STORAGE.qstats, JSON.stringify(s));
}
function updateFcStat(cid, known) {
  const s = lsGet(STORAGE.fcStats) || {};
  if (!s[cid]) s[cid] = { known: 0, unknown: 0, last: 0 };
  known ? s[cid].known++ : s[cid].unknown++;
  s[cid].last = Date.now();
  localStorage.setItem(STORAGE.fcStats, JSON.stringify(s));
}

// ── Theme & Header ───────────────────────────────────────────────────────────
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  $('theme-btn').textContent = t === 'dark' ? 'Hell' : 'Dunkel';
  localStorage.setItem(STORAGE.theme, t);
}
function initTheme() {
  const saved = localStorage.getItem(STORAGE.theme);
  const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved || sys);
}
$('theme-btn').onclick = () => applyTheme(
  document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
);
$('wordmark').onclick = () => { zeige('landing'); renderDashboard(); };
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { zeige('landing'); renderDashboard(); });

function updateCountdown() {
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.max(0, Math.round((EXAM_DATE - today) / 86400000));
  $('countdown').innerHTML = `<strong>${diff}</strong> Tage bis 05.08.`;
}

// ── Laden ────────────────────────────────────────────────────────────────────
async function ladeFaecher() {
  const man = await fetch(QUIZ_MANIFEST).then(x => x.ok ? x.json() : null).catch(() => null);
  if (!man || !Array.isArray(man.dateien)) { subjects = []; return; }
  const r = await Promise.allSettled(
    man.dateien.map(f => fetch(`${QUIZ_DIR}${f}`).then(x => { if (!x.ok) throw f; return x.json(); }))
  );
  subjects = r.filter(x => x.status === 'fulfilled').map(x => x.value)
              .filter(d => Array.isArray(d.fragen) && d.fragen.length > 0);
}
async function ladeDecks() {
  const man = await fetch(FC_MANIFEST).then(x => x.ok ? x.json() : null).catch(() => null);
  if (!man || !Array.isArray(man.dateien)) { decks = []; return; }
  const r = await Promise.allSettled(
    man.dateien.map(f => fetch(`${FC_DIR}${f}`).then(x => { if (!x.ok) throw f; return x.json().then(j => ({ ...j, file: f })); }))
  );
  decks = r.filter(x => x.status === 'fulfilled').map(x => x.value)
           .filter(d => Array.isArray(d.karten) && d.karten.length > 0);
}

// ════════════════════════════════════════════════════════════════════════════
//  LANDING
// ════════════════════════════════════════════════════════════════════════════
$('card-mc').onclick = () => { bauStart(); zeige('start'); };
$('card-fc').onclick = () => { bauFcSelect(); zeige('fcSelect'); };

function renderLandingDescs() {
  const totalFragen = subjects.reduce((a, s) => a + s.fragen.length, 0);
  $('mc-desc').textContent = subjects.length
    ? `${totalFragen} Fragen aus ${subjects.length} Fächern`
    : 'Keine Fragen gefunden';
  const totalKarten = decks.reduce((a, d) => a + d.karten.length, 0);
  const faecher = new Set(decks.map(d => d.fach)).size;
  $('fc-desc').textContent = decks.length
    ? `${totalKarten} Karten aus ${faecher} Fächern`
    : 'Keine Karteikarten gefunden';
  if (!decks.length) $('card-fc').classList.add('disabled');
}

function renderDashboard() {
  const mc = lsArr(STORAGE.history)[0];
  const fc = lsArr(STORAGE.fcHistory)[0];
  const dash = $('dashboard');

  if (!mc && !fc) {
    dash.innerHTML = `<div class="dash-empty">Noch keine Lernsession aufgezeichnet — leg los!</div>`;
    return;
  }

  const items = [];
  if (mc) {
    const mcPct = mc.pct ?? Math.round((mc.correct||0)/mc.total*100);
    items.push(`<div class="dash-item">
      <span class="dash-label">Letzter Test</span>
      <span class="dash-value">${mc.subjects.join(', ')} · <span class="mono">${mcPct} %</span></span>
    </div>`);
  }
  if (fc) {
    items.push(`<div class="dash-item">
      <span class="dash-label">Letzte Karteikarten-Runde</span>
      <span class="dash-value">${fc.lastThema || fc.scope.join(', ')} · <span class="mono">${fc.known}/${fc.total} gewusst</span></span>
    </div>`);
  }
  // Zuletzt genutzt (neuere der beiden Sessions)
  const last = [mc, fc].filter(Boolean).sort((a,b) => b.date - a.date)[0];
  if (last) {
    items.push(`<div class="dash-item">
      <span class="dash-label">Zuletzt genutzt</span>
      <span class="dash-value"><span class="mono">${datumStr(last.date)}</span></span>
    </div>`);
  }
  dash.innerHTML = `<div class="dash-grid">${items.join('')}</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  MC-QUIZ
// ════════════════════════════════════════════════════════════════════════════
function bauStart() {
  const liste = $('fach-liste');
  liste.innerHTML = '';
  if (subjects.length === 0) {
    liste.innerHTML = `<div style="color:var(--no);padding:16px 0;font-size:14px">
      Keine Fach-Dateien gefunden. Tool über lokalen HTTP-Server starten
      (<code style="font-family:monospace">python -m http.server 8181</code>).</div>`;
    $('btn-start').disabled = true;
    return;
  }
  subjects.forEach((fach, i) => {
    if (!sel[fach.fach]) sel[fach.fach] = { on: true, count: fach.fragen.length };
    const z = document.createElement('div');
    z.className = 'fach-zeile' + (sel[fach.fach].on ? ' active' : '');
    z.innerHTML = `
      <input type="checkbox" id="cb-${i}" ${sel[fach.fach].on ? 'checked' : ''} />
      <div class="fach-info">
        <div class="fach-name">${fach.fach}</div>
        <div class="fach-meta">${fach.fragen.length} Fragen verfügbar</div>
      </div>
      <input type="number" id="num-${i}" min="1" max="${fach.fragen.length}"
             value="${sel[fach.fach].count}" ${sel[fach.fach].on ? '' : 'disabled'} />`;
    liste.appendChild(z);
    z.querySelector(`#cb-${i}`).onchange = e => {
      sel[fach.fach].on = e.target.checked;
      z.classList.toggle('active', e.target.checked);
      z.querySelector(`#num-${i}`).disabled = !e.target.checked;
      updateStickyBar();
    };
    z.querySelector(`#num-${i}`).oninput = e => {
      sel[fach.fach].count = Math.min(Math.max(1, parseInt(e.target.value) || 1), fach.fragen.length);
      updateStickyBar();
    };
  });
  updateStickyBar();
  bauVerlauf();
}
function updateStickyBar() {
  let f = 0, q = 0;
  subjects.forEach(s => { if (sel[s.fach]?.on) { f++; q += sel[s.fach].count; } });
  $('sticky-label').textContent = q > 0
    ? `${q} Frage${q!==1?'n':''} · ${f} Fach${f!==1?'er':''}` : 'Keine Fächer gewählt';
  $('btn-start').disabled = q === 0;
}
function bauVerlauf() {
  const h = lsArr(STORAGE.history);
  const bereich = $('verlauf-bereich');
  if (!h.length) { bereich.classList.add('hidden'); return; }
  bereich.classList.remove('hidden');
  $('verlauf-liste').innerHTML = h.slice(0, 8).map(e => {
    const pct = e.pct ?? Math.round((e.correct||0) / e.total * 100);
    return `<div class="verlauf-zeile">
      <span class="v-datum">${datumStr(e.date)}</span>
      <span class="v-faecher">${e.subjects.join(', ')}</span>
      <div class="v-bar-wrap"><div class="v-bar-fill" style="width:${pct}%;background:${pctColor(pct)}"></div></div>
      <span class="v-pct" style="color:${pctColor(pct)}">${pct}%</span></div>`;
  }).join('');
}
$('btn-alle-an').onclick = () => { subjects.forEach((f,i)=>{ $(`cb-${i}`).checked=true; sel[f.fach].on=true;
  document.querySelectorAll('#fach-liste .fach-zeile')[i].classList.add('active'); $(`num-${i}`).disabled=false; }); updateStickyBar(); };
$('btn-alle-ab').onclick = () => { subjects.forEach((f,i)=>{ $(`cb-${i}`).checked=false; sel[f.fach].on=false;
  document.querySelectorAll('#fach-liste .fach-zeile')[i].classList.remove('active'); $(`num-${i}`).disabled=true; }); updateStickyBar(); };

const FRAGETYPEN = ['single','multiple','zuordnung','permutation','luecke'];

$('btn-start').onclick = () => {
  const items = [];
  subjects.forEach(fach => {
    if (!sel[fach.fach]?.on) return;
    const count = Math.min(sel[fach.fach].count, fach.fragen.length);
    shuffle(fach.fragen).slice(0, count).forEach(q => {
      // typ ist optional → fehlt es, gilt "single" (Abwärtskompatibilität).
      const typ = FRAGETYPEN.includes(q.typ) ? q.typ : 'single';
      const item = {
        qid: q.id || `${fach.fach}-${(q.frage || q.text || '').slice(0,20)}`,
        fach: fach.fach, typ,
        abschnitt: q.abschnitt || null, thema: q.thema || null,
        frage: q.frage || '', erklaerung: q.erklaerung || '',
      };
      // Je Typ nur die typ-eigenen Felder aufbereiten (Felder existieren
      // je nach Typ unterschiedlich — siehe KONZEPT.md Punkt 4).
      if (typ === 'single' || typ === 'multiple') {
        item.korrektSet = new Set(Array.isArray(q.korrekt) ? q.korrekt : [q.korrekt]);
        item.options = shuffle(q.optionen.map((text, oi) => ({ text, oi })));
      } else if (typ === 'zuordnung' || typ === 'permutation') {
        // Elemente UND Kategorien mischen; originalIndex (oi) wandert mit,
        // loesung bleibt an den ursprünglichen elemente-Index gebunden.
        item.elemente   = shuffle(q.elemente.map((text, oi) => ({ text, oi })));
        item.kategorien = shuffle(q.kategorien.map((text, oi) => ({ text, oi })));
        item.loesung    = q.loesung;
      } else if (typ === 'luecke') {
        // Reihenfolge der Lücken bleibt (an den Fließtext gebunden),
        // nur die Optionen innerhalb einer Lücke werden gemischt.
        item.text = q.text || '';
        item.luecken = (q.luecken || []).map(l => ({
          optionen: shuffle(l.optionen.map((text, oi) => ({ text, oi }))),
          loesung: l.loesung,
        }));
      }
      items.push(item);
    });
  });
  quiz = { items: shuffle(items), answers: [], i: 0 };
  quiz.answers = quiz.items.map(it => {
    const a = { selected: [], confirmed: false };  // selected: Anzeige-Indizes (single/multiple)
    if (it.typ === 'zuordnung' || it.typ === 'permutation') {
      a.zuo = new Array(it.elemente.length).fill(null); // zuo[elementAnzeigeIdx] = kategorieAnzeigeIdx
      a.aktivElement = null;
    } else if (it.typ === 'luecke') {
      a.lueckenWahl = new Array(it.luecken.length).fill(null); // je Lücke: Anzeige-Index der Option
    }
    return a;
  });
  zeige('quiz'); zeigeFrage();
};

// Punktwert einer Frage: 0.0–1.0.
//  Single-Choice: 1 (richtig) oder 0 (falsch).
//  Multiple-Choice: Netto-Score —
//  Punkte = (richtig angekreuzte − falsch angekreuzte) / (alle korrekten Optionen),
//  nie negativ. Falsch angekreuzte Optionen ziehen also Punkte ab, sodass
//  „alles ankreuzen" keine Strategie ist.
//  Beispiel: 3 korrekt, 2 richtige + 1 falsche angekreuzt → (2−1)/3 = 0,33.
//  Zuordnung/Permutation: (korrekt zugeordnete Elemente) / (Elemente gesamt).
//  Lücke: (korrekt befüllte Lücken) / (Lücken gesamt).
function fragePunkte(i) {
  const q = quiz.items[i], a = quiz.answers[i];
  if (!a.confirmed) return 0;
  switch (q.typ) {
    case 'multiple': {
      if (a.selected.length === 0) return 0;
      const richtig = gefundenCount(i);
      const falsch  = a.selected.length - richtig;
      return Math.max(0, (richtig - falsch) / q.korrektSet.size);
    }
    case 'zuordnung':
    case 'permutation':
      return zuoRichtig(i) / q.elemente.length;
    case 'luecke':
      return lueckenRichtig(i) / q.luecken.length;
    default:
      return a.selected.length === 1 && q.korrektSet.has(q.options[a.selected[0]].oi) ? 1 : 0;
  }
}
const istPerfekt = i => fragePunkte(i) === 1;

// Anzahl korrekt angekreuzter Optionen (Zähler für „x/y gefunden")
function gefundenCount(i) {
  const q = quiz.items[i], a = quiz.answers[i];
  const sel = new Set(a.selected.map(d => q.options[d].oi));
  let g = 0; for (const oi of q.korrektSet) if (sel.has(oi)) g++;
  return g;
}

// Ist das Element (Anzeige-Index) korrekt zugeordnet? Prüfung immer über oi.
function zuoElementKorrekt(q, a, elDisp) {
  const katDisp = a.zuo[elDisp];
  if (katDisp === null) return false;
  return q.loesung[q.elemente[elDisp].oi] === q.kategorien[katDisp].oi;
}
function zuoRichtig(i) {
  const q = quiz.items[i], a = quiz.answers[i];
  let ok = 0;
  for (let e = 0; e < q.elemente.length; e++) if (zuoElementKorrekt(q, a, e)) ok++;
  return ok;
}

// Ist die Lücke korrekt befüllt? Prüfung über oi, nicht über Anzeigeposition.
function lueckeKorrekt(q, a, gi) {
  const wahl = a.lueckenWahl[gi];
  if (wahl === null) return false;
  return q.luecken[gi].optionen[wahl].oi === q.luecken[gi].loesung;
}
function lueckenRichtig(i) {
  const q = quiz.items[i], a = quiz.answers[i];
  let ok = 0;
  for (let g = 0; g < q.luecken.length; g++) if (lueckeKorrekt(q, a, g)) ok++;
  return ok;
}

// Ist die Frage vollständig beantwortet (→ „Auswerten" aktivierbar)?
function kannAuswerten(i) {
  const q = quiz.items[i], a = quiz.answers[i];
  if (q.typ === 'zuordnung' || q.typ === 'permutation') return a.zuo.every(v => v !== null);
  if (q.typ === 'luecke') return a.lueckenWahl.every(v => v !== null);
  return a.selected.length > 0;
}

// Punkte hübsch formatieren (4 → "4", 4.5 → "4,5")
function fmtPts(x) {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',');
}

const HINWEIS = {
  multiple:    'Mehrere Antworten möglich — alle richtigen ankreuzen.',
  zuordnung:   'Erst ein Element wählen, dann die passende Kategorie antippen. Zuweisungen sind vor dem Auswerten änderbar.',
  permutation: 'Erst ein Element wählen, dann die passende Kategorie antippen. Zuweisungen sind vor dem Auswerten änderbar.',
  luecke:      'Wähle für jede Lücke die passende Option.',
};

function zeigeFrage() {
  const q = quiz.items[quiz.i], total = quiz.items.length;
  const done = quiz.answers.filter(a => a.confirmed).length;
  const pts  = quiz.answers.reduce((s,a,i) => s + (a.confirmed ? fragePunkte(i) : 0), 0);
  $('meta-pos').textContent  = `Frage ${quiz.i+1} / ${total}`;
  $('fach-pill').textContent = q.fach;
  $('meta-pct').textContent  = done > 0 ? `${Math.round(pts/done*100)} %` : '';
  $('progress-fill').style.width = `${(quiz.i/total)*100}%`;

  // Überschrift: bei „luecke" ist frage optional → thema als Fallback
  const titel = q.frage || q.thema || '';
  $('frage-text').textContent = titel;
  $('frage-text').classList.toggle('hidden', titel === '');

  $('mc-hint').textContent = HINWEIS[q.typ] || '';
  $('mc-hint').classList.toggle('hidden', !HINWEIS[q.typ]);

  // Tastaturhinweis: Zifferntasten gibt es nur bei Wahlfragen
  $('kb-hint-quiz').textContent = (q.typ === 'single' || q.typ === 'multiple')
    ? `1–${Math.min(9, q.options.length)} wählen  ·  Enter bestätigen / weiter`
    : 'Enter auswerten / weiter';

  // Nur den Bereich des aktuellen Typs einblenden
  const istWahl = q.typ === 'single' || q.typ === 'multiple';
  const istZuo  = q.typ === 'zuordnung' || q.typ === 'permutation';
  $('optionen-liste').classList.toggle('hidden', !istWahl);
  $('zuo-bereich').classList.toggle('hidden', !istZuo);
  $('luecke-bereich').classList.toggle('hidden', q.typ !== 'luecke');

  if (istWahl)                 renderWahl();
  else if (istZuo)             renderZuordnung();
  else if (q.typ === 'luecke') renderLuecke();

  $('erklaerung-box').className = 'hidden';
  $('btn-bestaetigen').textContent = q.typ === 'single' ? 'Antwort bestätigen' : 'Auswerten';
  $('btn-bestaetigen').disabled = !kannAuswerten(quiz.i);
  $('btn-bestaetigen').onclick = bestaetigen;
}

// ── single / multiple ───────────────────────────────────────────────────────
function renderWahl() {
  const q = quiz.items[quiz.i], ans = quiz.answers[quiz.i];
  const liste = $('optionen-liste'); liste.innerHTML = '';
  q.options.forEach((opt, idx) => {
    const b = document.createElement('button');
    b.className = 'option-btn' + (q.typ === 'multiple' ? ' multi' : '')
                + (ans.selected.includes(idx) ? ' selected' : '');
    b.dataset.idx = idx;
    b.innerHTML = `<div class="opt-badge">${idx+1}</div><div class="opt-text">${opt.text}</div><div class="opt-icon"></div>`;
    b.onclick = () => waehleOption(idx);
    liste.appendChild(b);
  });
}
function waehleOption(idx) {
  const ans = quiz.answers[quiz.i];
  if (ans.confirmed) return;
  const q = quiz.items[quiz.i];
  if (q.typ === 'multiple') {
    const pos = ans.selected.indexOf(idx);
    if (pos === -1) ans.selected.push(idx); else ans.selected.splice(pos, 1);
  } else {
    ans.selected = [idx]; // Single: exklusiv
  }
  document.querySelectorAll('#optionen-liste .option-btn').forEach((b,i)=>
    b.classList.toggle('selected', ans.selected.includes(i)));
  $('btn-bestaetigen').disabled = !kannAuswerten(quiz.i);
}

// ── zuordnung / permutation ─────────────────────────────────────────────────
function renderZuordnung() {
  const q = quiz.items[quiz.i], ans = quiz.answers[quiz.i];
  const elListe  = $('zuo-elemente');  elListe.innerHTML  = '';
  const katListe = $('zuo-kategorien'); katListe.innerHTML = '';

  q.elemente.forEach((el, ei) => {
    const zugewiesen = ans.zuo[ei];
    const b = document.createElement('button');
    b.className = 'zuo-el' + (ans.aktivElement === ei ? ' aktiv' : '')
                + (zugewiesen !== null ? ' zugewiesen' : '');
    b.innerHTML = `<div class="zuo-el-text">${el.text}</div>` +
      (zugewiesen !== null
        ? `<div class="zuo-el-kat">→ ${q.kategorien[zugewiesen].text}</div>` : '');
    b.onclick = () => {
      if (ans.confirmed) return;
      ans.aktivElement = ans.aktivElement === ei ? null : ei;  // erneut tippen = abwählen
      renderZuordnung();
    };
    elListe.appendChild(b);
  });

  // Wie oft ist eine Kategorie bereits vergeben (für optische Reduktion)
  const belegt = {};
  ans.zuo.forEach(k => { if (k !== null) belegt[k] = (belegt[k]||0) + 1; });

  q.kategorien.forEach((kat, ki) => {
    const b = document.createElement('button');
    // Bei permutation bereits vergebene Kategorien nur optisch reduzieren,
    // NIE deaktivieren — inhaltlich doppelte Kategorien müssen wählbar bleiben.
    b.className = 'zuo-kat' + (q.typ === 'permutation' && belegt[ki] ? ' vergeben' : '');
    b.innerHTML = `<div class="zuo-kat-text">${kat.text}</div>` +
      (belegt[ki] ? `<div class="zuo-kat-count">${belegt[ki]}×</div>` : '');
    b.onclick = () => {
      if (ans.confirmed || ans.aktivElement === null) return;
      ans.zuo[ans.aktivElement] = ki;
      ans.aktivElement = null;
      renderZuordnung();
      $('btn-bestaetigen').disabled = !kannAuswerten(quiz.i);
    };
    katListe.appendChild(b);
  });
}

// ── luecke ──────────────────────────────────────────────────────────────────
// Zerlegt den Text an {0}, {1}, … in Segmente: {typ:'text'|'luecke', ...}
function lueckeSegmente(text) {
  const segs = []; let last = 0;
  for (const m of text.matchAll(/\{(\d+)\}/g)) {
    if (m.index > last) segs.push({ typ: 'text', wert: text.slice(last, m.index) });
    segs.push({ typ: 'luecke', nr: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ typ: 'text', wert: text.slice(last) });
  return segs;
}

function renderLuecke() {
  const q = quiz.items[quiz.i], ans = quiz.answers[quiz.i];
  const wrap = $('luecke-bereich'); wrap.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'luecke-text';

  lueckeSegmente(q.text).forEach(seg => {
    if (seg.typ === 'text') { p.appendChild(document.createTextNode(seg.wert)); return; }
    const l = q.luecken[seg.nr];
    if (!l) { p.appendChild(document.createTextNode(`{${seg.nr}}`)); return; }
    const sel = document.createElement('select');
    sel.className = 'luecke-select';
    sel.innerHTML = `<option value="">— wählen —</option>` +
      l.optionen.map((o,oiDisp)=>`<option value="${oiDisp}">${o.text}</option>`).join('');
    if (ans.lueckenWahl[seg.nr] !== null) sel.value = String(ans.lueckenWahl[seg.nr]);
    sel.onchange = e => {
      if (ans.confirmed) return;
      ans.lueckenWahl[seg.nr] = e.target.value === '' ? null : Number(e.target.value);
      $('btn-bestaetigen').disabled = !kannAuswerten(quiz.i);
    };
    p.appendChild(sel);
  });
  wrap.appendChild(p);
}
function bestaetigen() {
  const ans = quiz.answers[quiz.i];
  if (ans.confirmed || !kannAuswerten(quiz.i)) return;
  ans.confirmed = true;
  const q = quiz.items[quiz.i];
  const pkt = fragePunkte(quiz.i);
  updateQstat(q.qid, pkt === 1);

  let pillText;
  if (q.typ === 'zuordnung' || q.typ === 'permutation') {
    zeigeZuordnungFeedback();
    pillText = `${zuoRichtig(quiz.i)}/${q.elemente.length} richtig zugeordnet · ${Math.round(pkt*100)} %`;
  } else if (q.typ === 'luecke') {
    zeigeLueckeFeedback();
    pillText = `${lueckenRichtig(quiz.i)}/${q.luecken.length} Lücken richtig · ${Math.round(pkt*100)} %`;
  } else {
    document.querySelectorAll('#optionen-liste .option-btn').forEach((btn,i)=>{
      btn.disabled = true; btn.classList.remove('selected');
      const sel = ans.selected.includes(i);
      const korrekt = q.korrektSet.has(q.options[i].oi);
      if (korrekt && sel)       { btn.classList.add('correct'); btn.querySelector('.opt-icon').textContent='✓'; }
      else if (!korrekt && sel) { btn.classList.add('wrong');   btn.querySelector('.opt-icon').textContent='✗'; }
      else if (korrekt && !sel) { btn.classList.add('missed');  btn.querySelector('.opt-icon').textContent='✓'; }
      else                      { btn.classList.add('muted'); }
    });
    pillText = q.typ === 'multiple'
      ? `${gefundenCount(quiz.i)}/${q.korrektSet.size} gefunden · ${Math.round(pkt*100)} %`
      : (pkt === 1 ? 'Richtig' : 'Falsch');
  }

  const stufe = pkt === 1 ? 'ok' : pkt === 0 ? 'no' : 'partial';
  $('erklaerung-box').className = 'erk-' + stufe;
  $('verdikt-pill').className = 'verdikt-pill ' + stufe;
  $('verdikt-pill').textContent = pillText;
  $('erk-text').textContent = q.erklaerung;
  const last = quiz.i >= quiz.items.length - 1;
  $('btn-bestaetigen').textContent = last ? 'Zur Auswertung' : 'Nächste Frage';
  $('btn-bestaetigen').onclick = weiter;
}

// Elemente grün/rot markieren; bei falscher Zuordnung die korrekte Kategorie zeigen
function zeigeZuordnungFeedback() {
  const q = quiz.items[quiz.i], ans = quiz.answers[quiz.i];
  const elListe = $('zuo-elemente'); elListe.innerHTML = '';
  q.elemente.forEach((el, ei) => {
    const ok = zuoElementKorrekt(q, ans, ei);
    const gewaehlt = ans.zuo[ei] !== null ? q.kategorien[ans.zuo[ei]].text : '—';
    const richtigeKat = q.kategorien.find(k => k.oi === q.loesung[el.oi]);
    const div = document.createElement('div');
    div.className = 'zuo-el ergebnis ' + (ok ? 'correct' : 'wrong');
    div.innerHTML = `<div class="zuo-el-text">${ok ? '✓' : '✗'} ${el.text}</div>
      <div class="zuo-el-kat">→ ${gewaehlt}</div>` +
      (ok ? '' : `<div class="zuo-el-loesung">Richtig: ${richtigeKat ? richtigeKat.text : '—'}</div>`);
    elListe.appendChild(div);
  });
  // Kategorienspalte nach dem Auswerten nicht mehr anklickbar
  $('zuo-kategorien').querySelectorAll('.zuo-kat').forEach(b => { b.disabled = true; b.classList.add('muted'); });
}

// Jede Lücke im Fließtext grün/rot; bei falscher Wahl die richtige Option zeigen
function zeigeLueckeFeedback() {
  const q = quiz.items[quiz.i], ans = quiz.answers[quiz.i];
  const wrap = $('luecke-bereich'); wrap.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'luecke-text';
  lueckeSegmente(q.text).forEach(seg => {
    if (seg.typ === 'text') { p.appendChild(document.createTextNode(seg.wert)); return; }
    const l = q.luecken[seg.nr];
    if (!l) return;
    const ok = lueckeKorrekt(q, ans, seg.nr);
    const wahl = ans.lueckenWahl[seg.nr];
    const gewaehlt = wahl !== null ? l.optionen[wahl].text : '—';
    const richtig = l.optionen.find(o => o.oi === l.loesung);
    const span = document.createElement('span');
    span.className = 'luecke-ergebnis ' + (ok ? 'correct' : 'wrong');
    span.innerHTML = `${ok ? '✓' : '✗'} ${gewaehlt}` +
      (ok ? '' : ` <span class="luecke-richtig">(richtig: ${richtig ? richtig.text : '—'})</span>`);
    p.appendChild(span);
  });
  wrap.appendChild(p);
}
function weiter() {
  quiz.i++;
  if (quiz.i >= quiz.items.length) zeigeAuswertung();
  else { zeige('quiz'); zeigeFrage(); }
}
$('btn-abbrechen').onclick = () => { if (confirm('Test abbrechen? Der Fortschritt geht verloren.')) { zeige('landing'); renderDashboard(); } };

function zeigeAuswertung() {
  zeige('auswertung');
  const total = quiz.items.length;
  const punkte = quiz.items.reduce((s,_,i) => s + fragePunkte(i), 0);
  const pct = Math.round(punkte/total*100);

  // Verteilung: vollständig richtig (1.0) / teilweise (0<p<1) / falsch (0)
  let voll = 0, teil = 0, falsch = 0;
  quiz.items.forEach((_,i)=>{ const p = fragePunkte(i); if (p === 1) voll++; else if (p === 0) falsch++; else teil++; });

  $('results-pct').textContent = `${pct} %`;
  $('results-pct').style.color = pctColor(pct);
  $('results-count').textContent = `${voll} vollständig · ${teil} teilweise · ${falsch} falsch`;

  // Aufschlüsselung nach Fach und (falls vorhanden) Abschnitt — punktebasiert
  const fachMap = {};
  quiz.items.forEach((q,i)=>{
    const f = (fachMap[q.fach] ??= { pts:0, t:0, abschnitte:{} });
    const p = fragePunkte(i); f.t++; f.pts += p;
    if (q.abschnitt) { const ab = (f.abschnitte[q.abschnitt] ??= { pts:0, t:0 }); ab.t++; ab.pts += p; }
  });
  const keys = Object.keys(fachMap);
  const hatAbschnitte = keys.some(n => Object.keys(fachMap[n].abschnitte).length > 0);

  const balkenRow = (name, s, sub=false) => {
    const pr = Math.round(s.pts/s.t*100);
    return `<div class="fach-balken-row${sub?' fb-sub':''}"><div class="fb-name">${name}</div>
      <div class="fb-bar-wrap"><div class="fb-bar-fill" style="width:${pr}%;background:${pctColor(pr)}"></div></div>
      <div class="fb-score" style="color:${pctColor(pr)}">${fmtPts(s.pts)}/${s.t}</div></div>`;
  };

  if (keys.length > 1 || hatAbschnitte) {
    $('fach-balken').classList.remove('hidden');
    $('fach-balken').innerHTML = keys.map(n => {
      const f = fachMap[n];
      let rows = (keys.length > 1) ? balkenRow(n, f) : '';
      const absKeys = Object.keys(f.abschnitte).sort((a,b)=>a.localeCompare(b,'de',{numeric:true}));
      rows += absKeys.map(ab => balkenRow(ab, f.abschnitte[ab], keys.length > 1)).join('');
      return rows;
    }).join('');
  } else $('fach-balken').classList.add('hidden');

  // Nicht perfekt beantwortete Fragen (Partial Credit < 1.0)
  const offene = quiz.items.map((q,i)=>({ q, a: quiz.answers[i], i })).filter(({i})=>!istPerfekt(i));
  $('success-banner').classList.toggle('hidden', offene.length !== 0);
  if (offene.length) {
    $('nachbesprechung').classList.remove('hidden');
    $('nachbesprechung').innerHTML = `<h3>Nachbesprechung · ${offene.length} nicht perfekt</h3>` +
      offene.map(({q,a,i})=>{
        let body;
        if (q.typ === 'zuordnung' || q.typ === 'permutation') {
          const rows = q.elemente.map((el, ei) => {
            const ok = zuoElementKorrekt(q, a, ei);
            const gewaehlt = a.zuo[ei] !== null ? q.kategorien[a.zuo[ei]].text : '—';
            const richtigeKat = q.kategorien.find(k => k.oi === q.loesung[el.oi]);
            return `<div class="fk-antwort"><span class="fk-icon ${ok?'ok':'no'}">${ok?'✓':'✗'}</span>
              <span class="fk-antwort-text">${el.text} → <strong>${gewaehlt}</strong>` +
              (ok ? '' : ` <span class="fk-korrektur">(richtig: ${richtigeKat ? richtigeKat.text : '—'})</span>`) +
              `</span></div>`;
          }).join('');
          body = `<div class="fk-label">${zuoRichtig(i)}/${q.elemente.length} richtig zugeordnet · ${Math.round(fragePunkte(i)*100)} %</div>${rows}`;
        } else if (q.typ === 'luecke') {
          const rows = q.luecken.map((l, gi) => {
            const ok = lueckeKorrekt(q, a, gi);
            const gewaehlt = a.lueckenWahl[gi] !== null ? l.optionen[a.lueckenWahl[gi]].text : '—';
            const richtig = l.optionen.find(o => o.oi === l.loesung);
            return `<div class="fk-antwort"><span class="fk-icon ${ok?'ok':'no'}">${ok?'✓':'✗'}</span>
              <span class="fk-antwort-text">Lücke ${gi+1}: <strong>${gewaehlt}</strong>` +
              (ok ? '' : ` <span class="fk-korrektur">(richtig: ${richtig ? richtig.text : '—'})</span>`) +
              `</span></div>`;
          }).join('');
          body = `<div class="fk-label">${lueckenRichtig(i)}/${q.luecken.length} Lücken richtig · ${Math.round(fragePunkte(i)*100)} %</div>
                  <div class="fk-luecketext">${q.text.replace(/\{(\d+)\}/g, (_,n)=>{
                    const l = q.luecken[Number(n)];
                    if (!l) return '___';
                    const ok = lueckeKorrekt(q, a, Number(n));
                    const gewaehlt = a.lueckenWahl[Number(n)] !== null ? l.optionen[a.lueckenWahl[Number(n)]].text : '—';
                    return `<span class="luecke-ergebnis ${ok?'correct':'wrong'}">${gewaehlt}</span>`;
                  })}</div>${rows}`;
        } else if (q.typ === 'multiple') {
          const sel = new Set(a.selected.map(d=>q.options[d].oi));
          const rows = q.options.map(o=>{
            const korrekt = q.korrektSet.has(o.oi), checked = sel.has(o.oi);
            let icon='·', cls='neutral', extra='';
            if (korrekt && checked)       { icon='✓'; cls='ok'; }
            else if (korrekt && !checked) { icon='✓'; cls='warn'; extra=' (vergessen)'; }
            else if (!korrekt && checked) { icon='✗'; cls='no';  extra=' (falsch angekreuzt)'; }
            return `<div class="fk-antwort"><span class="fk-icon ${cls}">${icon}</span><span class="fk-antwort-text">${o.text}${extra}</span></div>`;
          }).join('');
          body = `<div class="fk-label">${gefundenCount(i)}/${q.korrektSet.size} gefunden · ${Math.round(fragePunkte(i)*100)} %</div>${rows}`;
        } else {
          const o = q.options[a.selected[0]];
          body = `<div class="fk-antwort"><span class="fk-icon no">✗</span><span class="fk-antwort-text">Deine Antwort: <strong>${o.text}</strong></span></div>
                  <div class="fk-antwort"><span class="fk-icon ok">✓</span><span class="fk-antwort-text">Richtig: <strong>${q.options.find(x=>q.korrektSet.has(x.oi)).text}</strong></span></div>`;
        }
        return `<div class="falsch-karte">
          <div class="fk-fach">${q.fach}${q.abschnitt?` · ${q.abschnitt}`:''}${q.thema?` · ${q.thema}`:''}</div>
          <div class="fk-frage">${q.frage || q.thema || ''}</div>
          ${body}
          <div class="fk-erk">${q.erklaerung}</div></div>`;
      }).join('');
  } else $('nachbesprechung').classList.add('hidden');

  saveHistory({ date: Date.now(), subjects: [...new Set(quiz.items.map(q=>q.fach))],
    total, pct, voll, teil, falsch });
}
$('btn-neu').onclick = () => { bauStart(); zeige('start'); };

// ════════════════════════════════════════════════════════════════════════════
//  KARTEIKARTEN
// ════════════════════════════════════════════════════════════════════════════
function initFcGroups() {
  fcGroups = {};
  decks.forEach(d => {
    const g = (fcGroups[d.fach] ??= { decks: [], on: true, count: 0, themaOn: {} });
    g.decks.push(d);
    g.themaOn[d.file] = true;
  });
  Object.values(fcGroups).forEach(g => g.count = fcAvailable(g));
}
function fcAvailable(g) {
  return g.decks.filter(d => g.themaOn[d.file]).reduce((a,d)=>a+d.karten.length, 0);
}
function bauFcSelect() {
  if (!Object.keys(fcGroups).length) initFcGroups();
  const liste = $('fc-fach-liste'); liste.innerHTML = '';
  if (!decks.length) {
    liste.innerHTML = `<div style="color:var(--no);padding:16px 0;font-size:14px">
      Keine Karteikarten gefunden. Erst <code style="font-family:monospace">node tools/parse-karteikarten.mjs</code> ausführen.</div>`;
    $('fc-start').disabled = true; return;
  }
  Object.entries(fcGroups).forEach(([fach, g], gi) => {
    const avail = fcAvailable(g);
    const wrap = document.createElement('div');
    wrap.className = 'fc-fach-gruppe' + (g.on ? ' active' : '');
    wrap.innerHTML = `
      <div class="fc-fach-head">
        <input type="checkbox" id="fcb-${gi}" ${g.on ? 'checked' : ''} />
        <div class="fach-info">
          <div class="fach-name">${fach}</div>
          <div class="fach-meta">${g.decks.length} Themen · ${avail} Karten</div>
        </div>
        <button class="fc-themen-toggle" id="ftt-${gi}">Themen ▾</button>
        <input type="number" id="fnum-${gi}" min="1" max="${avail}" value="${Math.min(g.count, avail)}" ${g.on ? '' : 'disabled'} />
      </div>
      <div class="fc-themen-liste" id="ftl-${gi}">
        ${g.decks.map((d,di)=>`<label class="fc-thema-row">
          <input type="checkbox" id="ft-${gi}-${di}" ${g.themaOn[d.file] ? 'checked' : ''} />
          <span>${d.thema}</span><span class="t-meta">${d.karten.length}</span>
        </label>`).join('')}
      </div>`;
    liste.appendChild(wrap);

    wrap.querySelector(`#fcb-${gi}`).onchange = e => {
      g.on = e.target.checked;
      wrap.classList.toggle('active', g.on);
      wrap.querySelector(`#fnum-${gi}`).disabled = !g.on;
      updateFcSticky();
    };
    wrap.querySelector(`#ftt-${gi}`).onclick = () => wrap.querySelector(`#ftl-${gi}`).classList.toggle('open');
    wrap.querySelector(`#fnum-${gi}`).oninput = e => {
      g.count = Math.min(Math.max(1, parseInt(e.target.value)||1), fcAvailable(g));
      updateFcSticky();
    };
    g.decks.forEach((d,di) => {
      wrap.querySelector(`#ft-${gi}-${di}`).onchange = e => {
        g.themaOn[d.file] = e.target.checked;
        const a = fcAvailable(g);
        const num = wrap.querySelector(`#fnum-${gi}`);
        num.max = a; g.count = Math.min(g.count, a) || (a ? 1 : 0); num.value = g.count;
        wrap.querySelector('.fach-meta').textContent = `${g.decks.length} Themen · ${a} Karten`;
        updateFcSticky();
      };
    });
  });
  updateFcSticky();
  bauFcVerlauf();
}
function updateFcSticky() {
  let themen = 0, karten = 0;
  Object.values(fcGroups).forEach(g => {
    if (!g.on) return;
    const a = fcAvailable(g);
    if (a === 0) return;
    themen += g.decks.filter(d => g.themaOn[d.file]).length;
    karten += Math.min(g.count, a);
  });
  $('fc-sticky-label').textContent = karten > 0
    ? `${karten} Karte${karten!==1?'n':''} · ${themen} Thema${themen!==1?'-Auswahl':''}`.replace('Thema-Auswahl','Themen')
    : 'Keine Themen gewählt';
  $('fc-start').disabled = karten === 0;
}
function bauFcVerlauf() {
  const h = lsArr(STORAGE.fcHistory);
  const bereich = $('fc-verlauf-bereich');
  if (!h.length) { bereich.classList.add('hidden'); return; }
  bereich.classList.remove('hidden');
  $('fc-verlauf-liste').innerHTML = h.slice(0,8).map(e=>{
    const pct = Math.round(e.known/e.total*100);
    return `<div class="verlauf-zeile">
      <span class="v-datum">${datumStr(e.date)}</span>
      <span class="v-faecher">${e.scope.join(', ')}</span>
      <div class="v-bar-wrap"><div class="v-bar-fill" style="width:${pct}%;background:${pctColor(pct)}"></div></div>
      <span class="v-pct" style="color:${pctColor(pct)}">${e.known}/${e.total}</span></div>`;
  }).join('');
}
$('fc-alle-an').onclick = () => { Object.values(fcGroups).forEach(g=>g.on=true); bauFcSelect(); };
$('fc-alle-ab').onclick = () => { Object.values(fcGroups).forEach(g=>g.on=false); bauFcSelect(); };

$('fc-start').onclick = () => {
  const pool = [];
  Object.entries(fcGroups).forEach(([fach, g]) => {
    if (!g.on) return;
    const cards = [];
    g.decks.filter(d => g.themaOn[d.file]).forEach(d =>
      d.karten.forEach(k => cards.push({ cid: k.id, fach, thema: d.thema, frage: k.frage, antwort: k.antwort })));
    shuffle(cards).slice(0, Math.min(g.count, cards.length)).forEach(c => pool.push(c));
  });
  if (!pool.length) return;
  fcRound = { cards: shuffle(pool), i: 0, results: [], flipped: false };
  zeige('fcCard'); zeigeKarte();
};

function zeigeKarte() {
  const c = fcRound.cards[fcRound.i], total = fcRound.cards.length;
  fcRound.flipped = false;
  $('fc-pos').textContent = `Karte ${fcRound.i+1} / ${total}`;
  $('fc-fach-pill').textContent = c.fach;
  $('fc-thema').textContent = c.thema;
  $('fc-progress').style.width = `${(fcRound.i/total)*100}%`;
  $('fc-seite-label').textContent = 'Frage';
  $('fc-inhalt').className = 'fc-inhalt frage';
  $('fc-inhalt').textContent = c.frage;
  $('fc-flip-hint').classList.remove('hidden');
  $('fc-aufdecken').classList.remove('hidden');
  $('fc-bewertung').classList.add('hidden');
  $('flashcard').classList.remove('flipped');
  $('fc-kb-hint').textContent = 'Leertaste aufdecken';
}
function aufdecken() {
  if (fcRound.flipped) return;
  fcRound.flipped = true;
  const c = fcRound.cards[fcRound.i];
  $('fc-seite-label').textContent = 'Antwort';
  $('fc-inhalt').className = 'fc-inhalt';
  $('fc-inhalt').innerHTML = mdToHtml(c.antwort);
  $('fc-flip-hint').classList.add('hidden');
  $('fc-aufdecken').classList.add('hidden');
  $('fc-bewertung').classList.remove('hidden');
  $('flashcard').classList.add('flipped');
  $('fc-kb-hint').textContent = '← nicht gewusst  ·  → gewusst';
}
function bewerten(known) {
  if (!fcRound.flipped) return;
  const c = fcRound.cards[fcRound.i];
  fcRound.results[fcRound.i] = known;
  updateFcStat(c.cid, known);
  fcRound.i++;
  if (fcRound.i >= fcRound.cards.length) zeigeFcResults();
  else { zeige('fcCard'); zeigeKarte(); }
}
$('flashcard').onclick = aufdecken;
$('fc-aufdecken').onclick = aufdecken;
$('fc-gewusst').onclick = () => bewerten(true);
$('fc-nicht').onclick   = () => bewerten(false);
$('fc-abbrechen').onclick = () => { if (confirm('Runde abbrechen? Der Fortschritt geht verloren.')) { zeige('landing'); renderDashboard(); } };

function zeigeFcResults() {
  zeige('fcResults');
  const total = fcRound.cards.length;
  const known = fcRound.results.filter(Boolean).length;
  const pct = Math.round(known/total*100);
  $('fc-res-pct').textContent = `${known} / ${total}`;
  $('fc-res-pct').style.color = pctColor(pct);
  $('fc-res-count').textContent = `${pct} % gewusst`;

  const nicht = fcRound.cards.filter((_,i)=>fcRound.results[i] === false);
  $('fc-success').classList.toggle('hidden', nicht.length !== 0);
  if (nicht.length) {
    $('fc-nachschau').classList.remove('hidden');
    $('fc-nachschau').innerHTML = `<h3 style="font-family:'Space Grotesk';font-size:18px;font-weight:600;margin-bottom:14px">Nochmal ansehen · ${nicht.length}</h3>` +
      nicht.map(c=>`<div class="nachschau-karte">
        <div class="nk-fach">${c.fach} · ${c.thema}</div>
        <div class="nk-frage">${c.frage}</div>
        <div class="nk-antwort">${mdToHtml(c.antwort)}</div></div>`).join('');
  } else $('fc-nachschau').classList.add('hidden');

  saveFcHistory({
    date: Date.now(),
    scope: [...new Set(fcRound.cards.map(c=>c.fach))],
    lastThema: [...new Set(fcRound.cards.map(c=>c.thema))].length === 1 ? fcRound.cards[0].thema : null,
    known, total, pct,
  });
}
$('fc-neu').onclick = () => { bauFcSelect(); zeige('fcSelect'); };

// ── Globale Tastatur ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (activeScreen === 'quiz') {
    const q = quiz.items[quiz.i], ans = quiz.answers[quiz.i];
    const istWahl = q && (q.typ === 'single' || q.typ === 'multiple');
    const n = parseInt(e.key);
    if (istWahl && n >= 1 && n <= q.options.length) {
      if (!ans.confirmed) waehleOption(n-1);  // single: exklusiv, multiple: umschalten
    } else if (e.key === 'Enter') {
      if (!ans.confirmed) { if (kannAuswerten(quiz.i)) bestaetigen(); }
      else weiter();
    }
  } else if (activeScreen === 'fcCard') {
    if (!fcRound.flipped && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); aufdecken(); }
    else if (fcRound.flipped) {
      if (e.key === 'ArrowRight' || e.key === '1') bewerten(true);
      else if (e.key === 'ArrowLeft' || e.key === '2') bewerten(false);
    }
  }
});

// ── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  initTheme();
  updateCountdown();
  await Promise.all([ladeFaecher(), ladeDecks()]);
  renderLandingDescs();
  renderDashboard();
  zeige('landing');
})();
