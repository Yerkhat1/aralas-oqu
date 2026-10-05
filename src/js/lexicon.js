/*
 * lexicon.js — seed curriculum.
 *
 * Shape mirrors the Postgres schema in db/schema.sql exactly, so swapping this
 * file for a `select` against Supabase is a one-line change in store.js.
 *
 * Curriculum design notes
 * -----------------------
 * • Units are 10 lexemes — one 4–6 minute session, per the reference brief.
 * • Every unit declares `drills`: which grammar paradigms its words feed. Vocabulary
 *   and grammar are not separate tracks; the grammar drill uses the words you just
 *   learned, so nothing is ever practised out of context.
 * • `harmony` is only set where the rule engine would guess wrong (loanwords).
 * • `note` carries the contrastive point — what a Russian or English speaker gets
 *   wrong here specifically. These surface after the first miss, not before.
 */

export const UNITS = [
  {
    id: 'greetings',
    order: 1,
    title: { kk: 'Сәлемдесу', ru: 'Приветствия', en: 'Greetings' },
    icon: '👋',
    drills: ['plural'],
    lexemes: [
      { id: 'salem', kk: 'сәлем', ru: 'привет', en: 'hi', pos: 'interj' },
      { id: 'salemetsiz', kk: 'сәлеметсіз бе', ru: 'здравствуйте', en: 'hello (formal)', pos: 'phrase',
        note: { ru: 'Буквально «вы благополучны?». Частица «{{бе}}» обязательна.', en: 'Literally "are you well?". The particle "{{бе}}" is obligatory.' } },
      { id: 'qairly_tang', kk: 'қайырлы таң', ru: 'доброе утро', en: 'good morning', pos: 'phrase' },
      { id: 'qairly_kesh', kk: 'қайырлы кеш', ru: 'добрый вечер', en: 'good evening', pos: 'phrase' },
      { id: 'raqmet', kk: 'рақмет', ru: 'спасибо', en: 'thank you', pos: 'interj' },
      { id: 'ia', kk: 'иә', ru: 'да', en: 'yes', pos: 'particle' },
      { id: 'joq', kk: 'жоқ', ru: 'нет', en: 'no', pos: 'particle' },
      { id: 'keshiriniz', kk: 'кешіріңіз', ru: 'извините', en: 'excuse me', pos: 'phrase' },
      { id: 'sau_bolyniz', kk: 'сау болыңыз', ru: 'до свидания', en: 'goodbye', pos: 'phrase' },
      { id: 'qalaysyn', kk: 'қалайсың', ru: 'как дела', en: 'how are you', pos: 'phrase' },
    ],
  },

  {
    id: 'numbers',
    order: 2,
    title: { kk: 'Сандар', ru: 'Числа', en: 'Numbers' },
    icon: '🔢',
    drills: ['plural'],
    lexemes: [
      { id: 'bir', kk: 'бір', ru: 'один', en: 'one', pos: 'num' },
      { id: 'eki', kk: 'екі', ru: 'два', en: 'two', pos: 'num' },
      { id: 'ush', kk: 'үш', ru: 'три', en: 'three', pos: 'num' },
      { id: 'tort', kk: 'төрт', ru: 'четыре', en: 'four', pos: 'num' },
      { id: 'bes', kk: 'бес', ru: 'пять', en: 'five', pos: 'num' },
      { id: 'alty', kk: 'алты', ru: 'шесть', en: 'six', pos: 'num' },
      { id: 'jeti', kk: 'жеті', ru: 'семь', en: 'seven', pos: 'num' },
      { id: 'segiz', kk: 'сегіз', ru: 'восемь', en: 'eight', pos: 'num' },
      { id: 'togyz', kk: 'тоғыз', ru: 'девять', en: 'nine', pos: 'num' },
      { id: 'on', kk: 'он', ru: 'десять', en: 'ten', pos: 'num',
        note: { ru: 'После числительного существительное НЕ ставится во множественное число: «{{екі кітап}}», не «{{екі кітаптар}}».',
                en: 'After a numeral the noun stays singular: "{{екі кітап}}", never "{{екі кітаптар}}".' } },
    ],
  },

  {
    id: 'family',
    order: 3,
    title: { kk: 'Отбасы', ru: 'Семья', en: 'Family' },
    icon: '👨‍👩‍👧',
    drills: ['plural', 'poss1sg'],
    lexemes: [
      { id: 'ana', kk: 'ана', ru: 'мать', en: 'mother', pos: 'noun' },
      { id: 'ake', kk: 'әке', ru: 'отец', en: 'father', pos: 'noun' },
      { id: 'aga', kk: 'аға', ru: 'старший брат', en: 'older brother', pos: 'noun',
        note: { ru: 'В казахском нет общего слова «брат» — возраст обязателен: {{аға}} (старший) vs {{іні}} (младший).',
                en: 'Kazakh has no generic "brother" — age is grammaticalised: {{аға}} (older) vs {{іні}} (younger).' } },
      { id: 'apa', kk: 'апа', ru: 'старшая сестра', en: 'older sister', pos: 'noun' },
      { id: 'ini', kk: 'іні', ru: 'младший брат', en: 'younger brother', pos: 'noun' },
      { id: 'qaryndas', kk: 'қарындас', ru: 'младшая сестра (для мужчины)', en: 'younger sister (of a man)', pos: 'noun',
        note: { ru: 'Мужчина говорит «{{қарындас}}», женщина — «{{сіңлі}}». Слово зависит от говорящего, а не от сестры.',
                en: 'A man says "{{қарындас}}", a woman says "{{сіңлі}}" — the word depends on the speaker, not the sister.' } },
      { id: 'ul', kk: 'ұл', ru: 'сын', en: 'son', pos: 'noun' },
      { id: 'qyz', kk: 'қыз', ru: 'дочь, девочка', en: 'daughter, girl', pos: 'noun' },
      { id: 'bala', kk: 'бала', ru: 'ребёнок', en: 'child', pos: 'noun' },
      { id: 'otbasy', kk: 'отбасы', ru: 'семья', en: 'family', pos: 'noun' },
    ],
  },

  {
    id: 'food',
    order: 4,
    title: { kk: 'Тағам', ru: 'Еда', en: 'Food' },
    icon: '🍞',
    drills: ['plural', 'accusative', 'poss3'],
    lexemes: [
      { id: 'nan', kk: 'нан', ru: 'хлеб', en: 'bread', pos: 'noun' },
      { id: 'su', kk: 'су', ru: 'вода', en: 'water', pos: 'noun' },
      { id: 'et', kk: 'ет', ru: 'мясо', en: 'meat', pos: 'noun' },
      { id: 'sut', kk: 'сүт', ru: 'молоко', en: 'milk', pos: 'noun' },
      { id: 'shai', kk: 'шай', ru: 'чай', en: 'tea', pos: 'noun' },
      { id: 'alma', kk: 'алма', ru: 'яблоко', en: 'apple', pos: 'noun' },
      { id: 'tuz', kk: 'тұз', ru: 'соль', en: 'salt', pos: 'noun' },
      { id: 'qant', kk: 'қант', ru: 'сахар', en: 'sugar', pos: 'noun' },
      { id: 'as', kk: 'ас', ru: 'еда, блюдо', en: 'food, dish', pos: 'noun' },
      { id: 'mai', kk: 'май', ru: 'масло', en: 'butter, oil', pos: 'noun' },
    ],
  },

  {
    id: 'home',
    order: 5,
    title: { kk: 'Үй', ru: 'Дом', en: 'Home' },
    icon: '🏠',
    drills: ['plural', 'locative', 'dative', 'ablative'],
    lexemes: [
      { id: 'uy', kk: 'үй', ru: 'дом', en: 'house', pos: 'noun' },
      { id: 'bolme', kk: 'бөлме', ru: 'комната', en: 'room', pos: 'noun' },
      { id: 'esik', kk: 'есік', ru: 'дверь', en: 'door', pos: 'noun' },
      { id: 'tereze', kk: 'терезе', ru: 'окно', en: 'window', pos: 'noun' },
      { id: 'ustel', kk: 'үстел', ru: 'стол', en: 'table', pos: 'noun' },
      { id: 'oryndyq', kk: 'орындық', ru: 'стул', en: 'chair', pos: 'noun' },
      { id: 'kitap', kk: 'кітап', ru: 'книга', en: 'book', pos: 'noun',
        note: { ru: 'Перед окончанием на гласный {{п}} → {{б}}: {{кітап}} + {{ы}} = {{кітабы}}.',
                en: 'Before a vowel-initial suffix {{п}} → {{б}}: {{кітап}} + {{ы}} = {{кітабы}}.' } },
      { id: 'tosek', kk: 'төсек', ru: 'кровать', en: 'bed', pos: 'noun' },
      { id: 'kilem', kk: 'кілем', ru: 'ковёр', en: 'carpet', pos: 'noun' },
      { id: 'qala', kk: 'қала', ru: 'город', en: 'city', pos: 'noun' },
    ],
  },

  {
    id: 'colors',
    order: 6,
    title: { kk: 'Түстер', ru: 'Цвета', en: 'Colours' },
    icon: '🎨',
    drills: ['plural'],
    lexemes: [
      { id: 'aq', kk: 'ақ', ru: 'белый', en: 'white', pos: 'adj' },
      { id: 'qara', kk: 'қара', ru: 'чёрный', en: 'black', pos: 'adj' },
      { id: 'qyzyl', kk: 'қызыл', ru: 'красный', en: 'red', pos: 'adj' },
      { id: 'kok', kk: 'көк', ru: 'синий, голубой', en: 'blue', pos: 'adj',
        note: { ru: '«{{Көк}}» — это и синий, и зелёный (о траве), и «небо». Один из ключевых культурных концептов.',
                en: '"{{Көк}}" covers blue, the green of growing grass, and "sky" — a core cultural concept.' } },
      { id: 'jasyl', kk: 'жасыл', ru: 'зелёный', en: 'green', pos: 'adj' },
      { id: 'sary', kk: 'сары', ru: 'жёлтый', en: 'yellow', pos: 'adj' },
      { id: 'qongyr', kk: 'қоңыр', ru: 'коричневый', en: 'brown', pos: 'adj' },
      { id: 'sur', kk: 'сұр', ru: 'серый', en: 'grey', pos: 'adj' },
      { id: 'kulgin', kk: 'күлгін', ru: 'фиолетовый', en: 'purple', pos: 'adj' },
      { id: 'ala', kk: 'ала', ru: 'пёстрый', en: 'motley, pied', pos: 'adj' },
    ],
  },

  {
    id: 'verbs',
    order: 7,
    title: { kk: 'Етістік', ru: 'Глаголы', en: 'Verbs' },
    icon: '🏃',
    drills: ['negation'],
    lexemes: [
      // For verbs, `kk` is the citation (infinitive) form and `stem` is what suffixes attach to.
      { id: 'baru', kk: 'бару', stem: 'бар', ru: 'идти, ехать', en: 'to go', pos: 'verb' },
      { id: 'kelu', kk: 'келу', stem: 'кел', ru: 'приходить', en: 'to come', pos: 'verb' },
      { id: 'jeu', kk: 'жеу', stem: 'же', ru: 'есть', en: 'to eat', pos: 'verb' },
      { id: 'ishu', kk: 'ішу', stem: 'іш', ru: 'пить', en: 'to drink', pos: 'verb' },
      { id: 'oqu', kk: 'оқу', stem: 'оқы', ru: 'читать, учиться', en: 'to read, to study', pos: 'verb',
        note: { ru: 'Основа «{{оқы}}», но перед {{-у}} гласная выпадает: {{оқы}} + {{у}} = {{оқу}}.',
                en: 'The stem is "{{оқы}}", but the {{ы}} drops before {{-у}}: {{оқы}} + {{у}} = {{оқу}}.' } },
      { id: 'jazu', kk: 'жазу', stem: 'жаз', ru: 'писать', en: 'to write', pos: 'verb' },
      { id: 'koru', kk: 'көру', stem: 'көр', ru: 'видеть', en: 'to see', pos: 'verb' },
      { id: 'turu', kk: 'тұру', stem: 'тұр', ru: 'вставать, стоять', en: 'to stand, to get up', pos: 'verb' },
      { id: 'otyru', kk: 'отыру', stem: 'отыр', ru: 'сидеть', en: 'to sit', pos: 'verb' },
      { id: 'isteu', kk: 'істеу', stem: 'істе', ru: 'делать', en: 'to do', pos: 'verb' },
    ],
  },

  {
    id: 'identity',
    order: 8,
    title: { kk: 'Мен кіммін?', ru: 'Кто я?', en: 'Who am I?' },
    icon: '🪪',
    drills: ['pred1sg', 'pred2formal', 'plural'],
    lexemes: [
      { id: 'student', kk: 'студент', ru: 'студент', en: 'student', pos: 'noun',
        note: { ru: 'В русском «Я студент» — без глагола. В казахском окончание обязательно: «{{Мен студентпін}}».',
                en: 'English needs "am"; Kazakh puts it on the noun as a suffix: "{{Мен студентпін}}".' } },
      { id: 'mugalim', kk: 'мұғалім', ru: 'учитель', en: 'teacher', pos: 'noun' },
      { id: 'dariger', kk: 'дәрігер', ru: 'врач', en: 'doctor', pos: 'noun' },
      { id: 'oqushy', kk: 'оқушы', ru: 'ученик', en: 'pupil', pos: 'noun' },
      { id: 'jumysshy', kk: 'жұмысшы', ru: 'рабочий', en: 'worker', pos: 'noun' },
      { id: 'injener', kk: 'инженер', ru: 'инженер', en: 'engineer', pos: 'noun', harmony: 'front' },
      { id: 'aspaz', kk: 'аспаз', ru: 'повар', en: 'cook', pos: 'noun' },
      { id: 'suretshi', kk: 'суретші', ru: 'художник', en: 'artist', pos: 'noun' },
      { id: 'anshi', kk: 'әнші', ru: 'певец', en: 'singer', pos: 'noun' },
      { id: 'qazaq', kk: 'қазақ', ru: 'казах', en: 'Kazakh', pos: 'noun' },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Grammar concepts — the "why" cards shown before a paradigm's first drill.
 * ------------------------------------------------------------------ */

export const CONCEPTS = {
  plural: {
    title: { ru: 'Множественное число: 6 форм', en: 'Plural: six shapes, one rule' },
    body: {
      ru: 'Окончание множественного числа имеет шесть вариантов: {{-лар/-лер, -дар/-дер, -тар/-тер}}. Выбор гласной задаёт гармония, выбор согласной — последний звук слова. Правило работает всегда, исключений почти нет.',
      en: 'The plural has six shapes: {{-лар/-лер, -дар/-дер, -тар/-тер}}. Harmony picks the vowel, the stem-final sound picks the consonant. The rule is exceptionless in native words.',
    },
  },
  locative: {
    title: { ru: 'Местный падеж вместо предлога «в»', en: 'Locative replaces "in"' },
    body: {
      ru: 'В казахском нет предлогов — «в доме» это одно слово: {{үйде}}. Предлог становится окончанием.',
      en: 'Kazakh has no prepositions. "In the house" is one word: {{үйде}}. The preposition becomes a suffix.',
    },
  },
  dative: {
    title: { ru: 'Направление: куда?', en: 'Direction: to where?' },
    body: {
      ru: '{{-ға/-ге/-қа/-ке}} отвечает на вопрос «кому? куда?». {{Мектепке}} — в школу.',
      en: '{{-ға/-ге/-қа/-ке}} answers "to whom / to where". {{Мектепке}} — to school.',
    },
  },
  ablative: {
    title: { ru: 'Источник: откуда?', en: 'Source: from where?' },
    body: {
      ru: 'Единственный падеж с тремя согласными вариантами: {{-дан}}, {{-тан}} и {{-нан}} (после {{м, н, ң}}).',
      en: 'The only case with three consonant variants: {{-дан}}, {{-тан}}, and {{-нан}} after {{м, н, ң}}.',
    },
  },
  accusative: {
    title: { ru: 'Винительный: только для определённого объекта', en: 'Accusative marks a *definite* object' },
    body: {
      ru: '«{{Кітап оқимын}}» — читаю книгу (любую). «{{Кітапты оқимын}}» — читаю эту книгу. Окончание = определённость.',
      en: '"{{Кітап оқимын}}" = I read a book. "{{Кітапты оқимын}}" = I read the book. The suffix carries definiteness.',
    },
  },
  genitive: {
    title: { ru: 'Принадлежность работает с двух сторон', en: 'Possession is marked twice' },
    body: {
      ru: 'Владелец получает {{-ның}}, а предмет — притяжательное окончание: {{баланың кітабы}}.',
      en: 'The possessor takes {{-ның}} and the possessed takes its own suffix: {{баланың кітабы}}.',
    },
  },
  instrumental: {
    title: { ru: 'Исключение: гармонии нет', en: 'The exception: no harmony' },
    body: {
      ru: '{{-мен/-бен/-пен}} не меняет гласную. Полезное напоминание, что гармония — не абсолютный закон.',
      en: '{{-мен/-бен/-пен}} never changes its vowel — a useful reminder that harmony is not absolute.',
    },
  },
  pred1sg: {
    title: { ru: 'Глагол «быть» — это окончание', en: '"To be" is a suffix' },
    body: {
      ru: 'В русском «Я врач» обходится без глагола. В казахском лицо выражается окончанием на самом существительном: {{Мен дәрігермін}}. Пропустить его — самая частая ошибка русскоязычных.',
      en: 'English needs "I am a doctor". Kazakh attaches the person to the noun itself: {{Мен дәрігермін}}. Dropping it is the single most common beginner error.',
    },
  },
  pred2formal: {
    title: { ru: 'Вежливое «Вы»', en: 'The polite "you"' },
    body: {
      ru: '{{-сыз/-сіз}}. Обращение на «{{сіз}}» к старшим обязательно — это не стилистика, а норма.',
      en: '{{-сыз/-сіз}}. Using "{{сіз}}" with elders is not a stylistic choice — it is required.',
    },
  },
  negation: {
    title: { ru: 'Отрицание внутри глагола', en: 'Negation lives inside the verb' },
    body: {
      ru: '{{-ма/-ме/-ба/-бе/-па/-пе}} ставится сразу после основы, до всех остальных окончаний.',
      en: '{{-ма/-ме/-ба/-бе/-па/-пе}} attaches straight to the stem, before every other suffix.',
    },
  },
  poss1sg: {
    title: { ru: 'Моё — это окончание', en: '"My" is a suffix too' },
    body: {
      ru: 'Окончание начинается с гласной, поэтому конечные {{қ, к, п}} смягчаются: {{кітап}} → {{кітабым}}.',
      en: 'The suffix starts with a vowel, so final {{қ, к, п}} soften: {{кітап}} → {{кітабым}}.',
    },
  },
  poss3: {
    title: { ru: 'Его / её', en: 'His / her / its' },
    body: {
      ru: '{{-ы/-і}} после согласной, {{-сы/-сі}} после гласной. Тоже вызывает смягчение: {{қонақ}} → {{қонағы}}.',
      en: '{{-ы/-і}} after a consonant, {{-сы/-сі}} after a vowel. Also triggers lenition: {{қонақ}} → {{қонағы}}.',
    },
  },
};

/** Flat lexeme index, keyed by id. */
export const LEXEMES = new Map();
for (const unit of UNITS) {
  for (const lx of unit.lexemes) {
    LEXEMES.set(lx.id, { ...lx, unitId: unit.id });
  }
}

/** The form suffixes actually attach to (verbs inflect from `stem`, not the infinitive). */
export const stemOf = (lx) => lx.stem ?? lx.kk;

/** Only single-word lexemes can be inflected; phrases are vocabulary-only. */
export const isInflectable = (lx) => !stemOf(lx).includes(' ');
