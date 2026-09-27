-- Lexo: transcription and part of speech for words (filled from Wiktionary). Run in Supabase Dashboard -> SQL Editor.
-- The pronunciation recording goes into the existing words.audio_url column (0002_audio.sql).

alter table public.words
  add column if not exists ipa text,
  add column if not exists pos text;
