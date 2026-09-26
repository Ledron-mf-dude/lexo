-- Grammar exercises: one row per answered question, so the app can show how well each topic is known.
-- The questions themselves are files in the project (src/content/exercises); only the results live here.

create table public.exercise_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  article_slug  text not null,
  question_id   text not null,
  correct       boolean not null,
  answered_at   timestamptz not null default now()
);

create index exercise_log_topic_idx on public.exercise_log (user_id, article_slug, answered_at desc);

alter table public.exercise_log enable row level security;

create policy "own exercise log" on public.exercise_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
