# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Lexo is an English vocabulary trainer with spaced repetition, a grammar knowledge base, and grammar exercises. It is a PWA built with Vite 8, React 19, TypeScript, and Tailwind v4. Supabase provides auth and Postgres. The site is deployed to GitHub Pages at `/lexo/`. There is no custom backend.

The UI text is in Ukrainian. Grammar explanations are in Ukrainian, and all examples are in English.

## Commands

```bash
npm run dev      # http://localhost:5173/lexo/
npm run build    # tsc -b && vite build (type errors fail the build)
npm run lint     # oxlint
```

- **Tests:** there is no test runner. Verify changes with `npm run build`, `npm run lint`, and the mock mode below.
- **Mock mode:** open `http://localhost:5173/lexo/?mock=1` in dev.
  - [src/dev/mock.ts](src/dev/mock.ts) fakes a logged-in user.
  - It patches `fetch` to Supabase REST with generated words, progress and logs.
  - It is dev-only and does nothing in production builds.
  - Use it to exercise UI flows without writing answers into a real account's progress.
- **Deploy:** a push to `main` builds and deploys through [.github/workflows/deploy.yml](.github/workflows/deploy.yml). `VITE_BASE` is set from the repo name there.
- **Supabase config:** the URL and publishable key live in `.env.production`. They are committed on purpose, because they are public values and RLS protects the data.
- **PWA caching:** the app uses `vite-plugin-pwa` with `autoUpdate`, so a new deploy appears on the second page load.

## Architecture

**Static content vs. user data.**
- Grammar articles and exercises are files in the repo. They are bundled at build time through `import.meta.glob`, so they work offline and search is instant.
- Supabase holds only per-user data: `words`, `tags`, `word_tags`, `progress`, `review_log` and `exercise_log`.
- Every table has RLS `user_id = auth.uid()`.
- Schema changes go in a new `supabase/migrations/NNNN_*.sql` file. The owner runs it by hand in the Supabase SQL editor, since there is no migration tooling. Say so explicitly whenever a change needs one.

**Grammar content** ([src/lib/grammar.ts](src/lib/grammar.ts)):
- Articles live in `src/content/grammar/<slug>.md`. The front matter has `title`, `category`, `levels` (CEFR, from `LEVELS`), `aliases`, `tags`, and an optional `wordTags`.
- The front matter parser is hand-rolled, with one `key: value` per line. List values are split on commas, so an alias must not contain a comma.
- Cross-references are written as `«Article title»` in the body and resolved to links through titles, title variants and aliases. An unresolved reference stays plain text.
- The search index is MiniSearch, ranked by title and topic first.
- Each article ends with a `## Типові помилки` section of lines in the form `- ✗ *wrong* → ✓ *right*`. [src/pages/GrammarArticle.tsx](src/pages/GrammarArticle.tsx) styles lines that start with ✗ as mistake cards.
- **Markdown pitfall:** bold markers directly between a letter and an apostrophe do not render (`I**'ll**`). Bold the whole word instead (`**I'll**`).

**Exercises** ([src/lib/exercises.ts](src/lib/exercises.ts)):
- Each bank is `src/content/exercises/<slug>.json`, and the file name must match the article slug.
- A file has the shape `{ "questions": [...] }`. There are three question types, all with `id`, `why` and an optional `hint`:
  - `choice`: `q`, `options`, and `answer`, which is an index into `options`;
  - `fill`: `q` containing `___`, and `answer`, which is a list of accepted strings;
  - `order`: `words`, and `answer`, which is a list of accepted sentences.
- A fourth type, `fix` («Знайди помилку»), is not written in JSON. `mistakeQuestions` generates it from the article's `- ✗ *wrong* → ✓ *right*` lines; alternatives after ` / ` become extra accepted answers. Pairs with «…», a slash inside a span, a BrE/AmE/register note, or a punctuation-only change are skipped. The id is a hash of the wrong sentence, so editing that sentence resets its log history. In the quiz, about 30% of draws show the corrected sentence instead, and the learner can mark an unrecognised correction as right («Мій варіант теж правильний»), which logs a newer correct row.
- Invalid questions are skipped with a console warning, not rejected at build time.
- Text answers are compared ignoring case, extra spaces, curly apostrophes and punctuation (`canon`).
- `drawDeck` interleaves the question types.
- Answers go to `exercise_log`. The "mistakes" review ([src/lib/exerciseLog.ts](src/lib/exerciseLog.ts) `allMistakes`) picks the questions whose latest answer was wrong.
- Question ids must stay stable, because the log references them.
- Placement test and learning path ([src/lib/learningPath.ts](src/lib/learningPath.ts)):
  - [src/pages/Placement.tsx](src/pages/Placement.tsx) is at `/grammar/placement`, declared before `grammar/:slug`.
  - It asks blocks of 4 choice/fill questions per level, A1 → A2 → B1 → B1+ → B2 (C1 has one topic), taken from topics whose starting level is that level. It stops at the first block with fewer than 3 right.
  - Answers go to `exercise_log`. The result (passed level, scores, weak topics) is kept in `localStorage` under `lexo.placement`.
  - [src/components/LearningPath.tsx](src/components/LearningPath.tsx) on the Grammar page builds the route with `buildRoute`: weak topics first, then topics of the study level.
  - A topic counts as learned after 8+ attempted questions with at least 80% of the latest answers right. The study level moves up once 80% of its topics are learned.
  - `QuestionView` and `Feedback` are exported from ExerciseQuiz for reuse.
- Grammar review ([src/lib/grammarReview.ts](src/lib/grammarReview.ts), [src/components/GrammarReview.tsx](src/components/GrammarReview.tsx)):
  - `reviewSchedule` derives spaced repetition from `exercise_log`, with no extra table. A question answered wrongly returns after 1 → 3 → 7 → 14 days. A right answer counts as a step only after at least 80% of the interval.
  - `CONTRAST_PAIRS` lists topics that are easy to confuse. `personalPairs` orders them by the user's current mistakes.
  - The sessions are `/grammar/practice?review=1` (due questions, most overdue first) and `?pair=a,b` (topics alternate, topic name hidden). Both use `Quiz`'s `ordered` deck.
- Writing coach ([src/pages/Writing.tsx](src/pages/Writing.tsx), `/grammar/writing`):
  - The text is checked by the public LanguageTool API ([src/lib/languageTool.ts](src/lib/languageTool.ts)). It is free and needs no key, but is limited to about 20 checks a minute.
  - `RULE_TOPICS` maps LanguageTool rule ids to article slugs.
  - Learnable mistakes become one personal card per sentence (`sentenceCards`). The cards are kept in `localStorage` ([src/lib/writingCards.ts](src/lib/writingCards.ts)).
  - The cards are practised as `fix` questions under the pseudo-topic `my-writing` (`/grammar/practice?type=mine`).
  - The British or American spelling check follows `lib/accent.ts`.

**Vocabulary practice** ([src/lib/session.ts](src/lib/session.ts), [src/components/practice/](src/components/practice/)):
- `pickWords` selects words by source: today, new, hard, all, or a subset.
- `buildQueue` builds one round per exercise type, in the order the user picked the types. A multi-exercise "complex" runs the rounds sequentially, not interleaved.
- `passage` (text with gaps plus a word bank, 5 examples per card, grouped by first tag) is also a group card and reuses `onMatched` grading. `dictation` reads a word's example aloud and compares the typed sentence word by word.
- `match`, `matchdef` and `cloze` use group cards: several words per card, with `commitFor` deciding when each word's result is recorded.
- Scheduling is SM-2 ([src/lib/sm2.ts](src/lib/sm2.ts)). Within a complex, a word's grades are combined with `complexGrade`, and `progress` is updated once per word per session. Every answer also goes to `review_log` for stats and streaks.
- [src/components/practice/Session.tsx](src/components/practice/Session.tsx) drives the flow.

**Tags and import:**
- [src/lib/tagTaxonomy.ts](src/lib/tagTaxonomy.ts) defines the built-in tags in two groups: «Теми» (meaning) and «Мова» (kind of expression). Any other tag name counts as the user's own («Мої теги»). The UI groups tags with `groupTags`.
- [src/content/wordTopics.json](src/content/wordTopics.json) maps a lowercased term to built-in tag codes. It loads lazily through `loadTopicDictionary`.
- `suggestTags` uses that dictionary for known words and simple shape rules (sentence, phrasal verb, -ing) for the rest. It is used in three places:
  - the «Підібрати теги» dialog on the Tags page ([src/components/AutoTagDialog.tsx](src/components/AutoTagDialog.tsx) plus `useAutoTag`);
  - the import dialog;
  - the word form.
- Tag names are matched by text. Renaming a built-in tag makes it a personal one, and article `wordTags` front matter refers to tags by name.
- [src/content/wordDetails.json](src/content/wordDetails.json) gives known words a plain-English definition and an example that contains the word. It loads lazily through `loadWordDetails` in [src/lib/wordDetails.ts](src/lib/wordDetails.ts). `fillFor` fills only empty fields and is used by the «Доповнити» card on the Words page, by import, and by the word form. Definitions must not contain the word itself, otherwise «Слово ↔ пояснення» becomes trivial.
- [src/content/wordLevels.json](src/content/wordLevels.json) holds the project's own CEFR estimate (A1–C2) for the built-in words. It is not Cambridge's English Vocabulary Profile, which is licensed. Personal sentences, names and narrow jargon have no level. The file loads lazily through `useWordLevels` ([src/lib/wordLevels.ts](src/lib/wordLevels.ts)). It drives the level badge and filter on the Words page, the level chips on Practice (not applied to a grammar-article subset), and «Словник за рівнями» on Stats.
- [src/lib/wiktionary.ts](src/lib/wiktionary.ts) looks words up on English Wiktionary. It is free, needs no key, and supports CORS; the text is CC BY-SA, so keep the attribution links. Wiktionary is used instead of dictionaryapi.dev, which is only a proxy over it and is often down, and instead of the Cambridge API, which is licensed.
  - It reads the transcription, the recording (Commons `{{audio}}`, British first) and the parts of speech from the page wikitext, plus a definition and an example from the REST definition endpoint.
  - Words it cannot find are remembered in `localStorage`, so the bulk lookup does not ask for them again.
  - The word form uses it with a debounce. Transcription, part of speech and recording are saved without asking; the definition and example need a tap.
  - [src/components/PronunciationCard.tsx](src/components/PronunciationCard.tsx) runs the bulk lookup on the Words page.
  - The data is stored in `words.ipa`, `words.pos` (migration 0004) and `words.audio_url`. Bulk import (`useImportWords`) saves these fields too, when the rows have them. Before migration 0004 is run, saving falls back to the old columns (`isMissingColumn`, error code PGRST204).
- «Слова з тексту» ([src/components/AddFromTextDialog.tsx](src/components/AddFromTextDialog.tsx)) works on pasted text.
  - [src/lib/textWords.ts](src/lib/textWords.ts) splits the text into tokens. It marks words already in the dictionary, matching inflected forms through `baseForms` and multi-word terms (including `sth`/`sb` placeholders) through `findPhrases`.
  - The user taps new words and can grow a selection into a phrase.
  - Each chosen word gets a draft translation from MyMemory ([src/lib/translate.ts](src/lib/translate.ts)) plus Wiktionary data. The sentence it came from becomes its example.
  - Only the chosen words are sent to these services, never the whole text.
- The development plan agreed with the owner is in [ROADMAP.md](ROADMAP.md).
- [src/lib/importFormats.ts](src/lib/importFormats.ts) parses the import formats. The format is chosen by file extension, then by content.
  - Formats: Anki `.txt` and `.apkg`, CSV/TSV/text lists (the separator is detected), Google Translate CSV, `.xlsx`, JSON.
  - If most rows are "Ukrainian, English", the columns are swapped.
  - `.apkg` needs `sql.js` (a WASM file, fetched only when needed), `fflate` and `fzstd` (for Anki 23.10+ `collection.anki21b`). All of them are dynamically imported, so they stay out of the main bundle.

**App shell:**
- Routing uses `HashRouter` because of GitHub Pages. Grammar pages and stats are lazy-loaded through `lazyPage` ([src/lib/lazyPage.ts](src/lib/lazyPage.ts)). After a deploy the service worker removes old chunks, so `lazyPage` reloads the page once when a chunk is missing. Use `lazyPage` instead of plain `React.lazy`.
- Scroll position is managed by the app, not the browser. `ScrollRestoration` in [src/components/Layout.tsx](src/components/Layout.tsx) opens each new page at the top and restores the position on Back. Do not use `autoFocus` on pages: it scrolls to the input. Call `focus({ preventScroll: true })` instead.
- The static route `grammar/practice` (mixed quiz) must be declared before `grammar/:slug`.
- Server state goes through TanStack Query hooks in [src/lib/queries.ts](src/lib/queries.ts).
- Auth works as follows:
  - `AuthProvider` is in [src/lib/auth.tsx](src/lib/auth.tsx), and `useAuth` and the context are in [src/lib/authContext.ts](src/lib/authContext.ts). They are split to satisfy oxlint's `only-export-components`.
  - [src/lib/authHash.ts](src/lib/authHash.ts) must be imported before supabase-js initialises. It reads the password-recovery hash before supabase-js clears it.
- Other hooks and utilities:
  - `useFocusMode` hides the nav and header on phones during practice.
  - `useTitle` sets the tab title.
  - British or American English is a per-browser choice (`lib/accent.ts`, Account page). The browser voice, Wiktionary's recording and transcription picks, and the LanguageTool variant all follow it.
  - Speech uses the browser's Web Speech API ([src/lib/speech.ts](src/lib/speech.ts)). The word list registers each word's `audio_url` (`setRecordings`), so `speak(term)` plays the real recording when there is one. Safari cannot play Ogg Vorbis, so it falls back to the synthetic voice.
- Vendor chunks (react, supabase, data) are split in `vite.config.ts` through `rolldownOptions.output.codeSplitting.groups`.
- Small per-device preferences are stored in `localStorage` under keys prefixed `lexo.`.
- Ukrainian plurals go through `plural` / `count` in [src/lib/plural.ts](src/lib/plural.ts), for example `count(n, WORD)` gives «1 слово», «3 слова», «5 слів». Do not hard-code «слів».
- Filter pills use the `chip` utility with `data-on={selected}` ([src/index.css](src/index.css)). The `chip-row` utility scrolls sideways on phones and wraps on wider screens.

## Conventions

- **Content must be original.** External sites such as test-english.com may be used as a topic map, but do not copy their text or examples.
- **Line endings:** content files use CRLF. Keep them when editing with scripts.
- **README:** keep the content section of [README.md](README.md) roughly in sync when adding articles or exercise types.
