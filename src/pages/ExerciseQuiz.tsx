import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import { correctAnswer, drawDeck, exercises, isCorrectText, isUnseen, itemsOf, prioritize, promptOf, shuffle, withVariant, type Item, type Question } from '../lib/exercises'
import { allMistakes, answerHistory, topicStats, useExerciseLog, useLogAnswer, type LogRow } from '../lib/exerciseLog'
import { useFocusMode } from '../lib/focusMode'
import { buildRoute, loadPlacement, topicProgress, topicStatus } from '../lib/learningPath'
import { LEVELS, articles, bySlug, type Level } from '../lib/grammar'
import { count, NEW_QUESTION } from '../lib/plural'
import { autoNextPref, deckSizePref } from '../lib/prefs'
import { useTitle } from '../lib/useTitle'
import QuizSettings from '../components/QuizSettings'
import RichText from '../components/RichText'
import RuleSheet from '../components/RuleSheet'
import { diffWords, type DiffPart } from '../lib/wordDiff'
import { cardItems, MY_WRITING } from '../lib/writingCards'
import { reviewSchedule, reviewSummary, shortTitle } from '../lib/grammarReview'

const MIXED_DECK_SIZE = 15

/** Questions in a round of one topic, from the per-device setting (10, 20 or the whole topic). */
const topicDeckSize = (bankSize: number) => {
  const pref = deckSizePref.get()
  return pref === 'all' ? bankSize : Number(pref)
}

export interface Outcome {
  correct: boolean
  given: string
}

/** Waits for the answer log once (it decides "repeat mistakes"), then keeps the quiz mounted through background refetches. */
function useSettledLog() {
  const log = useExerciseLog()
  const [settled, setSettled] = useState(false)
  if (!settled && !log.isPending) setSettled(true)
  return { log: log.data, settled }
}

/** Exercises of one topic: `/grammar/:slug/exercises` (router state `{ mistakes: true }` limits it to the questions answered wrongly). */
export default function ExerciseQuiz() {
  const { slug = '' } = useParams()
  const article = bySlug.get(slug)
  const bank = exercises.get(slug)
  const mistakesOnly = (useLocation().state as { mistakes?: boolean } | null)?.mistakes === true
  const { log, settled } = useSettledLog()
  const [attempt, setAttempt] = useState(0)

  if (!article || !bank) {
    return (
      <section className="space-y-4">
        <Link to="/grammar" className="text-sm text-white/50 hover:text-white">
          ← До статей
        </Link>
        <p className="glass rounded-3xl p-8 text-center text-white/50">Для цієї теми ще немає вправ.</p>
      </section>
    )
  }
  if (!settled) return <p className="text-white/50">Завантаження…</p>

  // The deck is drawn once, after the log is known, so "repeat mistakes" can pick the right questions.
  const wrong = new Set(topicStats(log, slug, new Set(bank.map((q) => q.id))).mistakes)
  const all = itemsOf(slug)
  const pool = mistakesOnly ? all.filter((i) => wrong.has(i.q.id)) : all
  return (
    <Quiz
      key={attempt}
      title={article.title}
      pool={pool.length > 0 ? pool : all}
      log={log}
      size={topicDeckSize(pool.length > 0 ? pool.length : all.length)}
      topic={slug}
      back={{ to: `/grammar/${slug}`, label: 'До статті' }}
      onRestart={() => setAttempt((n) => n + 1)}
    />
  )
}

/** Mixed practice across topics: `/grammar/practice?level=B1&cat=…`, or `?mistakes=1` for every question answered wrongly. */
export function MixedQuiz() {
  const [params] = useSearchParams()
  const levelParam = params.get('level')
  const level = (LEVELS as readonly string[]).includes(levelParam ?? '') ? (levelParam as Level) : null
  const category = params.get('cat')
  const mistakes = params.get('mistakes') === '1'
  const fixOnly = params.get('type') === 'fix'
  const mine = params.get('type') === 'mine'
  const review = params.get('review') === '1'
  const pair = params.get('pair')?.split(',').filter((s) => exercises.has(s))
  const { log, settled } = useSettledLog()
  const [attempt, setAttempt] = useState(0)

  if (!settled) return <p className="text-white/50">Завантаження…</p>

  let pool: Item[]
  let title: string
  // Review and pair decks come in a set order (most overdue first; topics alternating), not re-drawn by type.
  let ordered = false
  let showTopic = true
  if (review) {
    const cards = new Map(cardItems().map((i) => [i.q.id, i]))
    const find = (slug: string, id: string): Item | undefined =>
      slug === MY_WRITING ? cards.get(id) : (() => {
        const q = exercises.get(slug)?.find((x) => x.id === id)
        return q && { slug, q }
      })()
    pool = reviewSummary(reviewSchedule(log, (slug, id) => find(slug, id) !== undefined)).due.map((e) => find(e.slug, e.id)!)
    ordered = true
    title = 'Граматика на сьогодні'
  } else if (pair && pair.length === 2) {
    // Alternating topics, names hidden: which rule applies has to be recognised from the sentence itself.
    const history = answerHistory(log)
    const [a, b] = pair.map((s) => prioritize(itemsOf(s), history))
    pool = Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [a[i], b[i]]).flat().filter(Boolean)
    ordered = true
    showTopic = false
    title = `${shortTitle(pair[0])} / ${shortTitle(pair[1])}`
  } else if (mine) {
    pool = cardItems()
    title = 'Мої помилки з письма'
  } else if (mistakes) {
    const byId = new Map([...exercises].flatMap(([slug, qs]) => qs.map((q): [string, Item] => [`${slug}/${q.id}`, { slug, q }])))
    pool = allMistakes(log, exercises).map((m) => byId.get(`${m.slug}/${m.id}`)!)
    title = 'Робота над помилками'
  } else {
    const topics = articles.filter((a) => (!level || a.levels.includes(level)) && (!category || a.category === category))
    pool = topics.flatMap((a) => itemsOf(a.slug)).filter((i) => !fixOnly || i.q.type === 'fix')
    title = [fixOnly ? 'Знайди помилку' : 'Змішані вправи', level, category].filter(Boolean).join(' · ')
  }

  if (pool.length === 0) {
    return (
      <section className="space-y-4">
        <Link to="/grammar" className="text-sm text-white/50 hover:text-white">
          ← До статей
        </Link>
        <p className="glass rounded-3xl p-8 text-center text-white/50">
          {review ? 'На сьогодні повторювати нічого.' : mine ? 'Карток ще немає: їх додає «Тренер письма».' : mistakes ? 'Помилок немає — усі останні відповіді правильні.' : 'Для цих фільтрів немає вправ.'}
        </p>
      </section>
    )
  }
  return (
    <Quiz
      key={attempt}
      title={title}
      pool={pool}
      log={log}
      size={pair ? 16 : MIXED_DECK_SIZE}
      ordered={ordered}
      showTopic={showTopic}
      back={{ to: '/grammar', label: 'До граматики' }}
      onRestart={() => setAttempt((n) => n + 1)}
    />
  )
}

interface QuizProps {
  title: string
  pool: Item[]
  /** The answer log: unseen questions are drawn first and marked «нове». */
  log: LogRow[] | undefined
  size: number
  /** A single-topic quiz: the result screen shows how much of the topic is covered. */
  topic?: string
  /** Mixed decks name the topic above each question, with a link to its article in the review. */
  showTopic?: boolean
  /** Take the pool in its order instead of drawing a type-interleaved deck. */
  ordered?: boolean
  back: { to: string; label: string }
  onRestart: () => void
}

function Quiz({ title, pool, log, size, topic, showTopic, ordered, back, onRestart }: QuizProps) {
  useTitle(`Вправи: ${title.split(/[:(—]/)[0].trim()}`)
  const { session } = useAuth()
  const { mutate: logAnswer } = useLogAnswer(session!.user.id)
  // A snapshot from when the quiz opened (each «Ще раз» remounts it): the «нове» marks must not vanish as answers are logged.
  const [history] = useState(() => answerHistory(log))
  const [deck] = useState(() => (ordered ? pool.slice(0, size) : drawDeck(pool, size, history)).map(withVariant))
  const [index, setIndex] = useState(0)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [results, setResults] = useState<{ item: Item; outcome: Outcome }[]>([])

  const item = deck[index]
  useFocusMode(item !== undefined)

  function answer(o: Outcome) {
    if (outcome) return
    setOutcome(o)
    setResults((r) => [...r, { item, outcome: o }])
    logAnswer({ slug: item.slug, questionId: item.q.id, correct: o.correct })
    if (!o.correct && navigator.vibrate) navigator.vibrate(50)
  }

  /** «Мій варіант теж правильний»: a correction can be worded differently from the one in the article; the newer log row wins. */
  function override() {
    if (!outcome || outcome.correct) return
    const o = { ...outcome, correct: true }
    setOutcome(o)
    setResults((r) => [...r.slice(0, -1), { item, outcome: o }])
    logAnswer({ slug: item.slug, questionId: item.q.id, correct: true })
  }

  function next() {
    setOutcome(null)
    setIndex((i) => i + 1)
  }

  if (!item) {
    const score = results.filter((r) => r.outcome.correct).length
    const missed = results.filter((r) => !r.outcome.correct)
    const percent = Math.round((score / results.length) * 100)
    // Coverage of the whole topic after this round: what is still unseen comes first in the next one.
    const bank = topic ? exercises.get(topic) : undefined
    const answered = new Set(results.map((r) => r.item.q.id))
    const unseenLeft = bank ? bank.filter((q) => !answered.has(q.id) && !history.has(`${topic}/${q.id}`)).length : 0
    return (
      <section className="space-y-5">
        <div className="glass space-y-3 rounded-[2rem] p-8 text-center">
          <p className="text-xs tracking-widest text-white/35 uppercase">{title}</p>
          <p className="text-5xl font-light">
            {score} <span className="text-2xl text-white/40">/ {results.length}</span>
          </p>
          <p className={percent >= 80 ? 'text-good' : 'text-white/50'}>
            {score === results.length ? 'Без помилок!' : percent >= 80 ? `Чудово · помилок: ${missed.length}` : `Помилок: ${missed.length} — розберіть їх нижче`}
          </p>
          {bank && (
            <p className="text-sm text-white/45">
              {unseenLeft > 0 ? `У темі ще ${count(unseenLeft, NEW_QUESTION)} — вони будуть першими в наступному колі.` : 'Усі запитання теми ви вже бачили.'}
            </p>
          )}
        </div>
        {missed.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm tracking-widest text-white/40 uppercase">Розберіть помилки</h2>
            {missed.map(({ item: m, outcome: o }) => (
              <div key={`${m.slug}/${m.q.id}`} className="glass space-y-1.5 rounded-2xl p-4 text-sm">
                {showTopic && (
                  <Link to={`/grammar/${m.slug}`} className="text-xs text-accent hover:underline">
                    {bySlug.get(m.slug)?.title}
                  </Link>
                )}
                <p className="text-white/60">{promptOf(m.q)}</p>
                <p>
                  <span className="text-bad line-through decoration-bad/50">{o.given || '—'}</span> → <span className="text-good">{correctAnswer(m.q)}</span>
                </p>
                <p className="text-white/45">
                  <RichText text={m.q.why} />
                </p>
              </div>
            ))}
          </div>
        )}
        {topic && <NextTopic topic={topic} />}
        <div className="flex flex-wrap gap-2">
          <Link to={back.to} className="btn-ghost">
            {back.label}
          </Link>
          <button onClick={onRestart} className="btn-primary">
            {unseenLeft > 0 ? 'Нові запитання' : 'Ще раз'}
          </button>
        </div>
        <QuizSettings deckSize={topic !== undefined} />
      </section>
    )
  }

  const { q } = item
  return (
    // On a phone the quiz fills the screen and the answers sit low, near the thumb; the verdict comes up as a bottom sheet.
    <section className={`flex flex-col gap-5 max-md:min-h-[calc(100dvh-2.5rem)] ${outcome ? 'max-md:pb-72' : ''}`}>
      <div className="flex items-center gap-3 text-sm text-white/50">
        <Link to={back.to} aria-label="Вийти з вправ" className="hover:text-white">
          ✕
        </Link>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-accent transition-all" style={{ width: `${(index / deck.length) * 100}%` }} />
        </div>
        <span className="tabular-nums">
          {index + 1} / {deck.length}
        </span>
      </div>

      <p className="text-center text-xs text-white/40">
        {showTopic ? bySlug.get(item.slug)?.title : title.split(/[:(—]/)[0].trim()}
        {isUnseen(item, history) && <span className="ml-2 rounded-full border border-accent/40 px-1.5 py-px text-accent">нове</span>}
      </p>

      <div key={index} className="flex flex-1 flex-col">
        <QuestionView q={q} outcome={outcome} onAnswer={answer} />
      </div>

      {outcome && <Feedback q={q} outcome={outcome} last={index + 1 === deck.length} onNext={next} onOverride={override} slug={item.slug} />}
    </section>
  )
}

/** After a topic round: whether the topic now counts as learned, and the next topic of the learning route. */
function NextTopic({ topic }: { topic: string }) {
  // The cached log already holds this round's answers (they are added optimistically).
  const { data: log } = useExerciseLog()
  const progress = useMemo(() => topicProgress(log), [log])
  const [placement] = useState(loadPlacement)
  const done = topicStatus(progress.get(topic)) === 'done'
  const next = placement ? buildRoute(placement, progress).todo.find((t) => t.article.slug !== topic)?.article : undefined
  if (!done && !next) return null
  return (
    <div className="glass space-y-3 rounded-2xl p-4">
      {done && <p className="text-good">✓ Тему засвоєно: правильні відповіді на 80%+ її запитань.</p>}
      {next && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/40">Наступна тема маршруту</p>
            <p className="truncate">{next.title}</p>
          </div>
          <div className="flex w-full gap-2 *:flex-1 sm:w-auto sm:*:flex-none">
            <Link to={`/grammar/${next.slug}`} className="btn-ghost text-center">
              Читати
            </Link>
            <Link to={`/grammar/${next.slug}/exercises`} className="btn-primary text-center">
              Вправи
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

interface FeedbackProps {
  q: Question
  outcome: Outcome
  last: boolean
  onNext: () => void
  /** «Мій варіант теж правильний»; left out where the answer must not be self-graded (the placement test). */
  onOverride?: () => void
  /** The question's topic: «Правило» opens the matching part of its article. */
  slug?: string
}

/** A sentence with some of its words highlighted. */
function Marked({ parts, className }: { parts: DiffPart[]; className: string }) {
  return parts.map((p, i) => (
    <span key={i}>
      {i > 0 && ' '}
      {p.changed ? <span className={className}>{p.text}</span> : p.text}
    </span>
  ))
}

/** Only a typed or built answer can be «also right»; a choice, a blank, or the unchanged wrong sentence cannot. */
function canOverride(q: Question, outcome: Outcome) {
  if (outcome.correct || outcome.given === '') return false
  if (q.type === 'fix') return !q.showRight && outcome.given !== q.wrong
  return q.type === 'fill' || q.type === 'order'
}

/**
 * The other accepted answers of a typed or built question (another modal, another word order), so the learner sees that more than one is right.
 * Spelling variants of the answer already shown (contractions, «-» for no word) are left out.
 */
function otherAnswers(q: Question, outcome: Outcome): string[] {
  if (q.type !== 'fill' && q.type !== 'order') return []
  const shown = outcome.correct ? outcome.given : q.answer[0]
  const out: string[] = []
  for (const a of q.answer) {
    if (/^\(.*\)$|^[—–-]$|^no article$/i.test(a.trim()) || isCorrectText(a, [shown, ...out])) continue
    out.push(a)
  }
  return out
}

// How long a right answer stays on screen before the quiz moves on by itself (when that is switched on).
const AUTO_NEXT_MS = 1500

/** The verdict after an answer. On a phone it is a sheet at the bottom of the screen, with «Далі» under the thumb. */
export function Feedback({ q, outcome, last, onNext, onOverride, slug }: FeedbackProps) {
  const [rule, setRule] = useState(false)
  const auto = autoNextPref.use() === 'on' && outcome.correct && !rule
  const [armed, setArmed] = useState(false)
  const hasRule = slug !== undefined && bySlug.has(slug)
  const others = otherAnswers(q, outcome)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' && !rule) {
        e.preventDefault()
        onNext()
      }
    }
    // Attached on the next tick, so the Enter that submitted the answer does not also skip the explanation.
    const t = setTimeout(() => window.addEventListener('keydown', onKey), 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [onNext, rule])

  // Auto-advance after a right answer; a wrong one always waits, so the explanation can be read.
  useEffect(() => {
    if (!auto) return
    const start = requestAnimationFrame(() => setArmed(true))
    const t = setTimeout(onNext, AUTO_NEXT_MS)
    return () => {
      cancelAnimationFrame(start)
      clearTimeout(t)
      setArmed(false)
    }
  }, [auto, onNext])

  return (
    <div className="space-y-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-20 max-md:max-h-[70dvh] max-md:overflow-y-auto max-md:rounded-t-3xl max-md:border-t max-md:border-white/10 max-md:bg-[#12151d] max-md:p-4 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:shadow-[0_-12px_40px_rgb(0_0_0/0.5)]">
      <div className={`glass rounded-2xl p-4 ${outcome.correct ? 'border-good/40!' : 'border-bad/40!'}`}>
        <div className="flex items-baseline justify-between gap-3">
          <p className={`text-sm ${outcome.correct ? 'text-good' : 'text-bad'}`}>{outcome.correct ? 'Правильно' : 'Неправильно'}</p>
          {hasRule && (
            <button onClick={() => setRule(true)} className="text-sm text-accent hover:underline">
              Правило
            </button>
          )}
        </div>
        {q.type === 'fix' ? (
          <div className="mt-1 space-y-0.5">
            {q.showRight && <p className="text-sm text-white/60">Речення було без помилки. Типова помилка в ньому:</p>}
            {/* The words the correction changes are highlighted on both sides, so it is clear where the mistake was. */}
            <p className="text-white/50">
              <span className="text-bad">✗</span> <Marked parts={diffWords(q.wrong, q.answer[0]).wrong} className="text-bad line-through decoration-bad/60" />
            </p>
            {q.answer.map((a) => (
              <p key={a} className="text-lg">
                <span className="text-good">✓</span> <Marked parts={diffWords(q.wrong, a).right} className="font-medium text-good" />
              </p>
            ))}
          </div>
        ) : solved(q) ? (
          // The whole sentence with the right answer in place reads better than the answer alone; a right typed answer is shown as typed.
          <p className="mt-1 text-lg">{solved(q, outcome.correct && q.type === 'fill' ? outcome.given : undefined)}</p>
        ) : (
          !outcome.correct && <p className="mt-1 text-lg">{correctAnswer(q)}</p>
        )}
        {others.length > 0 && <p className="mt-1 text-sm text-white/50">Також правильно: {others.join(' · ')}</p>}
        {q.why && (
          <p className="mt-2 text-sm text-white/60">
            <RichText text={q.why} />
          </p>
        )}
      </div>
      {/* A typed answer the checker did not recognise may still be right (another modal, another word order): let the learner count it. */}
      {onOverride && canOverride(q, outcome) && (
        <button onClick={onOverride} className="w-full text-center text-sm text-white/40 hover:text-white">
          Мій варіант теж правильний
        </button>
      )}
      <button onClick={onNext} className="btn-primary relative w-full overflow-hidden">
        {auto && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 bg-white/20 transition-[width] ease-linear"
            style={{ width: armed ? '100%' : '0%', transitionDuration: `${AUTO_NEXT_MS}ms` }}
          />
        )}
        <span className="relative">{last ? 'Результат' : 'Далі'}</span>
      </button>
      {rule && slug && <RuleSheet slug={slug} q={q} onClose={() => setRule(false)} />}
    </div>
  )
}

/**
 * A gap question as a complete sentence, the right answer highlighted; null when the question has no gap.
 * With several gaps an answer written «had / gone» fills them in turn; otherwise it all goes into the first gap.
 */
function solved(q: Question, given?: string): ReactNode {
  if ((q.type !== 'choice' && q.type !== 'fill') || !/_{2,}/.test(q.q)) return null
  const parts = q.q.split(/_{2,}/)
  const answer = given ?? correctAnswer(q)
  const pieces = answer.split(' / ')
  const fills = pieces.length === parts.length - 1 ? pieces : [answer]
  // «(без артикля)», «—»: the right answer is to leave the gap empty, so the sentence is shown without it.
  const empty = (fill: string) => /^\(.*\)$|^[—–-]$/.test(fill.trim())
  return (
    <>
      {parts.map((text, i) => {
        const fill = fills[i]
        const gap = i >= parts.length - 1 ? null : fill === undefined ? '___' : empty(fill) ? null : <span className="text-good">{fill}</span>
        return (
          <span key={i}>
            {gap === null && fill !== undefined ? text.replace(/\s+$/, '') + (parts[i + 1]?.startsWith(' ') ? '' : ' ') : text}
            {gap}
          </span>
        )
      })}
    </>
  )
}

/** The answering part of any question type. */
export function QuestionView({ q, outcome, onAnswer }: QProps<Question>) {
  if (q.type === 'choice') return <ChoiceQ q={q} outcome={outcome} onAnswer={onAnswer} />
  if (q.type === 'fill') return <FillQ q={q} outcome={outcome} onAnswer={onAnswer} />
  if (q.type === 'order') return <OrderQ q={q} outcome={outcome} onAnswer={onAnswer} />
  return <FixQ q={q} outcome={outcome} onAnswer={onAnswer} />
}

interface QProps<T extends Question> {
  q: T
  outcome: Outcome | null
  onAnswer: (o: Outcome) => void
}

/** The question text; a run of underscores is drawn as a blank to fill. */
function Prompt({ text, hint, children }: { text?: string; hint?: string; children?: ReactNode }) {
  const long = (text?.length ?? 0) > 70
  return (
    <div className="glass grid min-h-40 place-items-center rounded-[2rem] p-6 text-center sm:p-8">
      <div className="space-y-3">
        {text !== undefined && (
          <p className={`font-light tracking-tight ${long ? 'text-xl' : 'text-2xl'}`}>
            {text.split(/(_{2,})/).map((part, i) =>
              /^_{2,}$/.test(part) ? (
                <span key={i} className="mx-0.5 inline-block min-w-12 border-b-2 border-accent/70 align-baseline" aria-label="пропуск">
                  &nbsp;
                </span>
              ) : (
                part
              ),
            )}
          </p>
        )}
        {children}
        {hint && <p className="text-sm text-white/45">{hint}</p>}
      </div>
    </div>
  )
}

function ChoiceQ({ q, outcome, onAnswer }: QProps<Extract<Question, { type: 'choice' }>>) {
  const picked = outcome?.given

  useEffect(() => {
    if (outcome) return
    function onKey(e: KeyboardEvent) {
      const i = Number(e.key) - 1
      if (i >= 0 && i < q.options.length) onAnswer({ correct: i === q.answer, given: q.options[i] })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [q, outcome, onAnswer])

  function style(option: string, i: number) {
    if (!outcome) return 'hover:bg-white/15'
    if (i === q.answer) return 'border-good/60 bg-good/15 text-good'
    if (option === picked) return 'border-bad/60 bg-bad/15 text-bad'
    return 'opacity-40'
  }
  return (
    <div className="flex flex-1 flex-col gap-3">
      <Prompt text={q.q} hint={q.hint} />
      <div className="mt-auto grid gap-2">
        {q.options.map((option, i) => (
          <button
            key={option}
            disabled={outcome !== null}
            onClick={() => onAnswer({ correct: i === q.answer, given: option })}
            className={`glass flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${style(option, i)}`}
          >
            <span className="hidden w-4 shrink-0 text-xs text-white/30 md:block">{i + 1}</span>
            <span>{option}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function FillQ({ q, outcome, onAnswer }: QProps<Extract<Question, { type: 'fill' }>>) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  // Ready to type; preventScroll keeps the question in view (autoFocus scrolls to the field on phones).
  useEffect(() => {
    input.current?.focus({ preventScroll: true })
  }, [])
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!outcome && value.trim() !== '') onAnswer({ correct: isCorrectText(value, q.answer), given: value.trim() })
  }
  return (
    <div className="space-y-3">
      <Prompt text={q.q} hint={q.hint} />
      <form onSubmit={submit} className="space-y-2">
        <input
          ref={input}
          disabled={outcome !== null}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ваша відповідь"
          className="field text-center text-lg"
        />
        {!outcome && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onAnswer({ correct: false, given: '' })} className="btn-ghost">
              Не знаю
            </button>
            <button disabled={value.trim() === ''} className="btn-primary">
              Перевірити
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

function OrderQ({ q, outcome, onAnswer }: QProps<Extract<Question, { type: 'order' }>>) {
  const [tiles] = useState(() => shuffle(q.words.map((w, i) => ({ w, i }))))
  const [picked, setPicked] = useState<number[]>([]) // indices into `tiles`
  const sentence = picked.map((t) => tiles[t].w).join(' ')
  const complete = picked.length === tiles.length

  const pick = (t: number) => !outcome && !picked.includes(t) && setPicked([...picked, t])
  // A word already placed goes back to the bank when tapped, so one wrong tap does not cost the whole sentence.
  const unpick = (t: number) => !outcome && setPicked(picked.filter((x) => x !== t))
  const check = () => onAnswer({ correct: isCorrectText(sentence, q.answer), given: sentence })

  useEffect(() => {
    if (outcome || !complete) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Enter') return
      e.preventDefault()
      onAnswer({ correct: isCorrectText(sentence, q.answer), given: sentence })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [q, outcome, complete, sentence, onAnswer])

  return (
    <div className="flex flex-1 flex-col gap-3">
      <Prompt hint={q.hint}>
        <p className="text-xs tracking-widest text-white/35 uppercase">Складіть речення</p>
      </Prompt>
      <div className="glass flex min-h-16 flex-wrap items-center justify-center gap-1.5 rounded-2xl p-3 text-lg">
        {picked.length === 0 ? (
          <span className="text-white/25">Торкайтеся слів по порядку</span>
        ) : (
          picked.map((t) => (
            <button key={t} onClick={() => unpick(t)} disabled={outcome !== null} className="rounded-lg px-1.5 py-0.5 transition-colors enabled:hover:bg-white/10" title="Повернути слово">
              {tiles[t].w}
            </button>
          ))
        )}
      </div>
      {!outcome && (
        <div className="mt-auto space-y-3">
          <div className="flex flex-wrap justify-center gap-2">
            {tiles.map((t, i) => (
              <button
                key={i}
                disabled={picked.includes(i)}
                onClick={() => pick(i)}
                className="glass rounded-xl px-3 py-2 text-lg transition-opacity hover:bg-white/15 disabled:opacity-20"
              >
                {t.w}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onAnswer({ correct: false, given: sentence })} className="btn-ghost">
              Не знаю
            </button>
            {complete ? (
              <button onClick={check} className="btn-primary">
                Перевірити
              </button>
            ) : (
              <button onClick={() => setPicked((p) => p.slice(0, -1))} disabled={picked.length === 0} className="btn-ghost">
                ⌫ Стерти
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FixQ({ q, outcome, onAnswer }: QProps<Extract<Question, { type: 'fix' }>>) {
  const shown = q.showRight ? q.answer[0] : q.wrong
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(shown)
  const input = useRef<HTMLInputElement>(null)

  // The sentence is edited in place: the cursor goes to the end, no scroll jump on phones.
  useEffect(() => {
    if (!editing) return
    const el = input.current
    el?.focus({ preventScroll: true })
    el?.setSelectionRange(el.value.length, el.value.length)
  }, [editing])

  const judgeRight = () => onAnswer({ correct: q.showRight === true, given: 'Речення правильне' })

  useEffect(() => {
    if (outcome || editing) return
    function onKey(e: KeyboardEvent) {
      if (e.key === '1') onAnswer({ correct: q.showRight === true, given: 'Речення правильне' })
      if (e.key === '2') setEditing(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [q, outcome, editing, onAnswer])

  // Saying «there is a mistake» about a correct sentence is wrong whatever is typed; the editor still opens, so it gives nothing away.
  function submit(e: FormEvent) {
    e.preventDefault()
    if (outcome || value.trim() === '') return
    onAnswer({ correct: !q.showRight && isCorrectText(value, q.answer), given: q.showRight ? 'Є помилка' : value.trim() })
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <Prompt hint={q.hint}>
        <p className="text-xs tracking-widest text-white/35 uppercase">Чи є тут помилка?</p>
        <p className={`font-light tracking-tight ${shown.length > 70 ? 'text-xl' : 'text-2xl'}`}>{shown}</p>
      </Prompt>
      {!editing ? (
        !outcome && (
          <div className="mt-auto grid grid-cols-2 gap-2">
            <button onClick={judgeRight} className="glass rounded-2xl px-4 py-3 transition-colors hover:bg-white/15">
              <span className="mr-2 hidden text-xs text-white/30 md:inline">1</span>Правильно
            </button>
            <button onClick={() => setEditing(true)} className="glass rounded-2xl px-4 py-3 transition-colors hover:bg-white/15">
              <span className="mr-2 hidden text-xs text-white/30 md:inline">2</span>Є помилка
            </button>
          </div>
        )
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <p className="text-center text-sm text-white/45">Виправте речення</p>
          <input
            ref={input}
            disabled={outcome !== null}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="field text-center text-lg"
          />
          {!outcome && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onAnswer({ correct: false, given: '' })} className="btn-ghost">
                Не знаю
              </button>
              <button disabled={value.trim() === ''} className="btn-primary">
                Перевірити
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  )
}
