-- TTS pronunciation: audio file link on the word + Storage bucket for generated mp3 files.

alter table public.words add column audio_url text;

-- Public bucket: files are short pronunciations, links are not guessable (user_id/word_id.mp3).
insert into storage.buckets (id, name, public)
values ('word-audio', 'word-audio', true)
on conflict (id) do nothing;

-- Users may only write inside their own folder: <user_id>/<file>.
create policy "own audio insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'word-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own audio update" on storage.objects for update to authenticated
  using (bucket_id = 'word-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own audio delete" on storage.objects for delete to authenticated
  using (bucket_id = 'word-audio' and (storage.foldername(name))[1] = auth.uid()::text);
