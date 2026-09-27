import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import { correctAnswer, drawDeck, exercises, isCorrectText, itemsOf, promptOf, shuffle, withVariant, type Item, type Question } from '../lib/exercises'
import { allMistakes, topicStats, useExerciseLog, useLogAnswer } from '../lib/exerciseLog'
import { useFocusMode } from '../lib/focusMode'
import { LEVELS, articles, bySlug, type Level } from '../lib/grammar'
import { useTitle } from '../lib/useTitle'
import { cardItems } from '../lib/writingCards'

const DECK_SIZE = 10
const MIXED_DECK_SIZE = 15

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
      size={DECK_SIZE}
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
  const { log, settled } = useSettledLog()
  const [attempt, setAttempt] = useState(0)

  if (!settled) return <p className="text-white/50">Завантаження…</p>

  let pool: Item[]
  let title: string
  if (mine) {
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
          {mine ? 'Карток ще немає: їх додає «Тренер письма».' : mistakes ? 'Помилок немає — усі останні відповіді правильні.' : 'Для цих фільтрів немає вправ.'}
        </p>
      </section>
    )
  }
  return <Quiz key={attempt} title={title} pool={pool} size={MIXED_DECK_SIZE} showTopic back={{ to: '/grammar', label: 'До граматики' }} onRestart={() => setAttempt((n) => n + 1)} />
}

interface QuizProps {
  title: string
  pool: Item[]
  size: number
  /** Mixed decks name the topic above each question, with a link to its article in the review. */
  showTopic?: boolean
  back: { to: string; label: string }
  onRestart: () => void
}

function Quiz({ title, pool, size, showTopic, back, onRestart }: QuizProps) {
  useTitle(`Вправи: ${title.split(/[:(—]/)[0].trim()}`)
  const { session } = useAuth()
  const { mutate: logAnswer } = useLogAnswer(session!.user.id)
  const [deck] = useState(() => drawDeck(pool, size).map(withVariant))
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
                <p className="text-white/45">{m.q.why}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Link to={back.to} className="btn-ghost">
            {back.label}
          </Link>
          <button onClick={onRestart} className="btn-primary">
            Ще раз
          </button>
        </div>
      </section>
    )
  }

  const { q } = item
  return (
    <section className="space-y-5">
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

      <p className="text-center text-xs text-white/40">{showTopic ? bySlug.get(item.slug)?.title : title.split(/[:(—]/)[0].trim()}</p>

      <div key={index}>
        <QuestionView q={q} outcome={outcome} onAnswer={answer} />
      </div>

      {outcome && <Feedback q={q} outcome={outcome} last={index + 1 === deck.length} onNext={next} onOverride={override} />}
    </section>
  )
}

interface FeedbackProps {
  q: Question
  outcome: Outcome
  last: boolean
  onNext: () => void
  onOverride: () => void
}

export function Feedback({ q, outcome, last, onNext, onOverride }: FeedbackProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter') {
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
  }, [onNext])

  return (
    <div className="space-y-3">
      <div className={`glass rounded-2xl p-4 ${outcome.correct ? 'border-good/40!' : 'border-bad/40!'}`}>
        <p className={`text-sm ${outcome.correct ? 'text-good' : 'text-bad'}`}>{outcome.correct ? 'Правильно' : 'Неправильно'}</p>
        {q.type === 'fix' ? (
          <div className="mt-1 space-y-0.5">
            {q.showRight && <p className="text-sm text-white/60">Речення було без помилки. Типова помилка в ньому:</p>}
            <p className="text-white/50">
              <span className="text-bad">✗</span> <span className="line-through decoration-bad/50">{q.wrong}</span>
            </p>
            {q.answer.map((a) => (
              <p key={a} className="text-lg">
                <span className="text-good">✓</span> {a}
              </p>
            ))}
          </div>
        ) : (
          !outcome.correct && <p className="mt-1 text-lg">{correctAnswer(q)}</p>
        )}
        {q.why && <p className="mt-2 text-sm text-white/60">{q.why}</p>}
      </div>
      {/* A typed correction the checker did not recognise may still be right: let the learner count it. */}
      {q.type === 'fix' && !outcome.correct && !q.showRight && outcome.given !== '' && outcome.given !== q.wrong && (
        <button onClick={onOverride} className="w-full text-center text-sm text-white/40 hover:text-white">
          Мій варіант теж правильний
        </button>
      )}
      <button onClick={onNext} className="btn-primary w-full">
        {last ? 'Результат' : 'Далі'}
      </button>
    </div>
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
    <div className="space-y-3">
      <Prompt text={q.q} hint={q.hint} />
      <div className="grid gap-2">
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
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!outcome && value.trim() !== '') onAnswer({ correct: isCorrectText(value, q.answer), given: value.trim() })
  }
  return (
    <div className="space-y-3">
      <Prompt text={q.q} hint={q.hint} />
      <form onSubmit={submit} className="space-y-2">
        <input
          autoFocus
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

  function pick(t: number) {
    if (outcome || picked.includes(t)) return
    const next = [...picked, t]
    setPicked(next)
    if (next.length === tiles.length) {
      const given = next.map((x) => tiles[x].w).join(' ')
      onAnswer({ correct: isCorrectText(given, q.answer), given })
    }
  }

  return (
    <div className="space-y-3">
      <Prompt hint={q.hint}>
        <p className="text-xs tracking-widest text-white/35 uppercase">Складіть речення</p>
      </Prompt>
      <div className="glass min-h-16 rounded-2xl p-4 text-center text-lg">{sentence || <span className="text-white/25">Торкайтеся слів по порядку</span>}</div>
      {!outcome && (
        <>
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
            <button onClick={() => setPicked((p) => p.slice(0, -1))} disabled={picked.length === 0} className="btn-ghost">
              ⌫ Стерти
            </button>
            <button onClick={() => onAnswer({ correct: false, given: sentence })} className="btn-ghost">
              Не знаю
            </button>
          </div>
        </>
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
    <div className="space-y-3">
      <Prompt hint={q.hint}>
        <p className="text-xs tracking-widest text-white/35 uppercase">Чи є тут помилка?</p>
        <p className={`font-light tracking-tight ${shown.length > 70 ? 'text-xl' : 'text-2xl'}`}>{shown}</p>
      </Prompt>
      {!editing ? (
        !outcome && (
          <div className="grid grid-cols-2 gap-2">
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
