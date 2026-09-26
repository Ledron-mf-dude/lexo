-- Lexo: initial schema. Run in Supabase Dashboard -> SQL Editor.

create table public.words (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  term        text not null,
  translation text not null,
  definition  text,
  example     text,
  created_at  timestamptz not null default now()
);

create table public.tags (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name    text not null,
  color   text,
  unique (user_id, name)
);

create table public.word_tags (
  word_id uuid not null references public.words(id) on delete cascade,
  tag_id  uuid not null references public.tags(id) on delete cascade,
  primary key (word_id, tag_id)
);

create table public.progress (
  id            uuid primary key default gen_random_uuid(),
  word_id       uuid not null unique references public.words(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ease_factor   double precision not null default 2.5,
  interval_days integer not null default 0,
  repetitions   integer not null default 0,
  due_at        timestamptz not null default now(),
  last_reviewed timestamptz,
  error_count   integer not null default 0
);

create table public.review_log (
  id          uuid primary key default gen_random_uuid(),
  word_id     uuid not null references public.words(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mode        text not null,
  correct     boolean not null,
  reviewed_at timestamptz not null default now()
);

create index words_user_idx      on public.words (user_id);
create index tags_user_idx       on public.tags (user_id);
create index word_tags_tag_idx   on public.word_tags (tag_id);
create index progress_due_idx    on public.progress (user_id, due_at);
create index review_log_user_idx on public.review_log (user_id, reviewed_at);

-- Every new word gets a progress row (due immediately), so CSV/Anki import needs no extra step.
create function public.create_progress_for_word() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.progress (word_id, user_id) values (new.id, new.user_id);
  return new;
end;
$$;

create trigger words_create_progress
after insert on public.words
for each row execute function public.create_progress_for_word();

-- Row Level Security: each user sees only their own rows.
alter table public.words      enable row level security;
alter table public.tags       enable row level security;
alter table public.word_tags  enable row level security;
alter table public.progress   enable row level security;
alter table public.review_log enable row level security;

create policy "own words"      on public.words      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own tags"       on public.tags       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own progress"   on public.progress   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own review log" on public.review_log for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own word tags" on public.word_tags for all
  using (exists (select 1 from public.words w where w.id = word_id and w.user_id = auth.uid()))
  with check (
    exists (select 1 from public.words w where w.id = word_id and w.user_id = auth.uid())
    and exists (select 1 from public.tags t where t.id = tag_id and t.user_id = auth.uid())
  );
