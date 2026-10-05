/*
 * store.js — persistence.
 *
 * Offline-first by design. Kazakhstan's mobile coverage outside Almaty/Astana is
 * uneven, and a learner on a bus should never lose a session. So:
 *
 *   • localStorage holds the authoritative *local* state and every session works
 *     fully offline;
 *   • reviews are appended to an outbox and flushed to Postgres when online;
 *   • the outbox is append-only, so a flush is idempotent and replay-safe.
 *
 * Every method here is named after the Supabase call that will replace it, so
 * wiring the real backend touches this file only. See db/schema.sql.
 */

import { newState, review as applyReview, keyOf, strength, isLearned } from './srs.js';
import { isInflectable } from './lexicon.js';

const KEY = 'aralas.v1';
const OUTBOX = 'aralas.outbox.v1';

const todayStamp = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const defaults = () => ({
  profile: {
    uiLang: 'ru',        // ru | en — the language the learner already speaks
    script: 'cyrl',      // cyrl | latn — Kazakh is mid-transition; both must render
    dailyGoal: 20,       // XP
    soundOn: true,
  },
  xp: 0,
  streak: { count: 0, lastDay: null, freezes: 1 },
  daily: { day: null, xp: 0 },
  memories: {},          // keyOf(lexemeId, skill) -> srs state
  unitsStarted: [],
  conceptsSeen: [],
  history: {},           // 'YYYY-MM-DD' -> xp earned
});

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    // Shallow-merge so a shipped schema addition doesn't wipe existing learners.
    return { ...defaults(), ...parsed, profile: { ...defaults().profile, ...parsed.profile } };
  } catch {
    return defaults();
  }
}

let state = read();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota or private mode — the session still works, it just won't survive reload */
  }
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getState = () => state;
export const getProfile = () => state.profile;

export function setProfile(patch) {
  state.profile = { ...state.profile, ...patch };
  persist();
}

/* ------------------------------------------------------------------ *
 * Memories  (→ public.user_memory)
 * ------------------------------------------------------------------ */

export function getMemory(lexemeId, skill) {
  const k = keyOf(lexemeId, skill);
  return state.memories[k] ?? newState(k);
}

/**
 * Record one answer. Updates the scheduler state and appends an immutable row to the
 * outbox — the log, not the derived state, is the thing worth syncing.
 */
export function recordReview(lexemeId, skill, rating, meta = {}) {
  const k = keyOf(lexemeId, skill);
  const before = state.memories[k] ?? newState(k);
  const after = applyReview(before, rating);
  state.memories[k] = after;

  queueOutbox({
    lexeme_id: lexemeId,
    skill,
    rating,
    reviewed_at: new Date().toISOString(),
    elapsed_ms: meta.elapsedMs ?? null,
    verdict: meta.verdict ?? null,
    answer_given: meta.answer ?? null,
    interval_after: after.interval,
    ease_after: after.ease,
  });

  persist();
  return after;
}

export const strengthOf = (lexemeId, skill) => strength(getMemory(lexemeId, skill));

/**
 * Fraction of a unit's (lexeme × skill) pairs that are retained.
 *
 * Multi-word phrases ("қайырлы таң") are never inflected, so their grammar pairs are
 * excluded — counting them would cap a unit below 100% no matter how well it is known,
 * and the gate to the next unit would read as broken.
 */
export function unitProgress(unit, skills) {
  const pairs = [];
  for (const lx of unit.lexemes) {
    for (const skill of skills) {
      if (skill !== 'vocab' && !isInflectable(lx)) continue;
      pairs.push(getMemory(lx.id, skill));
    }
  }
  if (!pairs.length) return 0;
  const learned = pairs.filter(isLearned).length;
  return learned / pairs.length;
}

/* ------------------------------------------------------------------ *
 * XP, streak, daily goal  (→ public.user_day)
 * ------------------------------------------------------------------ */

export function addXp(amount) {
  const day = todayStamp();
  if (state.daily.day !== day) state.daily = { day, xp: 0 };
  state.daily.xp += amount;
  state.xp += amount;
  state.history[day] = (state.history[day] ?? 0) + amount;
  persist();
}

/**
 * Advance the streak. Called once per day, when the daily goal is actually met —
 * not merely on app open. A streak that ticks up for opening the app is a vanity
 * metric; one that requires the goal is a commitment device.
 */
export function touchStreak() {
  const day = todayStamp();
  const s = state.streak;
  if (s.lastDay === day) return s;

  const yesterday = todayStamp(new Date(Date.now() - 86_400_000));
  if (s.lastDay === yesterday || s.lastDay === null) {
    s.count += 1;
  } else if (s.freezes > 0) {
    // One free miss. Losing a 40-day streak to a single bad day is the most common
    // reason people quit — the freeze buys back exactly one.
    s.freezes -= 1;
    s.count += 1;
  } else {
    s.count = 1;
  }
  s.lastDay = day;
  persist();
  return s;
}

export function dailyState() {
  const day = todayStamp();
  const xp = state.daily.day === day ? state.daily.xp : 0;
  return { xp, goal: state.profile.dailyGoal, met: xp >= state.profile.dailyGoal };
}

/** Streak count, corrected for a day that has already been missed. */
export function currentStreak() {
  const { count, lastDay } = state.streak;
  if (!lastDay) return 0;
  const day = todayStamp();
  const yesterday = todayStamp(new Date(Date.now() - 86_400_000));
  if (lastDay === day || lastDay === yesterday) return count;
  return 0;
}

/** Last 7 days of activity, oldest first — for the sparkline. */
export function weekHistory() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = todayStamp(new Date(Date.now() - i * 86_400_000));
    out.push({ day: d, xp: state.history[d] ?? 0 });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Unit / concept gating
 * ------------------------------------------------------------------ */

export function markUnitStarted(unitId) {
  if (!state.unitsStarted.includes(unitId)) {
    state.unitsStarted.push(unitId);
    persist();
  }
}

export const hasSeenConcept = (id) => state.conceptsSeen.includes(id);

export function markConceptSeen(id) {
  if (!state.conceptsSeen.includes(id)) {
    state.conceptsSeen.push(id);
    persist();
  }
}

/* ------------------------------------------------------------------ *
 * Outbox  (→ public.review_log, flushed on reconnect)
 * ------------------------------------------------------------------ */

function queueOutbox(row) {
  try {
    const q = JSON.parse(localStorage.getItem(OUTBOX) ?? '[]');
    q.push(row);
    // Cap the buffer; the derived state in `memories` is what actually drives the app.
    localStorage.setItem(OUTBOX, JSON.stringify(q.slice(-5000)));
  } catch { /* non-fatal */ }
}

export function outboxSize() {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? '[]').length;
  } catch {
    return 0;
  }
}

/**
 * Placeholder for the Supabase flush:
 *   await supabase.from('review_log').upsert(rows, { onConflict: 'client_id' })
 * Rows carry their own timestamps, so ordering on the server is irrelevant.
 */
export async function flushOutbox(send) {
  if (!send) return { sent: 0 };
  const q = JSON.parse(localStorage.getItem(OUTBOX) ?? '[]');
  if (!q.length) return { sent: 0 };
  await send(q);
  localStorage.setItem(OUTBOX, '[]');
  return { sent: q.length };
}

export function resetAll() {
  state = defaults();
  localStorage.removeItem(OUTBOX);
  persist();
}
