/*
 * app.js — screens, rendering, and the exercise loop.
 *
 * Plain DOM, no framework. The whole app is four screens and one loop; a framework
 * would add a build step and a dependency tree to a project whose real complexity
 * lives in phonology.js, not in rendering.
 */

import { UNITS, CONCEPTS, LEXEMES, stemOf, isInflectable } from './lexicon.js';
import { PARADIGMS, CLASS, classLabel, inflect, explain } from './phonology.js';
import { grade, diffMarks, KAZAKH_LETTERS, normalize } from './grader.js';
import { RATING, ratingFor, strength } from './srs.js';
import * as store from './store.js';
import { buildSession, buildReviewSession, dueCount, SessionRunner, TYPE } from './session.js';
import { t, toScript, renderMixed } from './i18n.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) {
    if (k == null || k === false) continue;
    n.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return n;
};

const lang = () => store.getProfile().uiLang;
const script = () => store.getProfile().script;
/** Render a Kazakh string in the learner's chosen script. */
const kk = (s) => toScript(s, script());
/** Prose that mixes interface language with {{Kazakh}} spans. */
const mixed = (s) => renderMixed(s, script());
const T = (key) => t(lang(), key);

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */

let currentScreen = 'home';

function show(screen) {
  // "review" is an action, not a screen — it starts a cross-unit session.
  if (screen === 'review') { startReview(); return; }
  currentScreen = screen;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(`#screen-${screen}`)?.classList.add('active');
  $('#nav').hidden = screen === 'session';
  document.querySelectorAll('#nav button').forEach((b) =>
    b.setAttribute('aria-current', b.dataset.screen === screen ? 'page' : 'false'));

  if (screen === 'home') renderHome();
  if (screen === 'grammar') renderGrammar();
  if (screen === 'profile') renderProfile();
}

$('#nav').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-screen]');
  if (btn) show(btn.dataset.screen);
});

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */

function renderHeader() {
  const daily = store.dailyState();
  $('#hdr-streak').querySelector('span').textContent = store.currentStreak();
  $('#hdr-xp').querySelector('span').textContent = store.getState().xp;

  const pct = Math.min(1, daily.goal ? daily.xp / daily.goal : 0);
  const circumference = 2 * Math.PI * 15;
  $('#hdr-ring .fill').setAttribute('stroke-dasharray', `${pct * circumference} ${circumference}`);

  const due = dueCount();
  const badge = $('#due-badge');
  badge.hidden = due === 0;
  badge.textContent = due > 99 ? '99+' : due;

  document.documentElement.lang = lang();
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = T(n.dataset.i18n); });
  $('#grammar-title').textContent = T('grammar');
  $('#profile-title').textContent = T('profile');
}

/* ------------------------------------------------------------------ *
 * Home — the unit path
 * ------------------------------------------------------------------ */

function renderHome() {
  renderHeader();
  const body = $('#home-body');
  body.replaceChildren();

  const daily = store.dailyState();
  body.append(
    el('div', { className: 'card hero' },
      el('div', { className: 'unit-icon' }, daily.met ? '✅' : '🎯'),
      el('div', { className: 'hero-body' },
        el('h2', {}, `${T('dailyGoal')}: ${daily.xp} / ${daily.goal} XP`),
        el('p', {}, daily.met
          ? (lang() === 'ru' ? 'Цель выполнена — серия засчитана.' : 'Goal met — streak counted.')
          : (lang() === 'ru' ? `Ещё ${daily.goal - daily.xp} XP до серии.` : `${daily.goal - daily.xp} XP to keep the streak.`)),
        el('div', { className: 'bar' }, el('i', { style: `width:${Math.min(100, daily.xp / daily.goal * 100)}%` })),
      ),
    ),
    el('div', { className: 'section-label' }, lang() === 'ru' ? 'Блоки' : 'Units'),
  );

  UNITS.forEach((unit, i) => {
    const skills = ['vocab', ...unit.drills];
    const progress = store.unitProgress(unit, skills);
    // Gate on the previous unit reaching 60% retention, not on mere completion.
    const prev = UNITS[i - 1];
    const locked = prev ? store.unitProgress(prev, ['vocab', ...prev.drills]) < 0.6 : false;

    const due = unit.lexemes.reduce((n, lx) => {
      for (const skill of skills) {
        if (skill !== 'vocab' && !isInflectable(lx)) continue;
        const m = store.getMemory(lx.id, skill);
        if (m.reps && m.due <= Date.now()) n++;
      }
      return n;
    }, 0);

    const btn = el('button', { className: 'unit', disabled: locked },
      el('div', { className: 'unit-icon' }, locked ? '🔒' : unit.icon),
      el('div', { className: 'unit-body' },
        el('div', { className: 'unit-title' },
          `${unit.order}. ${unit.title[lang()] ?? unit.title.en}`),
        el('div', { className: 'unit-sub kk' },
          locked ? T('unitLocked')
                 : `${unit.title.kk} · ${Math.round(progress * 100)}% ${T('unitProgress')}`),
        !locked && el('div', { className: 'bar' }, el('i', { style: `width:${progress * 100}%` })),
      ),
      due > 0 && !locked ? el('span', { className: 'chip due' }, `${due} ${T('dueNow')}`) : null,
    );
    if (!locked) btn.addEventListener('click', () => startUnit(unit.id));
    body.append(btn);
  });

  body.append(el('p', {
    style: 'font-size:12px;color:var(--ink-3);text-align:center;margin:20px 0 8px;line-height:1.6',
  }, lang() === 'ru'
    ? 'Прогресс считается по удержанию в памяти, а не по числу пройденных экранов.'
    : 'Progress is measured by retention, not by screens completed.'));
}

/* ------------------------------------------------------------------ *
 * Session loop
 * ------------------------------------------------------------------ */

let runner = null;
let phase = 'answering';   // answering | checked
let selected = null;
let shownAt = 0;
let lastGrade = null;
let retried = false;

function startUnit(unitId) {
  store.markUnitStarted(unitId);
  const built = buildSession(unitId, { lang: lang() });
  if (!built.queue.length) { show('home'); return; }
  runner = new SessionRunner(built, { lang: lang() });
  show('session');
  currentScreen = 'session';
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $('#screen-session').classList.add('active');
  $('#nav').hidden = true;
  nextQuestion();
}

function startReview() {
  const built = buildReviewSession({ lang: lang() });
  if (!built.queue.length) {
    toast(T('noDue'));
    return;
  }
  runner = new SessionRunner(built, { lang: lang() });
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $('#screen-session').classList.add('active');
  $('#nav').hidden = true;
  currentScreen = 'session';
  nextQuestion();
}

$('#session-close').addEventListener('click', () => { runner = null; show('home'); });

function nextQuestion() {
  if (!runner) return;
  if (runner.done) { renderDone(); return; }

  phase = 'answering';
  selected = null;
  lastGrade = null;
  retried = false;
  shownAt = performance.now();

  const ex = runner.current;
  // Show the concept card the first time a grammar skill appears.
  if (ex.skill !== 'vocab' && !store.hasSeenConcept(ex.skill) && CONCEPTS[ex.skill]) {
    renderConcept(ex.skill);
    return;
  }
  renderQuestion(ex);
}

$('#session-progress').style.width = '0%';

function updateProgress() {
  $('#session-progress').style.width = `${runner.progress * 100}%`;
  $('#session-xp').textContent = runner.xp;
}

/** Concept card: the rule, once, before its first drill. */
function renderConcept(skill) {
  const c = CONCEPTS[skill];
  const p = PARADIGMS[skill];
  const body = $('#q-body');
  body.replaceChildren(
    el('div', { className: 'q-kind' }, lang() === 'ru' ? 'Новое правило' : 'New rule'),
    el('div', { className: 'q-prompt small' }, c.title[lang()] ?? c.title.en),
    el('p', { className: 'q-sub' }, mixed(c.body[lang()] ?? c.body.en)),
    p ? allomorphTable(skill) : null,
  );
  const bar = $('#action-bar');
  bar.className = 'actionbar';
  bar.replaceChildren(el('button', { className: 'btn' }, T('got')));
  bar.querySelector('button').addEventListener('click', () => {
    store.markConceptSeen(skill);
    renderQuestion(runner.current);
  }, { once: true });
}

function renderQuestion(ex) {
  updateProgress();
  const body = $('#q-body');
  body.replaceChildren();

  const kindLabel = {
    [TYPE.RECOGNIZE]: T('chooseTranslation'),
    [TYPE.PRODUCE]: T('chooseWord'),
    [TYPE.TYPE_KK]: T('typeHere'),
    [TYPE.SUFFIX_MC]: T('chooseSuffix'),
    [TYPE.SUFFIX_TYPE]: T('typeFull'),
  }[ex.type];

  body.append(el('div', { className: 'q-kind' }, kindLabel));

  if (ex.type === TYPE.SUFFIX_MC || ex.type === TYPE.SUFFIX_TYPE) {
    const p = PARADIGMS[ex.skill];
    body.append(
      el('div', { className: 'q-sub', style: 'margin-bottom:14px' },
        `${p.name[lang()] ?? p.name.en} · ${ex.lexeme[lang()] ?? ex.lexeme.en}`),
      el('div', { className: 'slot-line kk' },
        el('span', {}, kk(ex.prompt)),
        ex.type === TYPE.SUFFIX_MC
          ? el('span', { className: 'slot', id: 'slot' }, '—')
          : null,
      ),
    );
  } else {
    body.append(el('div', { className: `q-prompt ${ex.prompt.length > 14 ? 'small' : ''} kk` },
      ex.type === TYPE.RECOGNIZE ? kk(ex.prompt) : ex.prompt));
    if (ex.type === TYPE.RECOGNIZE) {
      body.append(el('div', { className: 'q-sub' },
        lang() === 'ru' ? 'Что это значит?' : 'What does it mean?'));
    }
  }

  if (ex.options) renderOptions(ex, body);
  else renderInput(ex, body);

  renderActionBar(ex);
}

function renderOptions(ex, body) {
  const wrap = el('div', { className: 'options' });
  const isKazakhOption = ex.type !== TYPE.RECOGNIZE;
  ex.options.forEach((opt, i) => {
    const btn = el('button', {
      className: `opt ${isKazakhOption ? 'kk' : ''}`,
      type: 'button',
    },
      el('span', { className: 'opt-key' }, String(i + 1)),
      el('span', {}, isKazakhOption ? kk(opt) : opt),
    );
    btn.setAttribute('aria-pressed', 'false');
    btn.dataset.value = opt;
    btn.addEventListener('click', () => {
      if (phase !== 'answering') return;
      selected = opt;
      wrap.querySelectorAll('.opt').forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.value === opt)));
      if (ex.type === TYPE.SUFFIX_MC) {
        const slot = $('#slot');
        if (slot) { slot.textContent = kk(opt); slot.classList.add('filled'); }
      }
      $('#btn-check').disabled = false;
    });
    wrap.append(btn);
  });
  body.append(wrap);
}

function renderInput(ex, body) {
  const input = el('input', {
    className: 'answer kk',
    id: 'answer-input',
    type: 'text',
    autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: false,
    placeholder: ex.type === TYPE.SUFFIX_TYPE ? kk(ex.prompt) + '…' : T('typeHere'),
  });
  input.addEventListener('input', () => {
    selected = input.value;
    $('#btn-check').disabled = !input.value.trim();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#btn-check')?.click(); }
  });

  // The nine letters absent from Russian and English layouts.
  const kbd = el('div', { className: 'kbd' });
  for (const letter of KAZAKH_LETTERS) {
    const b = el('button', { type: 'button', className: 'kk' }, kk(letter));
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the field
    b.addEventListener('click', () => {
      const pos = input.selectionStart ?? input.value.length;
      input.value = input.value.slice(0, pos) + letter + input.value.slice(input.selectionEnd ?? pos);
      input.focus();
      input.setSelectionRange(pos + 1, pos + 1);
      selected = input.value;
      $('#btn-check').disabled = !input.value.trim();
    });
    kbd.append(b);
  }

  body.append(el('div', { className: 'answer-wrap' },
    input, kbd, el('div', { className: 'kbd-hint' }, T('keyboardHint')),
  ));
  setTimeout(() => input.focus(), 60);
}

function renderActionBar(ex) {
  const bar = $('#action-bar');
  bar.className = 'actionbar';
  const check = el('button', { className: 'btn', id: 'btn-check', disabled: true }, T('check'));
  check.addEventListener('click', () => checkAnswer(ex));
  const skip = el('button', { className: 'btn ghost' }, T('skip'));
  skip.addEventListener('click', () => revealAnswer(ex));
  bar.replaceChildren(check, skip);
}

/* ------------------------------------------------------------------ *
 * Checking
 * ------------------------------------------------------------------ */

function checkAnswer(ex) {
  if (phase !== 'answering' || selected == null) return;
  const elapsed = performance.now() - shownAt;

  const isFreeText = !ex.options;
  const result = isFreeText
    ? grade(selected, ex.answer)
    : (normalize(selected) === normalize(ex.answer)
        ? { verdict: 'correct', canonical: ex.answer, missing: [], accepted: true }
        : { verdict: 'wrong', canonical: ex.answer, missing: [], accepted: false });

  // A single-character slip on a typed answer earns one free retry.
  if (result.verdict === 'typo' && !retried) {
    retried = true;
    const input = $('#answer-input');
    input?.classList.add('is-wrong');
    setTimeout(() => input?.classList.remove('is-wrong'), 700);
    flashBar('warn', T('typoRetry'));
    return;
  }

  lastGrade = result;
  phase = 'checked';

  const rating = ratingFor(result.verdict, { hintUsed: retried, fastMs: elapsed });
  runner.commit(ex, rating, {
    verdict: result.verdict,
    answer: String(selected),
    elapsedMs: Math.round(elapsed),
  });

  paintResult(ex, result);
  renderFeedback(ex, result);
  updateProgress();
}

function revealAnswer(ex) {
  if (phase !== 'answering') return;
  phase = 'checked';
  const result = { verdict: 'wrong', canonical: ex.answer, missing: [], accepted: false };
  lastGrade = result;
  runner.commit(ex, RATING.AGAIN, { verdict: 'skipped', answer: '' });
  paintResult(ex, result);
  renderFeedback(ex, result);
  updateProgress();
}

function paintResult(ex, result) {
  if (ex.options) {
    document.querySelectorAll('.opt').forEach((b) => {
      b.disabled = true;
      if (normalize(b.dataset.value) === normalize(ex.answer)) b.classList.add('is-correct');
      else if (b.dataset.value === selected) b.classList.add('is-wrong');
    });
  } else {
    const input = $('#answer-input');
    if (input) {
      input.disabled = true;
      input.classList.add(result.accepted ? 'is-correct' : 'is-wrong');
    }
  }
}

function renderFeedback(ex, result) {
  const bar = $('#action-bar');
  const tone = result.verdict === 'correct' ? 'ok' : result.verdict === 'diacritic' ? 'warn' : 'bad';
  bar.className = `actionbar ${tone}`;
  bar.replaceChildren();

  const label = result.verdict === 'correct' ? T('correct')
    : result.verdict === 'diacritic' ? T('almost')
    : T('wrong');

  const verdictBlock = el('div', { className: 'verdict' },
    el('div', {
      className: 'verdict-icon',
      style: `background:var(--${tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'bad'})`,
    }, result.accepted ? '✓' : '✕'),
    el('div', {},
      el('div', { className: 'verdict-text' }, label),
      result.verdict !== 'correct'
        ? el('div', { className: 'verdict-answer kk' },
            result.verdict === 'diacritic'
              ? markMissed(String(selected), ex.answer)
              : `${T('answerWas')}: ${kk(ex.answer)}`)
        : null,
    ),
  );
  bar.append(verdictBlock);

  // The derivation. Shown on any non-perfect grammar answer — this is the payload.
  if (ex.derivation && result.verdict !== 'correct') {
    const steps = explain(ex.derivation, lang(), kk);
    bar.append(el('div', { className: 'why' },
      el('h4', {}, T('whyTitle')),
      ...steps.map((s) => el('div', { className: `why-step ${s.accent ? 'accent' : ''}` },
        el('b', {}, s.label), el('span', { className: s.accent ? 'kk' : '' },
          s.accent ? kk(s.text) : s.text))),
    ));
  }

  // Contrastive note — surfaced on a miss, not pre-emptively.
  const note = ex.lexeme?.note?.[lang()];
  if (note && result.verdict !== 'correct') {
    bar.append(el('div', { className: 'note' }, mixed(note)));
  }

  const cont = el('button', { className: `btn ${tone}` }, T('continue'));
  cont.addEventListener('click', nextQuestion);
  bar.append(cont);
  cont.focus();
}

/** Paint the correct spelling with the letters the learner missed marked up. */
function markMissed(typed, expected) {
  const frag = document.createDocumentFragment();
  for (const { ch, missed } of diffMarks(typed, expected)) {
    frag.append(missed
      ? el('span', { className: 'mark-missed' }, kk(ch))
      : document.createTextNode(kk(ch)));
  }
  return frag;
}

function flashBar(tone, message) {
  const bar = $('#action-bar');
  const prev = bar.className;
  bar.className = `actionbar ${tone}`;
  let hint = bar.querySelector('.verdict-text');
  if (!hint) {
    hint = el('div', { className: 'verdict-text', style: 'margin-bottom:10px' });
    bar.prepend(hint);
  }
  hint.textContent = message;
  setTimeout(() => { bar.className = prev; hint.remove(); }, 1600);
}

/* ------------------------------------------------------------------ *
 * Completion
 * ------------------------------------------------------------------ */

function renderDone() {
  const accuracy = runner.answered ? Math.round(runner.correct / runner.answered * 100) : 0;
  const daily = store.dailyState();
  let streakLine = '';
  if (daily.met) {
    const s = store.touchStreak();
    streakLine = lang() === 'ru'
      ? `Серия: ${s.count} ${s.count === 1 ? 'день' : 'дней'} 🔥`
      : `${s.count}-day streak 🔥`;
  }

  const unitName = runner.unit
    ? (runner.unit.title[lang()] ?? runner.unit.title.en)
    : (lang() === 'ru' ? 'Повторение' : 'Review');

  $('#q-body').replaceChildren(
    el('div', { className: 'done' },
      el('div', { className: 'done-mark' }, accuracy >= 80 ? '🎉' : '💪'),
      el('h2', {}, T('sessionDone')),
      el('p', {}, unitName),
      el('div', { className: 'done-stats' },
        el('div', { className: 'done-stat' },
          el('b', { className: 'num' }, `${accuracy}%`), el('span', {}, T('accuracy'))),
        el('div', { className: 'done-stat' },
          el('b', { className: 'num' }, `+${runner.xp}`), el('span', {}, T('earned'))),
        el('div', { className: 'done-stat' },
          el('b', { className: 'num' }, runner.answered), el('span', {}, lang() === 'ru' ? 'ответов' : 'answers')),
      ),
      streakLine ? el('p', { style: 'font-weight:700;color:var(--amb)' }, streakLine) : null,
    ),
  );

  const bar = $('#action-bar');
  bar.className = 'actionbar';
  const back = el('button', { className: 'btn' }, T('continue'));
  back.addEventListener('click', () => { runner = null; show('home'); });
  bar.replaceChildren(back);
  $('#session-progress').style.width = '100%';
}

/* ------------------------------------------------------------------ *
 * Grammar reference
 * ------------------------------------------------------------------ */

/**
 * Full allomorph table for a paradigm. Every class × harmony cell, all on one screen.
 * This is the artefact learners screenshot — no Kazakh app currently gives them one.
 */
function allomorphTable(paradigmId) {
  const p = PARADIGMS[paradigmId];
  const order = [CLASS.VOWEL, CLASS.RYU, CLASS.L, CLASS.NASAL, CLASS.Z, CLASS.B, CLASS.Q];
  const seen = new Set();
  const rows = [];

  for (const cls of order) {
    const forms = p.table[cls];
    if (!forms) continue;
    const key = forms.join('|');
    const label = classLabel(cls, lang() === 'ru' ? 'ru' : 'en', kk);
    if (seen.has(key)) {
      rows[rows.length - 1].labels.push(label);
      continue;
    }
    seen.add(key);
    rows.push({ labels: [label], forms });
  }

  const table = el('table', {},
    el('thead', {}, el('tr', {},
      el('th', {}, lang() === 'ru' ? 'После' : 'After'),
      el('th', {}, lang() === 'ru' ? kk('жуан') : 'back'),
      el('th', {}, lang() === 'ru' ? kk('жіңішке') : 'front'),
    )),
    el('tbody', {}, ...rows.map((r) => el('tr', {},
      el('td', {}, r.labels.join(', ')),
      el('td', { className: 'kk' }, el('b', {}, `-${kk(r.forms[0])}`)),
      el('td', { className: 'kk' }, el('b', {}, `-${kk(r.forms[1])}`)),
    ))),
  );
  return el('div', { className: 'grid' }, table);
}

function renderGrammar() {
  renderHeader();
  const body = $('#grammar-body');
  body.replaceChildren(
    el('p', { style: 'font-size:13px;color:var(--ink-2);margin:14px 2px 4px;line-height:1.6' },
      lang() === 'ru'
        ? 'Все окончания выводятся по двум признакам: последний гласный задаёт ряд, последний звук — согласную. Здесь полные таблицы.'
        : 'Every suffix follows from two facts: the last vowel picks the row, the last sound picks the consonant. Full tables below.'),
  );

  // Only paradigms actually drilled somewhere in the curriculum.
  const used = new Set(UNITS.flatMap((u) => u.drills));
  for (const id of Object.keys(PARADIGMS)) {
    if (!used.has(id)) continue;
    const p = PARADIGMS[id];
    const c = CONCEPTS[id];
    body.append(el('div', { className: 'card rule' },
      el('h3', {}, p.name[lang()] ?? p.name.en),
      c ? el('p', {}, mixed(c.body[lang()] ?? c.body.en)) : null,
      allomorphTable(id),
      el('div', { className: 'note', style: 'margin-top:12px' }, exampleLine(id)),
    ));
  }
}

/** Three worked examples straight from the engine — never hand-written, never stale. */
function exampleLine(paradigmId) {
  const samples = ['үй', 'кітап', 'бала'];
  return samples.map((stem) => {
    const r = inflect(stem, paradigmId);
    return `${kk(stem)} → ${kk(r.surface)}`;
  }).join('   ·   ');
}

/* ------------------------------------------------------------------ *
 * Profile & settings
 * ------------------------------------------------------------------ */

function renderProfile() {
  renderHeader();
  const body = $('#profile-body');
  const st = store.getState();

  const retained = [...LEXEMES.values()].filter((lx) => strength(store.getMemory(lx.id, 'vocab')) >= 0.6).length;
  const week = store.weekHistory();
  const peak = Math.max(1, ...week.map((d) => d.xp));

  body.replaceChildren(
    el('div', { className: 'card', style: 'margin-top:14px' },
      el('div', { className: 'done-stats', style: 'margin:0;padding:15px' },
        el('div', { className: 'done-stat' },
          el('b', { className: 'num' }, store.currentStreak()), el('span', {}, T('streak'))),
        el('div', { className: 'done-stat' },
          el('b', { className: 'num' }, st.xp), el('span', {}, T('totalXp'))),
        el('div', { className: 'done-stat' },
          el('b', { className: 'num' }, retained), el('span', {}, T('wordsLearned'))),
      ),
    ),

    el('div', { className: 'section-label' }, T('weekTitle')),
    el('div', { className: 'card' },
      el('div', { className: 'spark' },
        ...week.map((d) => el('i', {
          className: d.xp ? '' : 'empty',
          style: `height:${Math.max(4, d.xp / peak * 100)}%`,
          title: `${d.day}: ${d.xp} XP`,
        })),
      ),
      el('div', { className: 'spark-labels' },
        ...week.map((d) => el('span', {}, d.day.slice(8))),
      ),
    ),

    el('div', { className: 'section-label' }, lang() === 'ru' ? 'Настройки' : 'Settings'),
    el('div', { className: 'card' },
      segRow(T('interfaceLang'), null, [['ru', 'Русский'], ['en', 'English']],
        store.getProfile().uiLang, (v) => { store.setProfile({ uiLang: v }); renderProfile(); }),
      segRow(T('scriptLabel'),
        lang() === 'ru' ? 'Ответы всегда проверяются по кириллице' : 'Answers are always graded in Cyrillic',
        [['cyrl', 'Кирилл'], ['latn', 'Latyn']],
        store.getProfile().script, (v) => { store.setProfile({ script: v }); renderProfile(); }),
      segRow(T('goalLabel'), null, [[10, '10'], [20, '20'], [40, '40']],
        store.getProfile().dailyGoal, (v) => { store.setProfile({ dailyGoal: Number(v) }); renderProfile(); }),
    ),

    el('div', { className: 'card', style: 'margin-top:10px' },
      el('div', { className: 'setting' },
        el('div', {},
          el('div', { className: 'setting-label' }, T('resetLabel')),
          el('div', { className: 'setting-sub' },
            lang() === 'ru' ? `В очереди на синхронизацию: ${store.outboxSize()}` : `Queued for sync: ${store.outboxSize()}`),
        ),
        (() => {
          // Short verb only — the row label already says what is being reset.
          const b = el('button', { className: 'btn bad', style: 'width:auto;padding:9px 15px;font-size:13px;white-space:nowrap' },
            lang() === 'ru' ? 'Сбросить' : 'Reset');
          b.addEventListener('click', () => {
            if (confirm(T('resetConfirm'))) { store.resetAll(); show('home'); }
          });
          return b;
        })(),
      ),
    ),
  );
}

function segRow(label, sub, options, value, onChange) {
  const seg = el('div', { className: 'seg' });
  for (const [val, text] of options) {
    const b = el('button', { type: 'button' }, text);
    b.setAttribute('aria-pressed', String(String(val) === String(value)));
    b.addEventListener('click', () => onChange(val));
    seg.append(b);
  }
  return el('div', { className: 'setting' },
    el('div', {},
      el('div', { className: 'setting-label' }, label),
      sub ? el('div', { className: 'setting-sub' }, sub) : null,
    ),
    seg,
  );
}

/* ------------------------------------------------------------------ *
 * Misc
 * ------------------------------------------------------------------ */

function toast(message) {
  const n = el('div', {
    style: `position:fixed;left:50%;bottom:calc(var(--bar-h) + 20px);transform:translateX(-50%);
            background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);
            padding:11px 16px;border-radius:999px;font-size:13.5px;font-weight:600;z-index:60;
            max-width:88vw;text-align:center`,
  }, message);
  document.body.append(n);
  setTimeout(() => n.remove(), 2400);
}

// Number keys 1–4 select an option; Enter checks. Keyboard practice is much faster
// on desktop and this is where most serious learners will do their long sessions.
document.addEventListener('keydown', (e) => {
  if (currentScreen !== 'session') return;
  if (e.key === 'Enter' && phase === 'checked') {
    e.preventDefault();
    $('#action-bar .btn:last-child')?.click();
    return;
  }
  if (phase !== 'answering') return;
  const n = Number(e.key);
  if (n >= 1 && n <= 4) {
    const opts = document.querySelectorAll('.opt');
    if (opts[n - 1]) { e.preventDefault(); opts[n - 1].click(); }
  }
});

store.subscribe(() => { if (currentScreen !== 'session') renderHeader(); });

show('home');
