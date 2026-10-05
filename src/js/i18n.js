/*
 * i18n.js — interface strings and Cyrillic ⇄ Latin transliteration.
 *
 * Two separate axes, deliberately not conflated:
 *   • uiLang  — the language the learner ALREADY speaks (ru | en). Chrome, prompts,
 *               explanations.
 *   • script  — how KAZAKH itself is rendered (cyrl | latn).
 *
 * Kazakhstan is mid-alphabet-transition: Cyrillic is what everyone actually reads
 * today, Latin is what school materials are moving to. Hard-coding either one dates
 * the product, so the target language is stored in Cyrillic and transliterated at
 * render time. Answers are always graded against the stored Cyrillic.
 */

export const STRINGS = {
  ru: {
    appName: 'Aralas',
    tagline: 'Қазақ тілі — по правилам, а не наугад',
    learn: 'Учить', review: 'Повтор', grammar: 'Правила', profile: 'Профиль',
    continue: 'Дальше', check: 'Проверить', skip: 'Не знаю',
    streak: 'дней подряд', xp: 'XP', dailyGoal: 'Цель на день',
    unitLocked: 'Откроется после предыдущего блока',
    unitProgress: 'освоено',
    start: 'Начать', resume: 'Продолжить', practice: 'Практика',
    correct: 'Верно!', almost: 'Почти — следите за буквами', wrong: 'Не совсем',
    typoRetry: 'Опечатка — попробуйте ещё раз',
    answerWas: 'Правильный ответ',
    whyTitle: 'Почему так',
    sessionDone: 'Блок пройден',
    accuracy: 'Точность', earned: 'Получено',
    noDue: 'Сейчас нечего повторять — возвращайтесь позже',
    dueNow: 'к повторению',
    typeHere: 'Введите по-казахски',
    chooseTranslation: 'Выберите перевод',
    chooseWord: 'Выберите слово',
    chooseSuffix: 'Выберите окончание',
    typeFull: 'Напишите слово целиком',
    interfaceLang: 'Язык интерфейса', scriptLabel: 'Письменность казахского',
    goalLabel: 'Дневная цель (XP)', resetLabel: 'Сбросить прогресс',
    resetConfirm: 'Удалить весь прогресс? Это необратимо.',
    soundLabel: 'Звук', mistakesTitle: 'Разобрать ошибки',
    keyboardHint: 'Нет казахской раскладки? Нажимайте буквы ниже.',
    back: 'Назад', close: 'Закрыть', got: 'Понятно',
    weekTitle: 'Последние 7 дней', totalXp: 'Всего XP', wordsLearned: 'Слов освоено',
  },
  en: {
    appName: 'Aralas',
    tagline: 'Kazakh, by the rule — not by guesswork',
    learn: 'Learn', review: 'Review', grammar: 'Grammar', profile: 'Profile',
    continue: 'Continue', check: 'Check', skip: "Don't know",
    streak: 'day streak', xp: 'XP', dailyGoal: 'Daily goal',
    unitLocked: 'Unlocks after the previous unit',
    unitProgress: 'retained',
    start: 'Start', resume: 'Continue', practice: 'Practice',
    correct: 'Correct!', almost: 'Almost — mind the letters', wrong: 'Not quite',
    typoRetry: 'Typo — try again',
    answerWas: 'Correct answer',
    whyTitle: 'Why',
    sessionDone: 'Unit complete',
    accuracy: 'Accuracy', earned: 'Earned',
    noDue: 'Nothing due right now — come back later',
    dueNow: 'due',
    typeHere: 'Type it in Kazakh',
    chooseTranslation: 'Choose the meaning',
    chooseWord: 'Choose the word',
    chooseSuffix: 'Choose the ending',
    typeFull: 'Write the full word',
    interfaceLang: 'Interface language', scriptLabel: 'Kazakh script',
    goalLabel: 'Daily goal (XP)', resetLabel: 'Reset progress',
    resetConfirm: 'Delete all progress? This cannot be undone.',
    soundLabel: 'Sound', mistakesTitle: 'Review mistakes',
    keyboardHint: 'No Kazakh keyboard? Tap the letters below.',
    back: 'Back', close: 'Close', got: 'Got it',
    weekTitle: 'Last 7 days', totalXp: 'Total XP', wordsLearned: 'Words retained',
  },
};

export const t = (lang, key) => STRINGS[lang]?.[key] ?? STRINGS.ru[key] ?? key;

/* ------------------------------------------------------------------ *
 * Transliteration — 2021 official Latin alphabet (umlaut/breve variant)
 * ------------------------------------------------------------------ */

const CYRL_TO_LATN = {
  а: 'a', ә: 'ä', б: 'b', в: 'v', г: 'g', ғ: 'ğ', д: 'd', е: 'e', ж: 'j', з: 'z',
  и: 'ï', й: 'y', к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n', ң: 'ñ', о: 'o', ө: 'ö',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ұ: 'ū', ү: 'ü', ф: 'f', х: 'h', һ: 'h',
  ц: 'ts', ч: 'ch', ш: 'ş', щ: 'şş', ъ: '', ы: 'ı', і: 'i', ь: '', э: 'e',
  ю: 'yu', я: 'ya', ё: 'yo',
};

/** Render a Kazakh string in the learner's chosen script. Cyrillic passes through. */
export function toScript(text, script) {
  if (script !== 'latn' || !text) return text;
  let out = '';
  for (const ch of text) {
    const lower = ch.toLowerCase();
    const mapped = CYRL_TO_LATN[lower];
    if (mapped === undefined) { out += ch; continue; }
    out += ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
  }
  return out;
}

/**
 * Explanatory prose mixes the interface language with Kazakh examples, and Russian is
 * also Cyrillic — so a blanket transliteration would turn "Окончание" into Latin
 * gibberish. Kazakh spans are therefore marked in the source with {{…}} and only those
 * are converted; the braces are stripped either way.
 *
 *   'Окончание {{-лар}} после гласной' → 'Окончание -lar после гласной'
 */
export function renderMixed(text, script) {
  if (!text) return text;
  return text.replace(/\{\{(.+?)\}\}/g, (_, inner) => toScript(inner, script));
}
