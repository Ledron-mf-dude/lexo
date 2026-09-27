-- Lexo: hard words, confusions and a separate schedule for recall. Run in Supabase Dashboard -> SQL Editor.

-- A personal hint or association for a word («asleep — a-SLEEP: спить»).
alter table public.words add column if not exists note text;

-- «Відкласти»: a word that does not stick is left out of practice until this moment.
alter table public.progress add column if not exists suspended_until timestamptz;

-- Recall (translation -> English word) gets its own schedule; the existing columns stay for recognition.
-- recall_due_at is null until the word is first practised in a recall exercise.
alter table public.progress
  add column if not exists recall_ease_factor   double precision not null default 2.5,
  add column if not exists recall_interval_days integer not null default 0,
  add column if not exists recall_repetitions   integer not null default 0,
  add column if not exists recall_due_at        timestamptz,
  add column if not exists recall_last_reviewed timestamptz;

-- The wrong answer that was picked (a translation or a word), to find pairs of words that get confused.
alter table public.review_log add column if not exists given text;
