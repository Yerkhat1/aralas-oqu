-- =====================================================================
-- Aralas — Postgres schema (Supabase)
--
-- WHY POSTGRES, AND WHY SUPABASE SPECIFICALLY
-- -------------------------------------------
-- The decision hinges on four requirements that are unusual for a language app,
-- and Kazakh drives three of them:
--
-- 1. COLLATION. Kazakh Cyrillic has nine letters outside the Russian block
--    (ә ғ қ ң ө ұ ү һ і). Under the default UTF-8 byte-order collation they sort
--    *after* я, so any alphabetical word list is wrong — "әке" lands at the end of
--    the dictionary instead of next to "ана". Postgres is the only mainstream option
--    with first-class ICU collation per column (`kk-KZ`). MongoDB's collation support
--    does not cover kk; Firestore has no collation control at all.
--
-- 2. TYPO-TOLERANT LOOKUP. Learners type "аке" for "әке". `pg_trgm` gives an indexed
--    similarity search over a folded form, so search and grading agree.
--
-- 3. ANALYTIC REVIEW HISTORY. Choosing the next card, and later fitting FSRS
--    parameters, are window-function queries over an append-only log. This is
--    exactly what a document store is worst at and what SQL is for.
--
-- 4. NO BACKEND TO WRITE. Row Level Security lets the client talk to the database
--    directly with per-user isolation enforced by the engine, so a two-person team
--    ships without an API tier. That is Supabase's actual value here — plus built-in
--    auth, and Storage for the audio blobs (see `audio_path`).
--
-- Rejected: Firebase/Firestore (no collation, no joins, review-history queries become
-- client-side scans), MongoDB (same collation problem, weaker constraints on data a
-- linguist is hand-editing), SQLite-only (no multi-device sync, and progress on a
-- lost phone is gone).
--
-- Region note: Supabase `eu-central-1` (Frankfurt) is the lowest-latency region for
-- Kazakhstan on the free tier (~70–90 ms RTT), well ahead of us-east-1.
-- =====================================================================

create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

-- ---------------------------------------------------------------------
-- Kazakh collation
-- ---------------------------------------------------------------------
-- ICU knows Kazakh alphabetical order; the default database collation does not.
do $$
begin
  if not exists (select 1 from pg_collation where collname = 'kk_kz') then
    execute $c$ create collation kk_kz (provider = icu, locale = 'kk-KZ', deterministic = false) $c$;
  end if;
exception when others then
  raise notice 'ICU collation kk-KZ unavailable; falling back to default ordering';
end $$;

-- ---------------------------------------------------------------------
-- Folding: Kazakh-specific letters → nearest Russian-keyboard neighbour.
-- `unaccent` does NOT cover these, so it is spelled out. Must be IMMUTABLE to be
-- indexable. Mirrors FOLD in src/js/grader.js — the two must stay in sync, which is
-- why both are small and explicit.
-- ---------------------------------------------------------------------
create or replace function kk_fold(txt text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select translate(lower(txt),
                   'әғқңөұүһі',
                   'агкноуухи');
$$;

-- =====================================================================
-- CONTENT  (authored; readable by everyone, writable only by editors)
-- =====================================================================

create table if not exists unit (
  id            text primary key,
  ord           int  not null unique,
  icon          text,
  title_kk      text not null,
  title_ru      text not null,
  title_en      text not null,
  -- Paradigms this unit drills, e.g. '{plural,locative}'. Referenced by paradigm.id.
  drills        text[] not null default '{}',
  published     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- The grammar engine's paradigm table, mirrored so content editors can see and
-- reference it. The allomorph rules themselves stay in code (src/js/phonology.js) —
-- they are logic, not data, and they need to run offline in the client.
create table if not exists paradigm (
  id            text primary key,          -- 'plural', 'locative', …
  name_kk       text not null,
  name_ru       text not null,
  name_en       text not null,
  vowel_initial boolean not null default false,
  harmonyless   boolean not null default false,
  ord           int not null default 0
);

create table if not exists lexeme (
  id            text primary key,
  unit_id       text not null references unit(id) on delete cascade,

  -- Citation form, always stored in CYRILLIC. Latin is generated at render time:
  -- the 2021 alphabet reform is still moving, and storing a second script would mean
  -- migrating every row each time the standard is amended.
  kk            text not null collate kk_kz,

  -- What suffixes actually attach to. Differs from `kk` for verbs (оқу → оқы).
  stem          text,

  ru            text not null,
  en            text not null,
  pos           text not null,             -- noun | verb | adj | num | phrase | …

  -- Harmony override. The rule engine derives back/front from the last decisive
  -- vowel and is right for native vocabulary, but Russian loanwords break harmony
  -- ("институт" looks front by its last vowel and is back). NULL = trust the rule.
  harmony       text check (harmony in ('back','front')),

  -- Irregular stem before a vowel-initial suffix, for words that syncopate rather
  -- than simply lenite (халық → халқы, where the rule alone would give халығы).
  stem_alt      text,

  -- Contrastive note, surfaced after a miss. Kazakh spans are wrapped in {{…}} so the
  -- client can transliterate them without touching the surrounding Russian.
  note_ru       text,
  note_en       text,

  audio_path    text,                      -- Supabase Storage key for the recording
  freq_rank     int,                       -- corpus frequency, drives unit ordering
  ord           int not null default 0,

  -- Generated folded form: powers typo-tolerant search and the "diacritic" grade tier.
  kk_folded     text generated always as (kk_fold(kk)) stored
);

create index if not exists lexeme_unit_idx      on lexeme (unit_id, ord);
create index if not exists lexeme_folded_trgm   on lexeme using gin (kk_folded gin_trgm_ops);
create index if not exists lexeme_kk_sort       on lexeme (kk collate kk_kz);

-- =====================================================================
-- LEARNER STATE  (per user; RLS-isolated)
-- =====================================================================

create table if not exists profile (
  id            uuid primary key references auth.users(id) on delete cascade,
  ui_lang       text not null default 'ru' check (ui_lang in ('ru','en')),
  script        text not null default 'cyrl' check (script in ('cyrl','latn')),
  daily_goal    int  not null default 20 check (daily_goal between 5 and 500),
  sound_on      boolean not null default true,
  timezone      text not null default 'Asia/Almaty',
  created_at    timestamptz not null default now()
);

-- Scheduler state. The unit is (lexeme × skill), NOT lexeme alone: knowing that
-- "кітап" means book and knowing it pluralises to "кітаптар" are separate memories,
-- and in an agglutinative language the second is where learners actually fail.
create table if not exists user_memory (
  user_id       uuid not null references auth.users(id) on delete cascade,
  lexeme_id     text not null references lexeme(id) on delete cascade,
  skill         text not null,             -- 'vocab' or a paradigm.id
  ease          real not null default 2.5,
  interval_days int  not null default 0,
  step          int  not null default 0,
  due_at        timestamptz,
  reps          int  not null default 0,
  lapses        int  not null default 0,
  streak        int  not null default 0,
  last_seen_at  timestamptz,
  primary key (user_id, lexeme_id, skill)
);

-- The hot query: "what is due for me now".
create index if not exists user_memory_due_idx on user_memory (user_id, due_at)
  where due_at is not null;

-- Append-only. Never updated, never deleted. Two reasons: the client is offline-first
-- so a flush must be safely replayable, and fitting FSRS parameters later needs the
-- raw history — which cannot be reconstructed from the derived state above.
create table if not exists review_log (
  id             bigint generated always as identity primary key,
  -- Client-generated idempotency key, so replaying a queued outbox is a no-op.
  client_id      uuid not null,
  user_id        uuid not null references auth.users(id) on delete cascade,
  lexeme_id      text not null references lexeme(id) on delete cascade,
  skill          text not null,
  rating         smallint not null check (rating between 0 and 3),
  verdict        text,                     -- correct | diacritic | typo | wrong | skipped
  answer_given   text,
  elapsed_ms     int,
  interval_after int,
  ease_after     real,
  reviewed_at    timestamptz not null,
  unique (user_id, client_id)
);

create index if not exists review_log_user_time_idx on review_log (user_id, reviewed_at desc);
-- Supports the error-analysis query below without scanning the whole log.
create index if not exists review_log_skill_idx on review_log (skill, verdict)
  where verdict in ('wrong','diacritic');

create table if not exists user_day (
  user_id       uuid not null references auth.users(id) on delete cascade,
  day           date not null,
  xp            int  not null default 0,
  goal_met      boolean not null default false,
  primary key (user_id, day)
);

create table if not exists user_streak (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  count         int  not null default 0,
  last_day      date,
  freezes       int  not null default 1
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

alter table profile      enable row level security;
alter table user_memory  enable row level security;
alter table review_log   enable row level security;
alter table user_day     enable row level security;
alter table user_streak  enable row level security;
alter table unit         enable row level security;
alter table lexeme       enable row level security;
alter table paradigm     enable row level security;

-- Content: world-readable once published, writable only through the service role.
create policy content_read_unit     on unit     for select using (published);
create policy content_read_lexeme   on lexeme   for select using (
  exists (select 1 from unit u where u.id = lexeme.unit_id and u.published));
create policy content_read_paradigm on paradigm for select using (true);

-- Learner data: strictly own-row.
create policy own_profile  on profile     for all using (auth.uid() = id)      with check (auth.uid() = id);
create policy own_memory   on user_memory for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_day      on user_day    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_streak   on user_streak for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- review_log is insert-and-read only: no update, no delete, even by the owner.
-- An append-only log that the client can rewrite is not a log.
create policy own_log_insert on review_log for insert with check (auth.uid() = user_id);
create policy own_log_read   on review_log for select using  (auth.uid() = user_id);

-- =====================================================================
-- QUERIES THE APP ACTUALLY RUNS
-- =====================================================================

-- Next batch of due material, due-first then weakest.
create or replace function due_queue(p_limit int default 16)
returns table (lexeme_id text, skill text, due_at timestamptz, reps int)
language sql
stable
security invoker
as $$
  select m.lexeme_id, m.skill, m.due_at, m.reps
  from user_memory m
  where m.user_id = auth.uid()
    and m.due_at is not null
    and m.due_at <= now()
  order by m.due_at asc, m.interval_days asc
  limit p_limit;
$$;

-- Content-quality feedback loop: which items are hardest, across all learners.
-- A lexeme with a high wrong-rate is usually a curriculum bug — a bad distractor, an
-- ambiguous gloss, or a word placed in the wrong unit — not a hard word. This view is
-- how the content stays honest once real learners are on it.
create or replace view item_difficulty as
select
  l.id                                            as lexeme_id,
  l.kk,
  l.unit_id,
  r.skill,
  count(*)                                        as attempts,
  count(*) filter (where r.verdict = 'wrong')     as wrong,
  count(*) filter (where r.verdict = 'diacritic') as diacritic_only,
  round(100.0 * count(*) filter (where r.verdict = 'wrong') / nullif(count(*),0), 1) as wrong_pct,
  round(avg(r.elapsed_ms))                        as median_ms
from review_log r
join lexeme l on l.id = r.lexeme_id
group by l.id, l.kk, l.unit_id, r.skill
having count(*) >= 20
order by wrong_pct desc;

-- Typo-tolerant lookup for the dictionary search box.
create or replace function search_lexeme(q text, p_limit int default 20)
returns setof lexeme
language sql
stable
as $$
  select *
  from lexeme
  where kk_folded % kk_fold(q)
     or ru ilike '%' || q || '%'
     or en ilike '%' || q || '%'
  order by similarity(kk_folded, kk_fold(q)) desc, freq_rank nulls last
  limit p_limit;
$$;
