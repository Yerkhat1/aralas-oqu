/*
 * session.js — builds and runs one practice session.
 *
 * Two ideas from the reference brief are implemented here rather than in the UI,
 * because they are scheduling decisions, not presentation:
 *
 *   1. ACTIVE RECALL LADDER. A word is never asked the same way twice in a row. It
 *      climbs recognise → produce → type as its strength grows, so the retrieval gets
 *      harder exactly as it gets easier. Flip-and-reveal never appears at all.
 *
 *   2. IN-SESSION REINSERTION. A missed item is re-queued 3–4 positions later, inside
 *      the same session. Waiting until tomorrow to correct an error lets the wrong form
 *      consolidate; this is the single highest-leverage difference from a plain deck.
 */

import { UNITS, LEXEMES, stemOf, isInflectable } from './lexicon.js';
import { inflect, distractorSuffixes } from './phonology.js';
import * as store from './store.js';
import { strength } from './srs.js';

export const TYPE = {
  RECOGNIZE: 'recognize',     // kk → L1, multiple choice
  PRODUCE: 'produce',         // L1 → kk, multiple choice
  TYPE_KK: 'type_kk',         // L1 → kk, free text
  SUFFIX_MC: 'suffix_mc',     // choose the allomorph
  SUFFIX_TYPE: 'suffix_type', // type the whole inflected form
};

const SESSION_LENGTH = 16;
const REINSERT_GAP = 3;
/**
 * How many times one item may be re-queued within a session.
 *
 * Uncapped reinsertion means a learner who keeps missing the same word can never
 * finish — the queue grows exactly as fast as they work through it. After two
 * corrections the item is left to the scheduler, which will surface it tomorrow
 * anyway; grinding it further in one sitting teaches frustration, not Kazakh.
 */
const MAX_REINSERTS = 2;

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const sample = (arr, n) => shuffle(arr).slice(0, n);

/* ------------------------------------------------------------------ *
 * Exercise construction
 * ------------------------------------------------------------------ */

/** Distractor meanings drawn from the same unit — same semantic field, so the
 *  learner cannot win by elimination on topic alone. */
function meaningDistractors(lexeme, unit, lang, n = 3) {
  const pool = unit.lexemes.filter((l) => l.id !== lexeme.id).map((l) => l[lang]);
  return sample(pool, n);
}

function wordDistractors(lexeme, unit, n = 3) {
  const pool = unit.lexemes.filter((l) => l.id !== lexeme.id).map((l) => l.kk);
  return sample(pool, n);
}

function vocabExercise(lexeme, unit, lang) {
  const s = strength(store.getMemory(lexeme.id, 'vocab'));

  if (s < 0.12) {
    const correct = lexeme[lang];
    return {
      type: TYPE.RECOGNIZE,
      skill: 'vocab',
      lexemeId: lexeme.id,
      prompt: lexeme.kk,
      answer: correct,
      options: shuffle([correct, ...meaningDistractors(lexeme, unit, lang)]),
      lexeme,
    };
  }

  if (s < 0.3) {
    const correct = lexeme.kk;
    return {
      type: TYPE.PRODUCE,
      skill: 'vocab',
      lexemeId: lexeme.id,
      prompt: lexeme[lang],
      answer: correct,
      options: shuffle([correct, ...wordDistractors(lexeme, unit)]),
      lexeme,
    };
  }

  return {
    type: TYPE.TYPE_KK,
    skill: 'vocab',
    lexemeId: lexeme.id,
    prompt: lexeme[lang],
    answer: lexeme.kk,
    lexeme,
  };
}

function grammarExercise(lexeme, paradigmId) {
  const stem = stemOf(lexeme);
  const result = inflect(stem, paradigmId, lexeme);
  const s = strength(store.getMemory(lexeme.id, paradigmId));

  if (s < 0.3) {
    const wrong = distractorSuffixes(stem, paradigmId, 3, lexeme);
    return {
      type: TYPE.SUFFIX_MC,
      skill: paradigmId,
      lexemeId: lexeme.id,
      prompt: stem,
      answer: result.suffix,
      options: shuffle([result.suffix, ...wrong]),
      derivation: result,
      lexeme,
    };
  }

  return {
    type: TYPE.SUFFIX_TYPE,
    skill: paradigmId,
    lexemeId: lexeme.id,
    prompt: stem,
    answer: result.surface,
    derivation: result,
    lexeme,
  };
}

/* ------------------------------------------------------------------ *
 * Session assembly
 * ------------------------------------------------------------------ */

/**
 * Build a session for one unit: due items first, then the weakest, then new.
 * Grammar drills only appear once a word's vocabulary memory is off the floor —
 * there is no point conjugating a word you cannot yet translate.
 */
export function buildSession(unitId, { lang = 'ru', length = SESSION_LENGTH } = {}) {
  const unit = UNITS.find((u) => u.id === unitId);
  if (!unit) throw new Error(`Unknown unit: ${unitId}`);

  const now = Date.now();
  const candidates = [];

  for (const lexeme of unit.lexemes) {
    const vocab = store.getMemory(lexeme.id, 'vocab');
    candidates.push({
      lexeme,
      skill: 'vocab',
      due: vocab.due || 0,
      strength: strength(vocab),
      isNew: !vocab.reps,
    });

    if (!isInflectable(lexeme)) continue;
    if (strength(vocab) < 0.12) continue; // gate grammar behind basic recognition

    for (const paradigmId of unit.drills) {
      const mem = store.getMemory(lexeme.id, paradigmId);
      candidates.push({
        lexeme,
        skill: paradigmId,
        due: mem.due || 0,
        strength: strength(mem),
        isNew: !mem.reps,
      });
    }
  }

  const dueNow = candidates.filter((c) => !c.isNew && c.due <= now);
  const fresh = candidates.filter((c) => c.isNew);
  const rest = candidates.filter((c) => !c.isNew && c.due > now);

  // Due material first (that is the whole point of scheduling), then new words to keep
  // the session feeling like progress, then early review to top up the length.
  dueNow.sort((a, b) => a.due - b.due);
  rest.sort((a, b) => a.strength - b.strength);

  const picked = [
    ...dueNow.slice(0, length),
    ...fresh.slice(0, Math.max(0, Math.min(6, length - dueNow.length))),
  ];
  if (picked.length < length) {
    picked.push(...rest.slice(0, length - picked.length));
  }

  const queue = picked.slice(0, length).map(({ lexeme, skill }) =>
    skill === 'vocab' ? vocabExercise(lexeme, unit, lang) : grammarExercise(lexeme, paradigmFor(skill)),
  );

  // Interleave rather than block by skill: mixed practice beats blocked practice for
  // retention, and it stops the learner pattern-matching "this screen means -лар".
  return { unit, queue: interleave(queue) };
}

const paradigmFor = (skill) => skill;

/** Keep same-skill items from clustering. */
function interleave(items) {
  const out = [];
  const pool = shuffle(items);
  while (pool.length) {
    const i = pool.findIndex((x) => !out.length || x.skill !== out[out.length - 1].skill);
    out.push(...pool.splice(i === -1 ? 0 : i, 1));
  }
  return out;
}

/**
 * Review session across every unit the learner has touched — the "keep it warm" mode
 * that a unit-only structure otherwise loses.
 */
export function buildReviewSession({ lang = 'ru', length = SESSION_LENGTH } = {}) {
  const now = Date.now();
  const due = [];

  for (const unit of UNITS) {
    for (const lexeme of unit.lexemes) {
      for (const skill of ['vocab', ...unit.drills]) {
        if (skill !== 'vocab' && !isInflectable(lexeme)) continue;
        const mem = store.getMemory(lexeme.id, skill);
        if (mem.reps && mem.due <= now) due.push({ lexeme, skill, unit, due: mem.due });
      }
    }
  }

  due.sort((a, b) => a.due - b.due);
  const queue = due.slice(0, length).map(({ lexeme, skill, unit }) =>
    skill === 'vocab' ? vocabExercise(lexeme, unit, lang) : grammarExercise(lexeme, skill),
  );

  return { unit: null, queue: interleave(queue), dueTotal: due.length };
}

export const dueCount = () => {
  const now = Date.now();
  let n = 0;
  for (const unit of UNITS) {
    for (const lexeme of unit.lexemes) {
      for (const skill of ['vocab', ...unit.drills]) {
        if (skill !== 'vocab' && !isInflectable(lexeme)) continue;
        const mem = store.getMemory(lexeme.id, skill);
        if (mem.reps && mem.due <= now) n++;
      }
    }
  }
  return n;
};

/* ------------------------------------------------------------------ *
 * Runner
 * ------------------------------------------------------------------ */

export class SessionRunner {
  constructor({ unit, queue }, { lang = 'ru' } = {}) {
    this.unit = unit;
    this.queue = queue;
    this.lang = lang;
    this.index = 0;
    this.total = queue.length;
    this.correct = 0;
    this.answered = 0;
    this.xp = 0;
    this.mistakes = [];
  }

  get current() { return this.queue[this.index] ?? null; }
  get done() { return this.index >= this.queue.length; }
  get progress() { return this.total ? Math.min(1, this.answered / this.total) : 1; }

  /**
   * Commit a graded answer, schedule the memory, and requeue on failure.
   * @returns {{xp:number, requeued:boolean}}
   */
  commit(exercise, rating, meta = {}) {
    store.recordReview(exercise.lexemeId, exercise.skill, rating, meta);
    this.answered += 1;

    const passed = rating > 0;
    let xp = 0;
    if (passed) {
      this.correct += 1;
      xp = meta.verdict === 'correct' ? 2 : 1;
      this.xp += xp;
      store.addXp(xp);
    } else {
      this.mistakes.push(exercise);
    }

    let requeued = false;
    if (!passed && (exercise.reinserts ?? 0) < MAX_REINSERTS) {
      // Reinsert 3–4 items later, or at the end if the session is nearly over.
      exercise.reinserts = (exercise.reinserts ?? 0) + 1;
      const at = Math.min(this.index + REINSERT_GAP + (Math.random() < 0.5 ? 0 : 1), this.queue.length);
      this.queue.splice(at, 0, exercise);
      this.total = this.queue.length;
      requeued = true;
    }

    this.index += 1;
    return { xp, requeued };
  }
}
