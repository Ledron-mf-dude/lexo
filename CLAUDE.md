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
- Grammar articles and exercises are files in the repo. The content plugin [vite/lexoContent.ts](vite/lexoContent.ts) prepares them at build time as virtual modules (see «Grammar content»), and the service worker precaches every chunk, so they work offline.
- Supabase holds only per-user data: `words`, `tags`, `word_tags`, `progress`, `review_log` and `exercise_log`.
- Every table has RLS `user_id = auth.uid()`.
- Schema changes go in a new `supabase/migrations/NNNN_*.sql` file. The owner runs it by hand in the Supabase SQL editor, since there is no migration tooling. Say so explicitly whenever a change needs one.

**Grammar content** ([src/lib/grammar.ts](src/lib/grammar.ts)):
- Articles live in `src/content/grammar/<slug>.md`. The front matter has `title`, `category`, `levels` (CEFR, from `LEVELS`: A1–C2), `aliases`, `tags`, and an optional `wordTags`.
- Short «X чи Y» topics (say/tell, lie/lay, until/by…) have the category «Короткі теми» (`SHORTS` in grammar.ts) and `levels: []`. They belong to no level: in «За рівнями» they form their own group after C2, they stay out of the route and the placement test, and the «Короткі теми» chip on the Grammar page toggles their category filter. An article without levels is no longer given a default one, so every other article must list its levels.
- The front matter parser is hand-rolled, with one `key: value` per line. List values are split on commas, so an alias must not contain a comma.
- Cross-references are written as `«Article title»` in the body and resolved to links through titles, title variants and aliases. An unresolved reference stays plain text.
- Loading ([vite/lexoContent.ts](vite/lexoContent.ts)): parsing lives in pure modules ([src/lib/content/articles.ts](src/lib/content/articles.ts), [src/lib/content/questions.ts](src/lib/content/questions.ts)) that the plugin runs in Node. They must not use browser or Vite APIs and import each other with `.ts` extensions.
  - `virtual:lexo/grammar` holds the article metadata (`articles`, always in the bundle) and loaders. An article's body and terms come from `loadArticle(slug)`; pages read it with `use(loadArticle(slug))` inside Suspense (the route's, or their own as `RuleSheet` does). Full-text search loads on the first query (`loadTextSearch`); title and topic matches need no load.
  - `virtual:lexo/exercises` holds the question ids per topic (`exerciseIds`; progress, statuses and Stats need only these) and a loader per bank. A page that draws questions calls `use(loadQuestions(slugs))` for every topic it draws from; `itemsOf` / `bankOf` read the loaded banks only.
  - Editing a file in `src/content/grammar` or `src/content/exercises` rebuilds the content and reloads the page in dev. Types of the virtual modules are in [src/virtual-lexo.d.ts](src/virtual-lexo.d.ts).
- The search index is MiniSearch, ranked by title and topic first.
- The article page shows `## Як вибрати` at the top as a «Коротко: як вибрати» block (open or closed per device, `articleSummaryPref`) and leaves it out of the body below.
- The article list folds its groups (category or level); the opened ones are remembered in `localStorage` (`lexo.grammarOpen`). A level or topic filter unfolds everything. In «За рівнями» the study level of the route comes first and is open by default.
- Before it, every article has `## Як вибрати` (numbered steps for choosing the form) and `## Пастки перекладу` (where Ukrainian leads to a wrong English form). `ruleFinder` gives these two summary sections and `## Типові помилки` a lower weight, so «Правило» opens the section that explains the rule.
- Each article ends with a `## Типові помилки` section of lines in the form `- ✗ *wrong* → ✓ *right*`. [src/pages/GrammarArticle.tsx](src/pages/GrammarArticle.tsx) styles lines that start with ✗ as mistake cards.
- **Markdown pitfall:** bold markers directly between a letter and an apostrophe do not render (`I**'ll**`). Bold the whole word instead (`**I'll**`).

**Exercises** ([src/lib/exercises.ts](src/lib/exercises.ts)):
- Each bank is `src/content/exercises/<slug>.json`, and the file name must match the article slug.
- A file has the shape `{ "questions": [...] }`. There are three question types, all with `id`, `why` and an optional `hint`:
  - `choice`: `q`, `options`, and `answer`, which is an index into `options`;
  - `fill`: `q` containing `___`, and `answer`, which is a list of accepted strings;
  - `order`: `words`, and `answer`, which is a list of accepted sentences.
- A fourth type, `fix` («Знайди помилку»), is not written in JSON. `mistakeQuestions` generates it from the article's `- ✗ *wrong* → ✓ *right*` lines; alternatives after ` / ` become extra accepted answers. Pairs with «…», a slash inside a span, a BrE/AmE/register note, or a punctuation-only change are skipped. The id is a hash of the wrong sentence, so editing that sentence resets its log history. In the quiz, about 30% of draws show the corrected sentence instead, and the learner can mark an unrecognised correction as right («Мій варіант теж правильний»), which logs a newer correct row.
- **Explanations (`why`)** state the rule, why the answer fits this sentence and, for choice questions, why the tempting wrong option fails; accepted alternatives are mentioned. English goes in `*italics*`, which the quiz renders (`RichText`). In find-the-mistake feedback the changed words are highlighted (`lib/wordDiff.ts`).
- **One right answer, or all of them.**
  - A `choice` question must have exactly one option that is right in context. The distractors must be wrong, not just less typical: a train that «will leave» at 9:15 is not a mistake.
  - A `fill` gap where several words fit (would / could / might, just / already, a time-clause tense) either lists them all in `answer` or narrows the gap with a cue: a base verb in brackets in `q`, or a `hint` such as «(досі)» or «(do / make)».
  - A `- ✗ … → ✓ …` pair must be wrong in any context, so add the words that rule out the right reading (*I drink the coffee every morning*, not *I like the coffee*). Other natural corrections go after ` / `. A form that is only informal or regional gets a BrE/AmE/розмовне note, which keeps it out of the quiz.
  - An `order` sentence lists every natural word order, for example a clause or a time phrase moved to the front, or a separable phrasal verb.
  - After an answer the quiz shows the other accepted answers («Також правильно»). A typed or built answer that was not recognised can be counted with «Мій варіант теж правильний»; the placement test does not offer this.
- Invalid questions are skipped with a build warning from the content plugin, not rejected.
- Text answers are compared ignoring case, extra spaces, curly apostrophes, punctuation and contractions (`canon` spells out `n't`, `'re`, `'m`, `'ll`, `'ve`, `'d` as «would», and `'s` after pronouns).
- `drawDeck` picks questions through `prioritize`: never-answered first, then latest-wrong, then the rest by oldest answer (from `answerHistory` of `exercise_log`), so a topic is covered in full before anything repeats. It then interleaves the question types. Unseen questions are marked «нове» in the quiz.
- `useLogAnswer` adds each answer to the cached log optimistically instead of refetching the whole log.
- Answers go to `exercise_log`. The "mistakes" review ([src/lib/exerciseLog.ts](src/lib/exerciseLog.ts) `allMistakes`) picks the questions whose latest answer was wrong.
- Question ids must stay stable, because the log references them.
- Placement test and learning path ([src/lib/learningPath.ts](src/lib/learningPath.ts)):
  - [src/pages/Placement.tsx](src/pages/Placement.tsx) is at `/grammar/placement`, declared before `grammar/:slug`.
  - It asks blocks of 6 questions per level, A1 → A2 → B1 → B1+ → B2 → C1 → C2, one per topic. A level counts as passed with 5 right. A failed block does not end the test; only a block with no right answers does.
  - The questions come from a hand-picked list per level, [src/content/placement.json](src/content/placement.json), of question ids. Whole banks are not used because they also hold harder and theory questions, and the test has no «Мій варіант теж правильний». A listed question must have a gap, be of that level, and have exactly one right answer.
  - Answers go to `exercise_log`. The result (passed level, scores, weak topics) is kept in `localStorage` under `lexo.placement`.
  - [src/components/LearningPath.tsx](src/components/LearningPath.tsx) on the Grammar page builds the route with `buildRoute`: weak topics first, then topics of the study level.
  - Before the test, the route panel offers a level picked by hand (the test itself is the «Сьогодні» card's button). It is saved as a placement with no scores and `passed` set to the level below.
  - A topic counts as learned (`topicStatus`, «засвоєно») when the latest answer is right for at least 80% of all its questions. The same rule is used by the topic list, the article, Stats and the route. Question-level wording is «правильно». The study level moves up once 80% of its topics are learned.
  - `QuestionView` and `Feedback` are exported from ExerciseQuiz for reuse.
- Quiz screen ([src/pages/ExerciseQuiz.tsx](src/pages/ExerciseQuiz.tsx)):
  - On phones the answers sit at the bottom (flex + `mt-auto`) and `Feedback` is a fixed bottom sheet with «Далі».
  - «Правило» opens [src/components/RuleSheet.tsx](src/components/RuleSheet.tsx): the article section picked by `ruleSectionIndex` ([src/lib/ruleFinder.ts](src/lib/ruleFinder.ts), clue words from `why` and the answer), with chips for the other sections. Article markdown is rendered by [src/components/ArticleMarkdown.tsx](src/components/ArticleMarkdown.tsx).
  - Per-device settings live in [src/lib/prefs.ts](src/lib/prefs.ts) (`createPref`): round length of a topic quiz (10 / 20 / whole topic) and auto-advance after a right answer. They are edited in `QuizSettings` under the result and on the Account page.
  - After a topic round the result shows whether the topic is now learned and the next route topic.
- Grammar page top ([src/components/GrammarHub.tsx](src/components/GrammarHub.tsx)): one «Сьогодні» card with the next step (due review → placement test → next route topic → mixed practice), then a chip row of tools. Route and contrast pairs open as panels (`grammarPanelPref`).
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

**Reading** ([src/pages/Reading.tsx](src/pages/Reading.tsx), [src/pages/ReadingText.tsx](src/pages/ReadingText.tsx), [src/lib/reading.ts](src/lib/reading.ts)):
- Graded texts are `src/content/reading/<slug>.md`, parsed by [src/lib/content/reading.ts](src/lib/content/reading.ts) into `virtual:lexo/reading` (metadata always loaded, a text through `loadText(slug)`). The file format is documented at the top of that parser.
  - `## Слова`: `- term [forms as they appear in the text] — переклад`. A phrase or an irregular form must be listed in brackets, or the word is not underlined in the text; the build warns about a term it cannot find.
  - `## Граматика`: `- article-slug — *sentence from the text* — пояснення`. The article page links back to the texts that use it (`textsForGrammar`).
  - `## Запитання`: `? question`, `- wrong`, `+ right`, `= explanation`. Exactly one `+`; the options are shuffled on screen, so the explanation must not refer to positions.
- Every word of the text is tappable: the glossary entry, the user's own word, or a MyMemory draft (only that word or sentence is sent). «Додати у словник» saves the sentence as the example.
- «Слухати текст» reads sentence by sentence (`speakParts`), highlighting the current one. Text size and speed are per-device prefs.
- Results (best score of the questions) are kept in `localStorage` (`lexo.reading`). The list suggests the first unread text at the grammar study level.
- Texts are original. Keep them natural English at the level, with Ukrainian explanations.

**Vocabulary practice** ([src/lib/session.ts](src/lib/session.ts), [src/components/practice/](src/components/practice/)):
- `pickWords` selects words by source: today, new, hard, all, or a subset.
- `buildQueue` builds one round per exercise type, in the order the user picked the types. A multi-exercise "complex" runs the rounds sequentially, not interleaved.
- `passage` (text with gaps plus a word bank, 5 examples per card, grouped by first tag) is also a group card and reuses `onMatched` grading. `dictation` reads a word's example aloud and compares the typed sentence word by word.
- `match`, `matchdef` and `cloze` use group cards: several words per card, with `commitFor` deciding when each word's result is recorded.
- Scheduling is SM-2 ([src/lib/sm2.ts](src/lib/sm2.ts)). Within a complex, a word's grades are combined with `complexGrade`, and `progress` is updated once per word per session. Every answer also goes to `review_log` for stats and streaks.
- [src/components/practice/Session.tsx](src/components/practice/Session.tsx) drives the flow.
- The Practice page shows the source tiles and «Почати» first; word count, level, tags and exercises are folded under «Налаштування» (`practiceSettingsPref`) with a one-line summary. The daily-goal chips appear only after tapping the goal.

**Tags and import:**
- The Tags page is reached from «Керувати тегами» on the Words page; the bottom bar has «Читання» in its place.
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
- Offline ([src/lib/offline.ts](src/lib/offline.ts)):
  - The query cache is persisted to IndexedDB (`idb-keyval`, key `lexo.cache`, `lexo.cache.mock` in mock mode) for a week, so words, progress and logs show without a connection. Bump `buster` when the shape of cached rows changes.
  - Word reviews (`REVIEW_KEY`) and grammar answers (`ANSWER_KEY`) are mutations with defaults registered on the client (`reviewMutationDefaults`, `answerMutationDefaults`). Offline they pause, are persisted, and are sent in order (scope `ANSWER_SCOPE`) when the connection is back, even after a reload. Their variables carry the answer time (`at`), which is written to `reviewed_at` / `answered_at` / `last_reviewed`. Variables come back as JSON, so dates may be strings.
  - The review mutation updates the cached `progress` and `review_log` optimistically and refetches only after the last queued answer.
  - Offline, supabase-js cannot refresh an expired token and reports no session; `AuthProvider` then keeps the stored one (`storedSession`). Signing out clears the cache and the queue (`clearOfflineData`); Account warns if answers are still unsent.
  - `OfflineBanner` in Layout shows the offline state and the queue. In dev, `__lexoOnline(false)` switches the app offline and `__lexoQueryClient` exposes the client. TanStack resumes queued work only on a visible page.
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
- Theme ([src/lib/theme.ts](src/lib/theme.ts), Account → Вигляд): dark (default), light or system. An inline script in `index.html` sets `data-theme` before the first paint. The light theme works by redefining colour variables in [src/index.css](src/index.css): `--color-white` becomes the ink colour, so `text-white/55` stays secondary text in both themes. Use `bg-panel` for opaque sheets, `text-on-accent` on accent buttons and `text-warn` for amber; do not hard-code hex colours in components.
- Ukrainian plurals go through `plural` / `count` in [src/lib/plural.ts](src/lib/plural.ts), for example `count(n, WORD)` gives «1 слово», «3 слова», «5 слів». Do not hard-code «слів».
- Filter pills use the `chip` utility with `data-on={selected}` ([src/index.css](src/index.css)). The `chip-row` utility scrolls sideways on phones and wraps on wider screens.

## Conventions

- **Content must be original.** External sites such as test-english.com may be used as a topic map, but do not copy their text or examples.
- **Line endings:** content files use CRLF. Keep them when editing with scripts.
- **README:** keep the content section of [README.md](README.md) roughly in sync when adding articles or exercise types.
