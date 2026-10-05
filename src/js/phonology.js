/*
 * phonology.js — Kazakh phonological engine.
 *
 * Kazakh is agglutinative and, unlike most Duolingo languages, its suffixation is
 * ~95% algorithmic. Two features decide which allomorph of a suffix attaches:
 *
 *   1. VOWEL HARMONY (үндестік) — the suffix vowel copies the backness of the
 *      stem's last decisive vowel.  жуан (back) vs жіңішке (front).
 *   2. CONSONANT ASSIMILATION — the suffix's initial consonant assimilates to the
 *      voicing/sonority class of the stem's final segment.
 *
 * Because both are rule-driven, we can GENERATE unlimited exercises from a bare
 * lemma list and — more importantly — EXPLAIN every answer. That explanation is
 * the product. Nobody ships a Kazakh app that tells you *why* it's -лер not -лар.
 *
 * Loanwords (mostly Russian) break harmony, so every lexeme may carry an explicit
 * `harmony` override. Rule first, dictionary second — same architecture Apertium's
 * kaz analyser uses.
 */

/* ------------------------------------------------------------------ *
 * Segment inventories
 * ------------------------------------------------------------------ */

export const VOWELS = 'аәеиоөуұүыіэюяё';

/** Unambiguously back (жуан) vowels. */
const BACK = 'аоұыяё';
/** Unambiguously front (жіңішке) vowels. */
const FRONT = 'әеөүіэю';
/**
 * и and у are orthographic diphthongs (ый/ій, ұw/үw). Their backness is inherited
 * from the surrounding syllable, so we skip them and keep scanning leftwards.
 */
const AMBIGUOUS_VOWELS = 'иу';

/**
 * Final-consonant classes. Every suffix paradigm in the language is a mapping from
 * these seven classes onto an allomorph, which is why we compute the class once.
 */
export const CLASS = {
  VOWEL: 'vowel',   // дауысты
  RYU: 'ryu',       // р, й, у — sonorants that pattern with vowels
  L: 'l',           // л
  NASAL: 'nasal',   // м, н, ң
  Z: 'z',           // з, ж — voiced fricatives (ұяң)
  B: 'b',           // б, в, г, д — voiced stops, devoiced word-finally
  Q: 'q',           // қатаң (voiceless): к, қ, п, с, т, ф, х, һ, ц, ч, ш, щ
};

const CONSONANT_CLASS = new Map();
for (const ch of 'рйу') CONSONANT_CLASS.set(ch, CLASS.RYU);
CONSONANT_CLASS.set('л', CLASS.L);
for (const ch of 'мнң') CONSONANT_CLASS.set(ch, CLASS.NASAL);
for (const ch of 'зж') CONSONANT_CLASS.set(ch, CLASS.Z);
for (const ch of 'бвгд') CONSONANT_CLASS.set(ch, CLASS.B);
for (const ch of 'кқпстфхһцчшщ') CONSONANT_CLASS.set(ch, CLASS.Q);

/**
 * Human-readable class names.
 *
 * Split into a descriptor (interface language) and a letter list (target language),
 * because the two are rendered differently: the descriptor stays in Russian/English,
 * the letters transliterate when the learner switches to the Latin script. Storing
 * them as one pre-joined string made "звонкий з, ж" untransliterable without also
 * mangling the Russian word in front of it.
 */
export const CLASS_LABEL = {
  [CLASS.VOWEL]: { letters: [], desc: { ru: 'гласный', en: 'a vowel' } },
  [CLASS.RYU]: { letters: ['р', 'й', 'у'], desc: null },
  [CLASS.L]: { letters: ['л'], desc: null },
  [CLASS.NASAL]: { letters: ['м', 'н', 'ң'], desc: { ru: 'носовой', en: 'a nasal' } },
  [CLASS.Z]: { letters: ['з', 'ж'], desc: { ru: 'звонкий', en: 'voiced' } },
  [CLASS.B]: { letters: ['б', 'в', 'г', 'д'], desc: { ru: 'звонкий', en: 'voiced' } },
  [CLASS.Q]: { letters: [], desc: { ru: 'глухой согласный', en: 'a voiceless consonant' } },
};

/**
 * Compose a class label, transliterating only the letters.
 * @param {function} tr  script renderer (identity for Cyrillic)
 */
export function classLabel(cls, lang = 'ru', tr = (s) => s) {
  const { letters, desc } = CLASS_LABEL[cls];
  const list = letters.map(tr).join(', ');
  const word = desc?.[lang] ?? desc?.en ?? '';
  return [word, list].filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ *
 * Core analysis
 * ------------------------------------------------------------------ */

export const isVowel = (ch) => VOWELS.includes(ch);

/**
 * Harmony class of a stem: 'back' | 'front'.
 *
 * Scans right-to-left for the last decisive vowel, skipping и/у. Defaults to back,
 * which is the majority class for vowelless loan stems.
 */
export function harmonyOf(stem, override) {
  if (override === 'back' || override === 'front') return override;
  const s = stem.toLowerCase();
  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i];
    if (BACK.includes(ch)) return 'back';
    if (FRONT.includes(ch)) return 'front';
    if (AMBIGUOUS_VOWELS.includes(ch)) continue; // и/у defer to the syllable left of them
  }
  return 'back';
}

/** The vowel that decided the harmony — shown in the explanation UI. */
export function decisiveVowel(stem) {
  const s = stem.toLowerCase();
  for (let i = s.length - 1; i >= 0; i--) {
    if (BACK.includes(s[i]) || FRONT.includes(s[i])) return { ch: s[i], index: i };
  }
  return null;
}

/** Final-segment class of a stem (one of CLASS.*). */
export function finalClassOf(stem) {
  const last = stem.toLowerCase().slice(-1);
  if (isVowel(last)) return CLASS.VOWEL;
  return CONSONANT_CLASS.get(last) ?? CLASS.VOWEL;
}

/* ------------------------------------------------------------------ *
 * Lenition (ұяңдау)
 * ------------------------------------------------------------------ */

/**
 * Word-final қ→ғ, к→г, п→б before a vowel-initial suffix.
 *   кітап + ым → кітабым,  қонақ + ым → қонағым,  жүрек + ім → жүрегім
 *
 * Some high-frequency stems additionally syncopate (халық → халқы). Those are
 * lexical, so the lexeme carries an explicit `stemAlt` instead of being derived.
 */
const LENITION = { қ: 'ғ', к: 'г', п: 'б' };

export function lenite(stem, { stemAlt } = {}) {
  if (stemAlt) return stemAlt;
  const last = stem.slice(-1);
  const soft = LENITION[last];
  return soft ? stem.slice(0, -1) + soft : stem;
}

export function lenites(stem, opts = {}) {
  return lenite(stem, opts) !== stem;
}

/* ------------------------------------------------------------------ *
 * Suffix paradigms
 * ------------------------------------------------------------------ *
 *
 * Each paradigm maps a final-class onto [backAllomorph, frontAllomorph].
 * This table IS the grammar of Kazakh nominal/verbal inflection — it is the single
 * place a linguistic bug can live, which is exactly where you want it.
 */

const { VOWEL, RYU, L, NASAL, Z, B, Q } = CLASS;

/** Helper: build a paradigm from groups of classes. */
function paradigm(groups) {
  const table = {};
  for (const [classes, forms] of groups) {
    for (const c of classes) table[c] = forms;
  }
  return table;
}

export const PARADIGMS = {
  /** Көптік жалғау — plural. */
  plural: {
    id: 'plural',
    name: { kk: 'Көптік жалғау', ru: 'Множественное число', en: 'Plural' },
    vowelInitial: false,
    table: paradigm([
      [[VOWEL, RYU], ['лар', 'лер']],
      [[L, NASAL, Z], ['дар', 'дер']],
      [[B, Q], ['тар', 'тер']],
    ]),
  },

  /** Жатыс септік — locative, "in/at". */
  locative: {
    id: 'locative',
    name: { kk: 'Жатыс септік', ru: 'Местный падеж', en: 'Locative (in / at)' },
    vowelInitial: false,
    table: paradigm([
      [[VOWEL, RYU, L, NASAL, Z], ['да', 'де']],
      [[B, Q], ['та', 'те']],
    ]),
  },

  /** Барыс септік — dative, "to". */
  dative: {
    id: 'dative',
    name: { kk: 'Барыс септік', ru: 'Дательный падеж', en: 'Dative (to)' },
    vowelInitial: false,
    table: paradigm([
      [[VOWEL, RYU, L, NASAL, Z], ['ға', 'ге']],
      [[B, Q], ['қа', 'ке']],
    ]),
  },

  /** Шығыс септік — ablative, "from". */
  ablative: {
    id: 'ablative',
    name: { kk: 'Шығыс септік', ru: 'Исходный падеж', en: 'Ablative (from)' },
    vowelInitial: false,
    table: paradigm([
      [[VOWEL, RYU, L, Z], ['дан', 'ден']],
      [[NASAL], ['нан', 'нен']],
      [[B, Q], ['тан', 'тен']],
    ]),
  },

  /** Табыс септік — accusative, definite direct object. */
  accusative: {
    id: 'accusative',
    name: { kk: 'Табыс септік', ru: 'Винительный падеж', en: 'Accusative (object)' },
    vowelInitial: false,
    table: paradigm([
      [[VOWEL], ['ны', 'ні']],
      [[RYU, L, NASAL, Z], ['ды', 'ді']],
      [[B, Q], ['ты', 'ті']],
    ]),
  },

  /** Ілік септік — genitive, possessor. */
  genitive: {
    id: 'genitive',
    name: { kk: 'Ілік септік', ru: 'Родительный падеж', en: 'Genitive (of)' },
    vowelInitial: false,
    table: paradigm([
      [[VOWEL, NASAL], ['ның', 'нің']],
      [[RYU, L, Z], ['дың', 'дің']],
      [[B, Q], ['тың', 'тің']],
    ]),
  },

  /**
   * Көмектес септік — instrumental, "with / by".
   * Note: no vowel harmony at all — only voicing. A useful counter-example to
   * teach *after* learners over-generalise harmony.
   */
  instrumental: {
    id: 'instrumental',
    name: { kk: 'Көмектес септік', ru: 'Творительный падеж', en: 'Instrumental (with)' },
    vowelInitial: false,
    harmonyless: true,
    table: paradigm([
      [[VOWEL, RYU, L, NASAL, Z], ['мен', 'мен']],
      [[B], ['бен', 'бен']],
      [[Q], ['пен', 'пен']],
    ]),
  },

  /**
   * Жіктік жалғау, 1sg — predicate personal ending, "I am X".
   * Highest-value item for Russian speakers: Russian has a zero copula in the
   * present tense, so "Мен студент" feels complete and "Мен студентпін" does not.
   */
  pred1sg: {
    id: 'pred1sg',
    name: { kk: 'Жіктік жалғау (мен)', ru: 'Личное окончание (я)', en: 'Predicate ending (I am)' },
    vowelInitial: false,
    table: paradigm([
      [[VOWEL, RYU, L, NASAL], ['мын', 'мін']],
      [[Z, B], ['бын', 'бін']],
      [[Q], ['пын', 'пін']],
    ]),
  },

  /** Жіктік жалғау, 1pl — "we are X". */
  pred1pl: {
    id: 'pred1pl',
    name: { kk: 'Жіктік жалғау (біз)', ru: 'Личное окончание (мы)', en: 'Predicate ending (we are)' },
    vowelInitial: false,
    table: paradigm([
      [[VOWEL, RYU, L, NASAL], ['мыз', 'міз']],
      [[Z, B], ['быз', 'біз']],
      [[Q], ['пыз', 'піз']],
    ]),
  },

  /** Жіктік жалғау, 2sg formal — "you (polite) are X". */
  pred2formal: {
    id: 'pred2formal',
    name: { kk: 'Жіктік жалғау (сіз)', ru: 'Личное окончание (Вы)', en: 'Predicate ending (you are, polite)' },
    vowelInitial: false,
    harmonyless: false,
    table: paradigm([
      [[VOWEL, RYU, L, NASAL, Z, B, Q], ['сыз', 'сіз']],
    ]),
  },

  /** Болымсыздық — verb negation, attaches to the bare verb stem. */
  negation: {
    id: 'negation',
    name: { kk: 'Болымсыз етістік', ru: 'Отрицание глагола', en: 'Verb negation' },
    vowelInitial: false,
    table: paradigm([
      [[VOWEL, RYU, L, NASAL], ['ма', 'ме']],
      [[Z], ['ба', 'бе']],
      [[B, Q], ['па', 'пе']],
    ]),
  },

  /**
   * Тәуелдік жалғау, 1sg — possessive "my".
   * Vowel-initial, so it triggers lenition: кітап → кітабым.
   */
  poss1sg: {
    id: 'poss1sg',
    name: { kk: 'Тәуелдік жалғау (менің)', ru: 'Притяжательное (мой)', en: 'Possessive (my)' },
    vowelInitial: true,
    table: paradigm([
      [[VOWEL], ['м', 'м']],
      [[RYU, L, NASAL, Z, B, Q], ['ым', 'ім']],
    ]),
  },

  /** Тәуелдік жалғау, 3rd person — "his / her / its". */
  poss3: {
    id: 'poss3',
    name: { kk: 'Тәуелдік жалғау (оның)', ru: 'Притяжательное (его/её)', en: 'Possessive (his / her)' },
    vowelInitial: true,
    table: paradigm([
      [[VOWEL], ['сы', 'сі']],
      [[RYU, L, NASAL, Z, B, Q], ['ы', 'і']],
    ]),
  },
};

/* ------------------------------------------------------------------ *
 * Application
 * ------------------------------------------------------------------ */

/**
 * Attach a suffix to a stem and return both the surface form and a full derivation
 * trace. The trace is what the UI renders when a learner gets it wrong.
 *
 * @param {string} stem
 * @param {string} paradigmId  key of PARADIGMS
 * @param {object} lexeme      optional { harmony, stemAlt } overrides
 */
export function inflect(stem, paradigmId, lexeme = {}) {
  const p = PARADIGMS[paradigmId];
  if (!p) throw new Error(`Unknown paradigm: ${paradigmId}`);

  const base = stem.toLowerCase();
  const harmony = harmonyOf(base, lexeme.harmony);
  const cls = finalClassOf(base);
  const forms = p.table[cls];
  if (!forms) throw new Error(`No allomorph for class ${cls} in ${paradigmId}`);

  const suffix = harmony === 'back' ? forms[0] : forms[1];

  // Vowel-initial suffixes soften a final қ/к/п on the stem.
  const attachTo = p.vowelInitial ? lenite(base, lexeme) : base;
  const softened = attachTo !== base;

  return {
    stem: base,
    surface: attachTo + suffix,
    suffix,
    harmony,
    finalClass: cls,
    softened,
    softenedFrom: softened ? base.slice(-1) : null,
    softenedTo: softened ? attachTo.slice(-1) : null,
    decisive: decisiveVowel(base),
    paradigm: p,
    /** Every allomorph of this paradigm — used to build plausible distractors. */
    alternatives: allomorphsOf(paradigmId),
  };
}

/** Distinct allomorphs of a paradigm, in a stable order. */
export function allomorphsOf(paradigmId) {
  const p = PARADIGMS[paradigmId];
  const seen = new Set();
  const out = [];
  for (const forms of Object.values(p.table)) {
    for (const f of forms) {
      if (!seen.has(f)) { seen.add(f); out.push(f); }
    }
  }
  return out;
}

/**
 * Wrong-but-plausible suffixes for a multiple-choice item: same paradigm, different
 * allomorph. Distractors drawn from the real paradigm are what force the learner to
 * actually apply the rule rather than recognise a shape.
 */
export function distractorSuffixes(stem, paradigmId, count = 3, lexeme = {}) {
  const correct = inflect(stem, paradigmId, lexeme).suffix;
  const pool = allomorphsOf(paradigmId).filter((s) => s !== correct);
  // Prefer the harmony-twin first (лар vs лер) — the most instructive contrast.
  const p = PARADIGMS[paradigmId];
  const cls = finalClassOf(stem);
  const twin = p.table[cls].find((s) => s !== correct);
  const ordered = twin ? [twin, ...pool.filter((s) => s !== twin)] : pool;
  return ordered.slice(0, count);
}

/* ------------------------------------------------------------------ *
 * Explanation
 * ------------------------------------------------------------------ */

/**
 * A three-step derivation in the learner's own interface language.
 * This is deliberately mechanical: harmony → consonant class → allomorph.
 */
export function explain(result, lang = 'ru', tr = (s) => s) {
  const steps = [];
  const p = result.paradigm;

  if (!p.harmonyless) {
    const v = result.decisive;
    // The Kazakh grammatical term is target-language text and transliterates with it.
    const term = tr(result.harmony === 'back' ? 'жуан' : 'жіңішке');
    const harmonyWord = result.harmony === 'back'
      ? { kk: term, ru: `твёрдый (${term})`, en: `back (${term})` }[lang]
      : { kk: term, ru: `мягкий (${term})`, en: `front (${term})` }[lang];
    steps.push({
      label: { kk: 'Үндестік', ru: 'Гармония гласных', en: 'Vowel harmony' }[lang],
      text: v
        ? {
            kk: `Соңғы дауысты «${tr(v.ch)}» → ${harmonyWord} буын.`,
            ru: `Последний гласный «${tr(v.ch)}» → ${harmonyWord} ряд.`,
            en: `Last vowel «${tr(v.ch)}» → ${harmonyWord} vowel class.`,
          }[lang]
        : {
            kk: 'Дауысты жоқ → әдепкі жуан.', ru: 'Гласных нет → по умолчанию твёрдый.',
            en: 'No decisive vowel → defaults to back.',
          }[lang],
    });
  } else {
    steps.push({
      label: { kk: 'Үндестік', ru: 'Гармония гласных', en: 'Vowel harmony' }[lang],
      text: {
        kk: 'Бұл жалғау үндестікке бағынбайды.',
        ru: 'Это окончание не подчиняется гармонии гласных.',
        en: 'This suffix does not harmonise — one vowel for both classes.',
      }[lang],
    });
  }

  const finalCh = tr(result.stem.slice(-1));
  const clsLabel = classLabel(result.finalClass, lang, tr);
  steps.push({
    label: { kk: 'Соңғы дыбыс', ru: 'Последний звук', en: 'Final sound' }[lang],
    text: {
      kk: `«${finalCh}» — ${clsLabel}.`,
      ru: `«${finalCh}» — ${clsLabel}.`,
      en: `«${finalCh}» is ${clsLabel}.`,
    }[lang],
  });

  if (result.softened) {
    const from = tr(result.softenedFrom);
    const to = tr(result.softenedTo);
    steps.push({
      label: { kk: 'Ұяңдау', ru: 'Озвончение', en: 'Lenition' }[lang],
      text: {
        kk: `Дауыстыдан басталатын жалғау алдында «${from}» → «${to}».`,
        ru: `Перед окончанием на гласный «${from}» → «${to}».`,
        en: `Before a vowel-initial suffix «${from}» → «${to}».`,
      }[lang],
    });
  }

  steps.push({
    label: { kk: 'Жалғау', ru: 'Окончание', en: 'Suffix' }[lang],
    text: `→ −${tr(result.suffix)}`,
    accent: true,
  });

  return steps;
}
