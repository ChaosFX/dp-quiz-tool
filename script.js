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
    items.push(`<div class="dash-item">
      <span class="dash-label">Letzter Test</span>
      <span class="dash-value">${mc.subjects.join(', ')} · <span class="mono">${mc.correct}/${mc.total}</span></span>
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
    const pct = Math.round(e.correct / e.total * 100);
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

$('btn-start').onclick = () => {
  const items = [];
  subjects.forEach(fach => {
    if (!sel[fach.fach]?.on) return;
    const count = Math.min(sel[fach.fach].count, fach.fragen.length);
    shuffle(fach.fragen).slice(0, count).forEach(q => {
      items.push({ qid: q.id || `${fach.fach}-${q.frage.slice(0,20)}`, fach: fach.fach,
        frage: q.frage, erklaerung: q.erklaerung, korrekt: q.korrekt,
        options: shuffle(q.optionen.map((text, oi) => ({ text, oi }))) });
    });
  });
  quiz = { items: shuffle(items), answers: [], i: 0 };
  quiz.answers = quiz.items.map(() => ({ chosen: null, confirmed: false }));
  zeige('quiz'); zeigeFrage();
};

function zeigeFrage() {
  const q = quiz.items[quiz.i], total = quiz.items.length;
  const done = quiz.answers.filter(a => a.confirmed).length;
  const right = quiz.answers.filter((a,i) => a.confirmed && a.chosen !== null && quiz.items[i].options[a.chosen].oi === quiz.items[i].korrekt).length;
  $('meta-pos').textContent  = `Frage ${quiz.i+1} / ${total}`;
  $('fach-pill').textContent = q.fach;
  $('meta-pct').textContent  = done > 0 ? `${Math.round(right/done*100)} % richtig` : '';
  $('progress-fill').style.width = `${(quiz.i/total)*100}%`;
  $('frage-text').textContent = q.frage;
  const liste = $('optionen-liste'); liste.innerHTML = '';
  q.options.forEach((opt, idx) => {
    const b = document.createElement('button');
    b.className = 'option-btn'; b.dataset.idx = idx;
    b.innerHTML = `<div class="opt-badge">${idx+1}</div><div class="opt-text">${opt.text}</div><div class="opt-icon"></div>`;
    b.onclick = () => waehleOption(idx);
    liste.appendChild(b);
  });
  $('erklaerung-box').className = 'hidden';
  $('btn-bestaetigen').textContent = 'Antwort bestätigen';
  $('btn-bestaetigen').disabled = true;
  $('btn-bestaetigen').onclick = bestaetigen;
}
function waehleOption(idx) {
  if (quiz.answers[quiz.i].confirmed) return;
  quiz.answers[quiz.i].chosen = idx;
  document.querySelectorAll('#optionen-liste .option-btn').forEach((b,i)=>b.classList.toggle('selected', i===idx));
  $('btn-bestaetigen').disabled = false;
}
function bestaetigen() {
  const ans = quiz.answers[quiz.i];
  if (ans.chosen === null || ans.confirmed) return;
  ans.confirmed = true;
  const q = quiz.items[quiz.i];
  const ok = q.options[ans.chosen].oi === q.korrekt;
  updateQstat(q.qid, ok);
  document.querySelectorAll('#optionen-liste .option-btn').forEach((btn,i)=>{
    btn.disabled = true; btn.classList.remove('selected');
    const oi = q.options[i].oi;
    if (i === ans.chosen && ok)       { btn.classList.add('correct'); btn.querySelector('.opt-icon').textContent='✓'; }
    else if (i === ans.chosen && !ok) { btn.classList.add('wrong');   btn.querySelector('.opt-icon').textContent='✗'; }
    else if (oi === q.korrekt)        { btn.classList.add('correct'); btn.querySelector('.opt-icon').textContent='✓'; }
    else                              { btn.classList.add('muted'); }
  });
  const box = $('erklaerung-box');
  box.className = ok ? 'erk-ok' : 'erk-no';
  $('verdikt-pill').className = 'verdikt-pill ' + (ok ? 'ok' : 'no');
  $('verdikt-pill').textContent = ok ? 'Richtig' : 'Falsch';
  $('erk-text').textContent = q.erklaerung;
  const last = quiz.i >= quiz.items.length - 1;
  $('btn-bestaetigen').textContent = last ? 'Zur Auswertung' : 'Nächste Frage';
  $('btn-bestaetigen').onclick = weiter;
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
  const correct = quiz.answers.filter((a,i)=>a.confirmed && a.chosen!==null && quiz.items[i].options[a.chosen].oi===quiz.items[i].korrekt).length;
  const pct = Math.round(correct/total*100);
  $('results-pct').textContent = `${pct} %`;
  $('results-pct').style.color = pctColor(pct);
  $('results-count').textContent = `${correct} von ${total} richtig`;

  const fachMap = {};
  quiz.items.forEach((q,i)=>{
    (fachMap[q.fach] ??= { c:0, t:0 }).t++;
    if (quiz.answers[i].chosen!==null && q.options[quiz.answers[i].chosen].oi===q.korrekt) fachMap[q.fach].c++;
  });
  const keys = Object.keys(fachMap);
  if (keys.length > 1) {
    $('fach-balken').classList.remove('hidden');
    $('fach-balken').innerHTML = keys.map(n=>{
      const s=fachMap[n], fp=Math.round(s.c/s.t*100);
      return `<div class="fach-balken-row"><div class="fb-name">${n}</div>
        <div class="fb-bar-wrap"><div class="fb-bar-fill" style="width:${fp}%;background:${pctColor(fp)}"></div></div>
        <div class="fb-score" style="color:${pctColor(fp)}">${s.c}/${s.t}</div></div>`;
    }).join('');
  } else $('fach-balken').classList.add('hidden');

  const falsche = quiz.items.map((q,i)=>({q,a:quiz.answers[i]}))
    .filter(({q,a})=>a.chosen!==null && q.options[a.chosen].oi!==q.korrekt);
  $('success-banner').classList.toggle('hidden', falsche.length !== 0);
  if (falsche.length) {
    $('nachbesprechung').classList.remove('hidden');
    $('nachbesprechung').innerHTML = `<h3>Nachbesprechung · ${falsche.length} falsch</h3>` +
      falsche.map(({q,a})=>`<div class="falsch-karte">
        <div class="fk-fach">${q.fach}</div>
        <div class="fk-frage">${q.frage}</div>
        <div class="fk-antwort"><span class="fk-icon no">✗</span><span class="fk-antwort-text">Deine Antwort: <strong>${q.options[a.chosen].text}</strong></span></div>
        <div class="fk-antwort"><span class="fk-icon ok">✓</span><span class="fk-antwort-text">Richtig: <strong>${q.options.find(o=>o.oi===q.korrekt).text}</strong></span></div>
        <div class="fk-erk">${q.erklaerung}</div></div>`).join('');
  } else $('nachbesprechung').classList.add('hidden');

  saveHistory({ date: Date.now(), subjects: [...new Set(quiz.items.map(q=>q.fach))], total, correct, pct });
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
    const n = parseInt(e.key);
    if (n >= 1 && n <= (quiz.items[quiz.i]?.options.length || 0)) {
      if (!quiz.answers[quiz.i].confirmed) waehleOption(n-1);
    } else if (e.key === 'Enter') {
      if (!quiz.answers[quiz.i].confirmed) { if (quiz.answers[quiz.i].chosen !== null) bestaetigen(); }
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
