/*
 * grader.js — answer checking.
 *
 * The hard problem specific to Kazakh: nine letters (ә ғ қ ң ө ұ ү һ і) do not exist
 * on a Russian or English keyboard, and most learners in Kazakhstan type on a Russian
 * layout. If we reject "аке" for "әке" the learner concludes the app is broken and
 * leaves. If we silently accept it, they learn the wrong spelling.
 *
 * So we grade on three tiers:
 *   correct   — exact match, full credit.
 *   diacritic — right word, missing Kazakh letters. Accepted, but the correction is
 *               shown large and the card is scheduled sooner (SRS grade "hard").
 *   typo      — edit distance 1 after folding. One free retry, no penalty yet.
 *   wrong     — everything else.
 *
 * The diacritic tier is also the honest way to handle a learner who *has* a Kazakh
 * keyboard but hasn't yet internalised і vs и — the most common native-speaker
 * spelling error too.
 */

/** Kazakh-specific letters folded onto their nearest Russian-keyboard neighbour. */
const FOLD = {
  ә: 'а', ғ: 'г', қ: 'к', ң: 'н', ө: 'о', ұ: 'у', ү: 'у', һ: 'х', і: 'и',
};

export const KAZAKH_LETTERS = ['ә', 'ғ', 'қ', 'ң', 'ө', 'ұ', 'ү', 'һ', 'і'];

/** Trim, lowercase, collapse internal whitespace, normalise apostrophes and ё. */
export function normalize(s) {
  return (s ?? '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip the Kazakh-only letters down to their Russian look-alikes. */
export function fold(s) {
  let out = '';
  for (const ch of normalize(s)) out += FOLD[ch] ?? ch;
  return out;
}

/** Which Kazakh letters the learner failed to type. */
export function missingLetters(input, expected) {
  const a = normalize(input);
  const b = normalize(expected);
  const missed = new Set();
  for (let i = 0; i < b.length; i++) {
    if (FOLD[b[i]] && a[i] !== b[i]) missed.add(b[i]);
  }
  return [...missed];
}

/** Standard Levenshtein, iterative two-row. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Grade a free-text answer.
 *
 * @param {string} input     what the learner typed
 * @param {string|string[]} expected  accepted answer(s); first is canonical
 * @returns {{verdict:'correct'|'diacritic'|'typo'|'wrong', canonical:string,
 *            missing:string[], distance:number, accepted:boolean}}
 */
export function grade(input, expected) {
  const answers = (Array.isArray(expected) ? expected : [expected]).filter(Boolean);
  const canonical = answers[0] ?? '';
  const typed = normalize(input);

  if (!typed) {
    return { verdict: 'wrong', canonical, missing: [], distance: Infinity, accepted: false };
  }

  for (const ans of answers) {
    if (typed === normalize(ans)) {
      return { verdict: 'correct', canonical: ans, missing: [], distance: 0, accepted: true };
    }
  }

  for (const ans of answers) {
    if (fold(typed) === fold(ans)) {
      return {
        verdict: 'diacritic',
        canonical: ans,
        missing: missingLetters(typed, ans),
        distance: 0,
        accepted: true,
      };
    }
  }

  let best = { distance: Infinity, canonical };
  for (const ans of answers) {
    const d = levenshtein(fold(typed), fold(ans));
    if (d < best.distance) best = { distance: d, canonical: ans };
  }

  // One-character slips on words of 4+ letters are typos, not knowledge failures.
  const isTypo = best.distance === 1 && fold(best.canonical).length >= 4;
  return {
    verdict: isTypo ? 'typo' : 'wrong',
    canonical: best.canonical,
    missing: [],
    distance: best.distance,
    accepted: false,
  };
}

/**
 * Render the expected answer with the letters the learner missed highlighted.
 * Returns an array of {ch, missed} for the UI to paint.
 */
export function diffMarks(input, expected) {
  const a = normalize(input);
  const b = normalize(expected);
  return [...b].map((ch, i) => ({ ch, missed: a[i] !== ch }));
}
