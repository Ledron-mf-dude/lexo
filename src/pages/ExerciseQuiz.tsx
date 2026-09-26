import { useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { correctAnswer, exercises, isCorrectText, type Question } from '../lib/exercises'
import { topicStats, useExerciseLog, useLogAnswer } from '../lib/exerciseLog'
import { bySlug } from '../lib/grammar'
import { useFocusMode } from '../lib/focusMode'

const DECK_SIZE = 10

function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Authors put answers in any order; shuffle the options so the position of the right one never gives it away. */
function withShuffledOptions(q: Question): Question {
  if (q.type !== 'choice') return q
  const correct = q.options[q.answer]
  const options = shuffle(q.options)
  return { ...q, options, answer: options.indexOf(correct) }
}

interface Outcome {
  correct: boolean
  given: string
}

export default function ExerciseQuiz() {
  const { slug = '' } = useParams()
  const article = bySlug.get(slug)
  const bank = exercises.get(slug)
  const mistakesOnly = (useLocation().state as { mistakes?: boolean } | null)?.mistakes === true
  const log = useExerciseLog()
  const [attempt, setAttempt] = useState(0)
  // Once the log has answered (or failed), keep the quiz mounted: a background refetch must not reset a quiz in progress.
  const [settled, setSettled] = useState(false)
  if (!settled && !log.isPending) setSettled(true)

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
  const wrong = new Set(topicStats(log.data, slug, new Set(bank.map((q) => q.id))).mistakes)
  const pool = mistakesOnly ? bank.filter((q) => wrong.has(q.id)) : bank
  return <Quiz key={attempt} slug={slug} title={article.title} pool={pool.length > 0 ? pool : bank} onRestart={() => setAttempt((n) => n + 1)} />
}

function Quiz({ slug, title, pool, onRestart }: { slug: string; title: string; pool: Question[]; onRestart: () => void }) {
  const { session } = useAuth()
  const { mutate: logAnswer } = useLogAnswer(session!.user.id)
  const [deck] = useState(() => shuffle(pool).slice(0, DECK_SIZE).map(withShuffledOptions))
  const [index, setIndex] = useState(0)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [results, setResults] = useState<{ q: Question; outcome: Outcome }[]>([])
  const [round, setRound] = useState(0)

  const q = deck[index]
  useFocusMode(q !== undefined)

  function answer(o: Outcome) {
    if (outcome) return
    setOutcome(o)
    setResults((r) => [...r, { q, outcome: o }])
    logAnswer({ slug, questionId: q.id, correct: o.correct })
  }

  function next() {
    setOutcome(null)
    setIndex((i) => i + 1)
    setRound((r) => r + 1)
  }

  if (!q) {
    const score = results.filter((r) => r.outcome.correct).length
    const missed = results.filter((r) => !r.outcome.correct)
    return (
      <section className="space-y-5">
        <div className="glass space-y-3 rounded-[2rem] p-8 text-center">
          <p className="text-xs tracking-widest text-white/35 uppercase">{title}</p>
          <p className="text-5xl font-light">
            {score} <span className="text-2xl text-white/40">/ {results.length}</span>
          </p>
          <p className="text-white/50">{score === results.length ? 'Без помилок!' : `Помилок: ${missed.length}`}</p>
        </div>
        {missed.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm tracking-widest text-white/40 uppercase">Розберіть помилки</h2>
            {missed.map(({ q: mq, outcome: o }) => (
              <div key={mq.id} className="glass space-y-1 rounded-2xl p-4 text-sm">
                <p className="text-white/60">{mq.type === 'order' ? mq.words.join(' / ') : mq.q}</p>
                <p>
                  <span className="text-bad">{o.given || '—'}</span> → <span className="text-good">{correctAnswer(mq)}</span>
                </p>
                <p className="text-white/45">{mq.why}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Link to={`/grammar/${slug}`} className="btn-ghost">
            До статті
          </Link>
          <button onClick={onRestart} className="btn-primary">
            Ще раз
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3 text-sm text-white/50">
        <Link to={`/grammar/${slug}`} aria-label="Вийти з вправ" className="hover:text-white">
          ✕
        </Link>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-accent transition-all" style={{ width: `${(index / deck.length) * 100}%` }} />
        </div>
        <span>
          {index + 1} / {deck.length}
        </span>
      </div>

      <div key={round}>
        {q.type === 'choice' && <ChoiceQ q={q} outcome={outcome} onAnswer={answer} />}
        {q.type === 'fill' && <FillQ q={q} outcome={outcome} onAnswer={answer} />}
        {q.type === 'order' && <OrderQ q={q} outcome={outcome} onAnswer={answer} />}
      </div>

      {outcome && (
        <div className="space-y-3">
          <div className={`glass rounded-2xl p-4 ${outcome.correct ? 'border-good/40!' : 'border-bad/40!'}`}>
            <p className={`text-sm ${outcome.correct ? 'text-good' : 'text-bad'}`}>{outcome.correct ? 'Правильно' : 'Неправильно'}</p>
            {!outcome.correct && <p className="mt-1 text-lg">{correctAnswer(q)}</p>}
            <p className="mt-2 text-sm text-white/55">{q.why}</p>
          </div>
          <button autoFocus onClick={next} className="btn-primary w-full">
            {index + 1 === deck.length ? 'Результат' : 'Далі'}
          </button>
        </div>
      )}
    </section>
  )
}

interface QProps<T extends Question> {
  q: T
  outcome: Outcome | null
  onAnswer: (o: Outcome) => void
}

function Prompt({ children }: { children: React.ReactNode }) {
  return <div className="glass grid min-h-40 place-items-center rounded-[2rem] p-8 text-center text-2xl font-light tracking-tight">{children}</div>
}

function ChoiceQ({ q, outcome, onAnswer }: QProps<Extract<Question, { type: 'choice' }>>) {
  const picked = outcome?.given
  function style(option: string, i: number) {
    if (!outcome) return 'hover:bg-white/15'
    if (i === q.answer) return 'border-good/60 bg-good/15 text-good'
    if (option === picked) return 'border-bad/60 bg-bad/15 text-bad'
    return 'opacity-40'
  }
  return (
    <div className="space-y-3">
      <Prompt>{q.q}</Prompt>
      <div className="grid gap-2">
        {q.options.map((option, i) => (
          <button
            key={option}
            disabled={outcome !== null}
            onClick={() => onAnswer({ correct: i === q.answer, given: option })}
            className={`glass rounded-2xl px-4 py-3 text-left transition-colors ${style(option, i)}`}
          >
            {option}
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
      <Prompt>{q.q}</Prompt>
      <form onSubmit={submit} className="space-y-2">
        <input
          autoFocus
          disabled={outcome !== null}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
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
      <Prompt>Складіть речення</Prompt>
      <div className="glass min-h-16 rounded-2xl p-4 text-center text-lg">{sentence || <span className="text-white/25">…</span>}</div>
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
