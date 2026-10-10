import { Suspense, use, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import LevelBadge from '../components/LevelBadge'
import RichText from '../components/RichText'
import SpeakButton from '../components/SpeakButton'
import { useAuth } from '../lib/authContext'
import { bySlug } from '../lib/grammar'
import { createPref } from '../lib/prefs'
import { useSaveWord, useWords, type WordWithTags } from '../lib/queries'
import { loadText, saveReadResult, textBySlug, texts, useReadResults, type GlossEntry, type ReadingQuestion, type TextContent, type TextMeta } from '../lib/reading'
import { canSpeak, speakParts, stopSpeaking } from '../lib/speech'
import { loadTopicDictionary, suggestTags, type TopicDictionary } from '../lib/tagTaxonomy'
import { baseForms, findPhrases, STOPWORDS, tokenize } from '../lib/textWords'
import { draftTranslations } from '../lib/translate'
import { useTitle } from '../lib/useTitle'
import { loadWordDetails, type DetailsDictionary } from '../lib/wordDetails'

/** Text size of the reading view, per device. */
const readingSizePref = createPref('readingSize', ['base', 'large'] as const, 'base')
/** Listening speed: 0.75 for following word by word, 0.9 is the app's normal speed. */
const readingRatePref = createPref('readingRate', ['slow', 'normal'] as const, 'normal')

/** Glossary entries shown before «Усі слова». */
const GLOSSARY_PREVIEW = 8

const clean = (term: string) => term.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()

/** A sentence split: after . ! ? (and a closing quote) when the next sentence starts. */
const splitSentences = (p: string) => p.split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?[A-Z0-9—])/)

export default function ReadingText() {
  const { slug = '' } = useParams()
  const meta = textBySlug.get(slug)
  useTitle(meta?.title ?? 'Читання')
  if (!meta)
    return (
      <section className="space-y-4">
        <Link to="/reading" className="text-sm text-accent hover:underline">
          ← Тексти
        </Link>
        <p className="text-white/60">Такого тексту немає.</p>
      </section>
    )
  return (
    <Suspense fallback={<p className="text-white/50">Завантаження…</p>}>
      <TextView key={slug} meta={meta} />
    </Suspense>
  )
}

interface Picked {
  /** The word or phrase as it stands in the text. */
  surface: string
  /** The dictionary form: the glossary term, the user's word, or the base form. */
  term: string
  sentence: string
  entry?: GlossEntry
  known?: WordWithTags
}

function TextView({ meta }: { meta: TextMeta }) {
  const content = use(loadText(meta.slug))
  const { session } = useAuth()
  const words = useWords()
  const size = readingSizePref.use()
  const rate = readingRatePref.use()
  const [picked, setPicked] = useState<Picked | null>(null)
  const [playing, setPlaying] = useState<number | null>(null)
  const [details, setDetails] = useState<DetailsDictionary | null>(null)
  const [topics, setTopics] = useState<TopicDictionary | null>(null)

  useEffect(() => {
    loadWordDetails().then(setDetails, () => {})
    loadTopicDictionary().then(setTopics, () => {})
    return () => stopSpeaking()
  }, [])

  const mine = useMemo(() => new Map((words.data ?? []).map((w) => [clean(w.term), w])), [words.data])
  const sentences = useMemo(() => content.paragraphs.map(splitSentences), [content])
  const flat = useMemo(() => sentences.flat(), [sentences])

  function listen() {
    if (playing !== null) return stopSpeaking()
    speakParts(flat, rate === 'slow' ? 0.72 : 0.9, setPlaying, () => setPlaying(null))
  }

  let sentenceNo = 0
  // The next text in the list order (by level, shorter first).
  const next = texts[texts.findIndex((t) => t.slug === meta.slug) + 1]

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <Link to="/reading" className="text-sm text-accent hover:underline">
          ← Тексти
        </Link>
        <p className="flex flex-wrap items-center gap-2 text-xs text-white/55">
          <LevelBadge level={meta.level} />
          {meta.topic} · {meta.minutes} хв
        </p>
        <h1 className="text-2xl font-light tracking-tight sm:text-3xl">{meta.title}</h1>
        <p className="text-sm text-white/60">{meta.summary}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {canSpeak && (
          <button onClick={listen} className={playing !== null ? 'btn-primary text-sm' : 'btn-ghost text-sm'}>
            {playing !== null ? '■ Зупинити' : '▶ Слухати текст'}
          </button>
        )}
        {canSpeak && (
          <div className="segmented" aria-label="Швидкість">
            <button onClick={() => readingRatePref.set('slow')} data-on={rate === 'slow'}>
              Повільно
            </button>
            <button onClick={() => readingRatePref.set('normal')} data-on={rate === 'normal'}>
              Звичайно
            </button>
          </div>
        )}
        <div className="segmented ml-auto" aria-label="Розмір тексту">
          <button onClick={() => readingSizePref.set('base')} data-on={size === 'base'} aria-label="Звичайний шрифт">
            A
          </button>
          <button onClick={() => readingSizePref.set('large')} data-on={size === 'large'} aria-label="Великий шрифт" className="text-base!">
            A+
          </button>
        </div>
      </div>

      <div className={`glass space-y-4 rounded-3xl p-5 sm:p-7 ${size === 'large' ? 'text-xl leading-10' : 'text-[1.0625rem] leading-8 sm:text-lg sm:leading-9'}`}>
        {sentences.map((list, p) => (
          <p key={p}>
            {list.map((s) => {
              const no = sentenceNo++
              return (
                <span key={no} className={`rounded transition-colors ${playing === no ? 'bg-accent/15' : ''}`}>
                  <Sentence text={s} glossary={content.glossary} mine={mine} onPick={setPicked} />{' '}
                </span>
              )
            })}
          </p>
        ))}
      </div>
      <p className="-mt-3 px-1 text-xs text-white/55">
        Торкніться слова — побачите переклад. <span className="text-accent">Підкреслені</span> — ключові слова тексту, <span className="text-good">зелені</span> — уже у вашому словнику.
      </p>

      {content.questions.length > 0 && <Questions slug={meta.slug} questions={content.questions} />}
      <Glossary content={content} mine={mine} userId={session?.user.id} topics={topics} details={details} />
      {content.grammar.length > 0 && <GrammarNotes content={content} />}

      {next && (
        <Link to={`/reading/${next.slug}`} className="glass flex items-center justify-between gap-3 rounded-2xl p-4 transition-colors hover:border-accent/40">
          <span>
            <span className="block text-xs text-white/55">Наступний текст</span>
            <span className="flex items-center gap-2">
              <LevelBadge level={next.level} /> {next.title}
            </span>
          </span>
          <span className="text-accent">→</span>
        </Link>
      )}

      {picked && <WordSheet picked={picked} userId={session?.user.id} details={details} topics={topics} onClose={() => setPicked(null)} />}
    </article>
  )
}

/** One sentence with every word tappable; glossary terms underlined, the user's own words green. */
function Sentence({ text, glossary, mine, onPick }: { text: string; glossary: GlossEntry[]; mine: Map<string, WordWithTags>; onPick: (p: Picked) => void }) {
  const tokens = useMemo(() => tokenize(text), [text])
  const glossAt = useMemo(() => {
    const at = new Map<number, GlossEntry>()
    // Phrases first (the term or a listed form such as «brought up»), by their character span; then single words.
    const phraseForms = glossary.flatMap((g) => [g.term, ...g.forms].filter((f) => f.includes(' ')).map((f) => [f, g] as const))
    for (const span of findPhrases(text, phraseForms.map(([f]) => f))) {
      const entry = phraseForms.find(([f]) => f === span.term)![1]
      tokens.forEach((t, i) => t.word && t.start >= span.start && t.start < span.end && at.set(i, entry))
    }
    tokens.forEach((t, i) => {
      if (!t.word || at.has(i)) return
      const lower = t.text.toLowerCase().replace(/’/g, "'")
      const forms = baseForms(lower)
      const entry = glossary.find((g) => !g.term.includes(' ') && (forms.includes(g.term.toLowerCase()) || g.forms.some((f) => f.toLowerCase() === lower)))
      if (entry) at.set(i, entry)
    })
    return at
  }, [text, tokens, glossary])

  return tokens.map((t, i) => {
    if (!t.word) return <span key={i}>{t.text}</span>
    const entry = glossAt.get(i)
    const lower = t.text.toLowerCase()
    const known = entry ? mine.get(clean(entry.term)) : baseForms(lower).map((f) => mine.get(f)).find(Boolean)
    const stop = !entry && STOPWORDS.has(lower)
    const pick = () => {
      // A glossary phrase opens as a whole; its surface is the span of words that belong to it.
      const surface = entry?.term.includes(' ')
        ? tokens.filter((_, j) => glossAt.get(j) === entry).map((x) => x.text).join(' ')
        : t.text
      onPick({ surface, term: entry?.term ?? known?.term ?? baseForms(lower).find((f) => f !== lower && mine.has(f)) ?? lower, sentence: text, entry, known })
    }
    return (
      <button
        key={i}
        type="button"
        onClick={pick}
        className={`rounded-sm text-left transition-colors hover:bg-white/10 ${
          known ? 'text-good' : ''
        } ${entry ? 'underline decoration-accent/60 decoration-dotted decoration-2 underline-offset-[6px]' : ''} ${stop ? 'cursor-text' : ''}`}
      >
        {t.text}
      </button>
    )
  })
}

/** The bottom sheet for a tapped word: translation, pronunciation, the sentence, and adding it to the dictionary. */
function WordSheet({ picked, userId, details, topics, onClose }: { picked: Picked; userId?: string; details: DetailsDictionary | null; topics: TopicDictionary | null; onClose: () => void }) {
  const { entry, known, sentence } = picked
  const [term, setTerm] = useState(picked.term)
  const [translation, setTranslation] = useState(entry?.uk ?? '')
  const [drafts, setDrafts] = useState<string[] | null>(null)
  const [sentenceUk, setSentenceUk] = useState<string | null>(null)
  const [error, setError] = useState('')
  const save = useSaveWord(userId ?? '')
  const definition = details?.[clean(term)]?.[0]

  // A word without a glossary entry or a dictionary card gets a draft translation right away (only the word is sent).
  useEffect(() => {
    if (entry || known) return
    let live = true
    draftTranslations(picked.term).then(
      (d) => {
        if (!live) return
        setDrafts(d)
        setTranslation((cur) => cur || d[0] || '')
      },
      () => live && setDrafts([]),
    )
    return () => {
      live = false
    }
  }, [entry, known, picked.term])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function translateSentence() {
    setSentenceUk('…')
    draftTranslations(sentence).then(
      (d) => setSentenceUk(d[0] ?? 'Переклад недоступний.'),
      () => setSentenceUk('Переклад недоступний: немає мережі або вичерпано ліміт.'),
    )
  }

  function add() {
    if (!userId || !translation.trim()) return
    setError('')
    save.mutate(
      { term: term.trim(), translation: translation.trim(), definition: definition ?? '', example: sentence.length <= 220 ? sentence : details?.[clean(term)]?.[1] ?? '', tagNames: suggestTags(term, topics) },
      { onError: (e) => setError((e as Error).message) },
    )
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Слово «${picked.term}»`}
        className="max-h-[80dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-3xl border-t border-white/10 bg-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgb(0_0_0/0.35)] sm:rounded-3xl sm:border"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-2xl font-light break-words">
              {picked.term}
              <SpeakButton text={picked.term} />
            </p>
            {clean(picked.surface) !== clean(picked.term) && <p className="text-sm text-white/55">у тексті: {picked.surface}</p>}
          </div>
          <button onClick={onClose} aria-label="Закрити" className="-m-1 grid size-9 shrink-0 place-items-center rounded-full text-white/55 hover:bg-white/10 hover:text-white">
            ✕
          </button>
        </div>

        {known ? (
          <p className="text-lg text-accent">{known.translation}</p>
        ) : entry ? (
          <p className="text-lg text-accent">{entry.uk}</p>
        ) : drafts === null ? (
          <p className="text-sm text-white/55">Шукаю переклад…</p>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-white/55">Чернетки перекладу немає — впишіть свій нижче.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {drafts.map((d) => (
              <button key={d} onClick={() => setTranslation(d)} data-on={translation === d} className="chip text-sm">
                {d}
              </button>
            ))}
          </div>
        )}
        {definition && <p className="text-sm text-white/60 italic">{definition}</p>}

        <div className="space-y-1.5 rounded-2xl bg-white/5 p-3 text-sm">
          <p className="flex items-start gap-1 text-white/75">
            <span className="flex-1">{sentence}</span>
            <SpeakButton text={sentence} className="-my-1.5" />
          </p>
          {sentenceUk ? (
            <p className="text-white/60">{sentenceUk}</p>
          ) : (
            <button onClick={translateSentence} className="text-accent hover:underline">
              Перекласти речення
            </button>
          )}
        </div>

        {known ? (
          <p className="text-sm text-good">✓ Уже у вашому словнику</p>
        ) : save.isSuccess ? (
          <p className="text-sm text-good">✓ Додано у словник, речення стало прикладом.</p>
        ) : userId ? (
          <div className="space-y-2">
            {!entry && (
              <div className="grid grid-cols-[1fr_1fr] gap-2">
                <input value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Слово" className="field py-1.5" />
                <input value={translation} onChange={(e) => setTranslation(e.target.value)} placeholder="Переклад" aria-label="Переклад" className="field py-1.5" />
              </div>
            )}
            {error && <p className="text-sm text-bad">{error}</p>}
            <button onClick={add} disabled={!translation.trim() || !term.trim() || save.isPending} className="btn-primary w-full">
              {save.isPending ? 'Додаю…' : 'Додати у словник'}
            </button>
            {!entry && <p className="text-xs text-white/50">Чернетка перекладу — MyMemory: надсилається лише це слово чи речення.</p>}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** The text's key words with their translations; new ones can be added one by one or all at once. */
function Glossary({ content, mine, userId, topics, details }: { content: TextContent; mine: Map<string, WordWithTags>; userId?: string; topics: TopicDictionary | null; details: DetailsDictionary | null }) {
  const save = useSaveWord(userId ?? '')
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [all, setAll] = useState(false)
  const shown = all ? content.glossary : content.glossary.slice(0, GLOSSARY_PREVIEW)
  const fresh = content.glossary.filter((g) => !mine.has(clean(g.term)) && !added.has(g.term))
  const sentenceFor = (g: GlossEntry) => {
    const all = content.paragraphs.flatMap(splitSentences)
    const forms = [g.term, ...g.forms].map((f) => f.toLowerCase())
    return all.find((s) => forms.some((f) => s.toLowerCase().includes(f.split(' ')[0].replace(/e$/, '')))) ?? ''
  }

  async function addAll(list: GlossEntry[]) {
    if (!userId) return
    setBusy(true)
    for (const g of list) {
      try {
        const example = sentenceFor(g)
        await save.mutateAsync({ term: g.term, translation: g.uk, definition: details?.[clean(g.term)]?.[0] ?? '', example: example.length <= 220 ? example : '', tagNames: suggestTags(g.term, topics) })
        setAdded((s) => new Set(s).add(g.term))
      } catch {
        break
      }
    }
    setBusy(false)
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="text-lg font-light">Слова з тексту</h2>
        {userId && fresh.length > 0 && (
          <button onClick={() => addAll(fresh)} disabled={busy} className="text-sm text-accent hover:underline disabled:opacity-50">
            {busy ? 'Додаю…' : `Додати нові у словник (${fresh.length})`}
          </button>
        )}
      </div>
      <ul className="glass divide-y divide-white/6 rounded-2xl">
        {shown.map((g) => {
          const have = mine.has(clean(g.term)) || added.has(g.term)
          return (
            <li key={g.term} className="flex items-center gap-2 px-3 py-2">
              <SpeakButton text={g.term} className="size-8" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{g.term}</span>
                <span className="text-white/60"> — {g.uk}</span>
              </span>
              {have ? (
                <span className="shrink-0 text-sm text-good" title="У словнику">
                  ✓
                </span>
              ) : (
                userId && (
                  <button onClick={() => addAll([g])} disabled={busy} aria-label={`Додати «${g.term}» у словник`} className="grid size-8 shrink-0 place-items-center rounded-full text-lg text-accent hover:bg-white/10 disabled:opacity-50">
                    +
                  </button>
                )
              )}
            </li>
          )
        })}
      </ul>
      {shown.length < content.glossary.length && (
        <button onClick={() => setAll(true)} className="w-full text-sm text-accent hover:underline">
          Усі слова ({content.glossary.length})
        </button>
      )}
    </section>
  )
}

/** Comprehension questions: each one shows the explanation right after the answer; the score is kept on the device. */
function Questions({ slug, questions: source }: { slug: string; questions: ReadingQuestion[] }) {
  // Options are shuffled once per visit, so the right answer is not always in the same place.
  const questions = useMemo(
    () =>
      source.map((q) => {
        const order = q.options.map((_, i) => i).sort(() => Math.random() - 0.5)
        return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) }
      }),
    [source],
  )
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null))
  const results = useReadResults()
  const saved = useRef(false)
  const done = answers.every((a) => a !== null)
  const score = answers.filter((a, i) => a === questions[i].answer).length

  useEffect(() => {
    if (done && !saved.current) {
      saved.current = true
      saveReadResult(slug, { score, total: questions.length, at: new Date().toISOString() })
    }
  }, [done, score, slug, questions.length])

  function restart() {
    saved.current = false
    setAnswers(questions.map(() => null))
  }

  const best = results[slug]
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="text-lg font-light">Перевірте розуміння</h2>
        {best && !done && <span className="text-xs text-white/55">найкраще: {best.score}/{best.total}</span>}
      </div>
      <ol className="space-y-3">
        {questions.map((q, i) => {
          const chosen = answers[i]
          return (
            <li key={i} className="glass space-y-2 rounded-2xl p-4">
              <p className="font-medium">
                {i + 1}. {q.q}
              </p>
              <div className="grid gap-1.5">
                {q.options.map((o, j) => {
                  const state = chosen === null ? '' : j === q.answer ? 'border-good/60 bg-good/10 text-good' : j === chosen ? 'border-bad/60 bg-bad/10 text-bad' : 'opacity-60'
                  return (
                    <button
                      key={j}
                      disabled={chosen !== null}
                      onClick={() => setAnswers((a) => a.map((x, k) => (k === i ? j : x)))}
                      className={`tile text-left ${state}`}
                    >
                      {o}
                    </button>
                  )
                })}
              </div>
              {chosen !== null && (
                <p className="text-sm text-white/70">
                  <span className={chosen === q.answer ? 'text-good' : 'text-bad'}>{chosen === q.answer ? 'Правильно. ' : 'Ні. '}</span>
                  <RichText text={q.why} />
                </p>
              )}
            </li>
          )
        })}
      </ol>
      {done && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
          <p>
            Результат: <span className={score === questions.length ? 'text-good' : ''}>{score} з {questions.length}</span>
            {score === questions.length ? ' — текст зрозуміло повністю.' : ' — перечитайте абзаци, де була помилка.'}
          </p>
          <button onClick={restart} className="btn-ghost text-sm">
            Ще раз
          </button>
        </div>
      )}
    </section>
  )
}

/** Grammar the text practises: the sentence from the text, why it uses the form, and the article. */
function GrammarNotes({ content }: { content: TextContent }) {
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-lg font-light">Граматика в тексті</h2>
      <ul className="space-y-2">
        {content.grammar.map((g, i) => {
          const article = bySlug.get(g.slug)
          return (
            <li key={i} className="glass space-y-1.5 rounded-2xl p-4">
              <p className="text-white/85">
                <RichText text={g.example} />
              </p>
              <p className="text-sm text-white/60">
                <RichText text={g.note} />
              </p>
              {article && (
                <Link to={`/grammar/${g.slug}`} className="inline-block text-sm text-accent hover:underline">
                  Правило: {article.title} →
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
