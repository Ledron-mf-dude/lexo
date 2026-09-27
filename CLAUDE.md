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

**Vocabulary practice** ([src/lib/session.ts](src/lib/session.ts), [src/components/practice/](src/components/practice/)):
- `pickWords` selects words by source: today, new, hard, all, or a subset.
- `buildQueue` builds one round per exercise type, in the order the user picked the types. A multi-exercise "complex" runs the rounds sequentially, not interleaved.
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
  - Speech uses the browser's Web Speech API ([src/lib/speech.ts](src/lib/speech.ts)).
- Vendor chunks (react, supabase, data) are split in `vite.config.ts` through `rolldownOptions.output.codeSplitting.groups`.
- Small per-device preferences are stored in `localStorage` under keys prefixed `lexo.`.
- Ukrainian plurals go through `plural` / `count` in [src/lib/plural.ts](src/lib/plural.ts), for example `count(n, WORD)` gives «1 слово», «3 слова», «5 слів». Do not hard-code «слів».
- Filter pills use the `chip` utility with `data-on={selected}` ([src/index.css](src/index.css)). The `chip-row` utility scrolls sideways on phones and wraps on wider screens.

## Conventions

- **Content must be original.** External sites such as test-english.com may be used as a topic map, but do not copy their text or examples.
- **Line endings:** content files use CRLF. Keep them when editing with scripts.
- **README:** keep the content section of [README.md](README.md) roughly in sync when adding articles or exercise types.
