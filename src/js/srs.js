/*
 * srs.js — per-item spaced repetition.
 *
 * The unit of scheduling is not a word — it is a (lexeme × skill) pair. Knowing that
 * "кітап" means book is a different memory from knowing it pluralises to "кітаптар",
 * and in an agglutinative language the second is where learners actually fail. Giving
 * them one shared "mastered" flag is the modelling mistake that makes most flashcard
 * apps useless for Turkic languages.
 *
 * Algorithm: SM-2 with a short learning ladder in front of it. Deliberately not FSRS —
 * FSRS needs a few thousand of your own review logs before its parameters beat SM-2's
 * defaults, and this app starts with zero. The review log is recorded in the shape FSRS
 * wants (see db/schema.sql, review_log), so switching later is a data migration, not a
 * rewrite.
 */

export const RATING = { AGAIN: 0, HARD: 1, GOOD: 2, EASY: 3 };

const MIN_EASE = 1.3;
const MAX_EASE = 2.8;
const DAY = 86_400_000;

/** Minutes, applied before a card graduates into day-scale intervals. */
const LEARNING_STEPS = [1, 10];

export function newState(key) {
  return {
    key,
    ease: 2.5,
    interval: 0,       // days; 0 = still in learning
    step: 0,           // index into LEARNING_STEPS
    due: 0,            // epoch ms; 0 = never seen
    reps: 0,
    lapses: 0,
    streak: 0,
    lastSeen: 0,
  };
}

/**
 * Apply a rating and return the next state.
 * @param {object} state
 * @param {number} rating  RATING.*
 * @param {number} now     epoch ms (injected so tests are deterministic)
 */
export function review(state, rating, now = Date.now()) {
  const s = { ...state, lastSeen: now, reps: state.reps + 1 };

  if (rating === RATING.AGAIN) {
    s.lapses += 1;
    s.streak = 0;
    s.ease = clamp(s.ease - 0.2, MIN_EASE, MAX_EASE);
    s.step = 0;
    s.interval = 0;
    s.due = now + LEARNING_STEPS[0] * 60_000;
    return s;
  }

  s.streak += 1;

  // Still in the learning ladder.
  if (s.interval === 0) {
    if (rating === RATING.EASY) {
      s.interval = 2;
      s.due = now + 2 * DAY;
      return s;
    }
    const nextStep = rating === RATING.HARD ? s.step : s.step + 1;
    if (nextStep >= LEARNING_STEPS.length) {
      s.interval = 1;
      s.due = now + DAY;
      s.step = 0;
    } else {
      s.step = nextStep;
      s.due = now + LEARNING_STEPS[nextStep] * 60_000;
    }
    return s;
  }

  // Graduated: classic SM-2 multiplier.
  const factor = rating === RATING.HARD ? 1.2 : rating === RATING.EASY ? s.ease * 1.3 : s.ease;
  if (rating === RATING.HARD) s.ease = clamp(s.ease - 0.15, MIN_EASE, MAX_EASE);
  if (rating === RATING.EASY) s.ease = clamp(s.ease + 0.15, MIN_EASE, MAX_EASE);

  s.interval = Math.max(1, Math.round(s.interval * factor));
  s.due = now + s.interval * DAY;
  return s;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Retention strength, 0–1, for progress rings and unit gating.
 * Saturates at a 21-day interval — long enough to call something learned without
 * demanding months before a unit unlocks.
 */
export function strength(state) {
  if (!state || !state.reps) return 0;
  if (state.interval === 0) return Math.min(0.25, state.streak * 0.1);
  return Math.min(1, 0.25 + 0.75 * (Math.log2(state.interval + 1) / Math.log2(22)));
}

export const isDue = (state, now = Date.now()) => !state.due || state.due <= now;

/** Cards a learner has genuinely retained — used for the unit-unlock threshold. */
export const isLearned = (state) => strength(state) >= 0.6;

/**
 * Map a graded answer onto an SRS rating.
 * A diacritic-only miss is real partial knowledge, so it lands on HARD rather than
 * AGAIN: the word comes back soon, but the learner is not punished for a keyboard
 * they do not have.
 */
export function ratingFor(verdict, { hintUsed = false, fastMs = null } = {}) {
  if (verdict === 'wrong') return RATING.AGAIN;
  if (verdict === 'typo' || verdict === 'diacritic') return RATING.HARD;
  if (hintUsed) return RATING.HARD;
  if (fastMs !== null && fastMs < 2500) return RATING.EASY;
  return RATING.GOOD;
}

/** Composite key for a (lexeme × skill) memory. */
export const keyOf = (lexemeId, skill) => `${lexemeId}::${skill}`;
