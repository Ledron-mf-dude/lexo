import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { useFocusMode } from '../../lib/focusMode'
import { useReviewWord, type WordWithTags } from '../../lib/queries'
import { EXERCISES, buildQueue, type Card, type Exercise } from '../../lib/session'
import { canSpeak, setAutoSpeak, useAutoSpeak } from '../../lib/speech'
import { complexGrade, schedule, worseGrade, type Grade, type SrsState } from '../../lib/sm2'
import type { Progress } from '../../types'
import SpeakButton from '../SpeakButton'
import Choice from './Choice'
import Cloze from './Cloze'
import Flashcard from './Flashcard'
import Gaps from './Gaps'
import Listen from './Listen'
import Match from './Match'
import Scramble from './Scramble'
import Typing from './Typing'

interface Props {
  userId: string
  words: WordWithTags[]
  allWords: WordWithTags[]
  progress: Map<string, Progress>
  modes: Exercise[]
  onFinish: () => void
}

interface Live extends SrsState {
  error_count: number
}

const REQUEUE_AFTER = 3

function fromProgress(p: Progress): Live {
  return { ease_factor: p.ease_factor, interval_days: p.interval_days, repetitions: p.repetitions, error_count: p.error_count }
}

export default function Session({ userId, words, allWords, progress, modes, onFinish }: Props) {
  const { mutate: saveReview } = useReviewWord(userId)
  const autoSpeak = useAutoSpeak()
  useFocusMode()

  // Live schedule per word, so a card repeated within the session builds on its latest state.
  const [live, setLive] = useState<Map<string, Live>>(() => new Map())
  const stateOf = useCallback((id: string): Live => live.get(id) ?? fromProgress(progress.get(id)!), [live, progress])

  const [initial] = useState(() => buildQueue(words, progress, allWords, modes))
  const [queue, setQueue] = useState<Card[]>(initial)
  const total = initial.reduce((n, c) => n + (c.group?.length ?? 1), 0)
  // The exercises that actually have cards (an exercise nobody can do is left out of the complex).
  const rounds = modes.filter((m) => initial.some((c) => c.round === m))
  const [done, setDone] = useState(0)
  const [stats, setStats] = useState({ right: 0, wrong: 0 })
  const [step, setStep] = useState(0)
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  // Answers in a row without a miss (like a Duolingo combo), and the best run of the session.
  const [combo, setCombo] = useState({ now: 0, best: 0 })
  // Complex: the worst grade a word got in its earlier exercises; combined with the last one to set the schedule once.
  const [earlier, setEarlier] = useState<Map<string, Grade>>(() => new Map())

  const card = queue[0]
  // Complex: the round whose intro screen has been dismissed; a new round starts with an announcement.
  const [announced, setAnnounced] = useState<Exercise | null>(null)

  // Grades one word for the card being answered: schedule (or just the log, in a complex), counters and the failed set.
  const gradeWord = useCallback(
    (current: Card, word: WordWithTags, grade: Grade) => {
      const id = word.id
      const prev = stateOf(id)
      const errorCount = grade === 'again' ? prev.error_count + 1 : prev.error_count
      const correct = grade !== 'again'
      const commit = current.commitFor ? current.commitFor.includes(id) : current.commit

      if (commit) {
        // Complex: one grade for the whole word (a retry is graded on its own, as in a single exercise).
        const final = current.retry ? grade : complexGrade(earlier.get(id), grade)
        const next = schedule(prev, final)
        setLive((m) => new Map(m).set(id, { ...next, error_count: errorCount }))
        saveReview({ wordId: id, mode: current.mode, correct, errorCount, next })
      } else {
        setLive((m) => new Map(m).set(id, { ...prev, error_count: errorCount }))
        saveReview({ wordId: id, mode: current.mode, correct, errorCount })
        if (!current.retry) setEarlier((m) => new Map(m).set(id, worseGrade(m.get(id), grade)))
      }

      setStats((s) => (correct ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 }))
      if (!correct) {
        setFailed((f) => new Set(f).add(id))
        if (navigator.vibrate) navigator.vibrate(50)
      }
      return commit
    },
    [stateOf, saveReview, earlier],
  )

  // Answers the card on top of the queue. A matching card grades several words at once.
  const onGrades = useCallback(
    (results: { word: WordWithTags; grade: Grade }[]) => {
      const current = queue[0]
      if (!current) return
      const retries: Card[] = []
      let solved = 0
      for (const { word, grade } of results) {
        const commit = gradeWord(current, word, grade)
        if (grade === 'again') {
          // Missed: see it again a few cards later, as a plain flashcard (it keeps the original card's commit rule).
          retries.push({ word, mode: 'flashcard', reverse: false, commit, final: commit, retry: true })
        } else solved++
      }
      setQueue((q) => {
        const rest = q.slice(1)
        rest.splice(Math.min(REQUEUE_AFTER, rest.length), 0, ...retries)
        return rest
      })
      setDone((d) => d + solved)
      setCombo((c) => {
        const now = retries.length > 0 ? 0 : c.now + results.length
        return { now, best: Math.max(c.best, now) }
      })
      setStep((s) => s + 1)
    },
    [queue, gradeWord],
  )

  const onGrade = useCallback((grade: Grade) => onGrades(queue[0] ? [{ word: queue[0].word, grade }] : []), [queue, onGrades])

  const onMatched = useCallback(
    (mistakes: Record<string, number>) => {
      const group = queue[0]?.group ?? []
      // No mistakes: good; one: hard; more: again (the word comes back as a flashcard).
      onGrades(group.map((word) => ({ word, grade: (mistakes[word.id] ?? 0) === 0 ? 'good' : mistakes[word.id] === 1 ? 'hard' : 'again' })))
    },
    [queue, onGrades],
  )

  if (!card) {
    const answers = stats.right + stats.wrong
    const accuracy = answers > 0 ? Math.round((stats.right / answers) * 100) : 0
    return (
      <div className="glass space-y-4 rounded-[2rem] p-8 text-center">
        <h2 className="text-3xl font-light">Сесію завершено</h2>
        <p className="text-white/60">
          Слів: {words.length} · відповідей {answers} · правильно {stats.right} · помилок {stats.wrong} · точність {accuracy}%
        </p>
        {combo.best >= 3 && <p className="text-sm text-[#fbbf24]">Найдовша серія без помилок: {combo.best}</p>}
        {failed.size > 0 && (
          <div className="space-y-2 pt-2 text-left">
            <p className="text-center text-xs tracking-widest text-white/35 uppercase">Слова, у яких були помилки · {failed.size}</p>
            <ul className="space-y-1.5">
              {words
                .filter((w) => failed.has(w.id))
                .map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-1.5">
                    <span className="min-w-0 break-words">
                      <span className="font-medium">{w.term}</span> <span className="text-white/50">— {w.translation}</span>
                    </span>
                    <SpeakButton text={w.term} className="size-8" />
                  </li>
                ))}
            </ul>
          </div>
        )}
        <button onClick={onFinish} className="btn-primary">
          Готово
        </button>
      </div>
    )
  }

  if (card.round && card.round !== announced) {
    return <RoundIntro round={card.round} modes={rounds} words={queue.filter((c) => c.round === card.round).reduce((n, c) => n + (c.group?.length ?? 1), 0)} onStart={() => setAnnounced(card.round!)} onExit={onFinish} />
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 text-sm text-white/50">
        <button onClick={onFinish} aria-label="Вийти з сесії" className="hover:text-white">
          ✕
        </button>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
          <motion.div className="h-full bg-accent" animate={{ width: `${(done / total) * 100}%` }} transition={{ duration: 0.3 }} />
        </div>
        {combo.now >= 3 && <span className="rounded-full bg-[#fbbf24]/15 px-2.5 py-1 text-xs text-[#fbbf24] tabular-nums">×{combo.now}</span>}
        {canSpeak && (
          <button
            onClick={() => setAutoSpeak(!autoSpeak)}
            aria-pressed={autoSpeak}
            aria-label="Озвучувати слова автоматично"
            title="Озвучувати слова автоматично"
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${autoSpeak ? 'border-accent bg-accent/20 text-accent' : 'border-white/12 text-white/45'}`}
          >
            {autoSpeak ? 'Звук: увімк.' : 'Звук: вимк.'}
          </button>
        )}
        <span>
          {done} / {total}
        </span>
      </div>

      {card.retry && rounds.length >= 2 && <p className="text-center text-xs tracking-widest text-white/35 uppercase">Повтор помилки</p>}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.22 }}
        >
          {card.mode === 'choice' ? (
            <Choice card={card} onGrade={onGrade} />
          ) : card.mode === 'match' ? (
            <Match card={card} onDone={onMatched} />
          ) : card.mode === 'cloze' ? (
            <Cloze card={card} onGrade={onGrade} />
          ) : card.mode === 'listen' ? (
            <Listen card={card} onGrade={onGrade} />
          ) : card.mode === 'typing' ? (
            <Typing card={card} onGrade={onGrade} />
          ) : card.mode === 'scramble' ? (
            <Scramble card={card} onGrade={onGrade} />
          ) : card.mode === 'gaps' ? (
            <Gaps card={card} onGrade={onGrade} />
          ) : (
            <Flashcard card={card} state={stateOf(card.word.id)} onGrade={onGrade} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/** Shown between the rounds of a complex: which exercise comes next and how far along the complex is. */
function RoundIntro({ round, modes, words, onStart, onExit }: { round: Exercise; modes: Exercise[]; words: number; onStart: () => void; onExit: () => void }) {
  const index = modes.indexOf(round)
  const label = EXERCISES.find((e) => e.value === round)?.label ?? round
  const next = modes[index + 1] && EXERCISES.find((e) => e.value === modes[index + 1])?.label

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onStart()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onStart])

  return (
    <div className="space-y-5">
      <button onClick={onExit} aria-label="Вийти з сесії" className="text-sm text-white/50 hover:text-white">
        ✕
      </button>
      <div className="glass space-y-4 rounded-[2rem] p-8 text-center">
        <p className="text-xs tracking-widest text-white/35 uppercase">
          Вправа {index + 1} з {modes.length}
        </p>
        <h2 className="text-3xl font-light">{label}</h2>
        <p className="text-white/50">Слів у цьому колі: {words}</p>
        {next && <p className="text-sm text-white/35">Далі: {next}</p>}
        <button onClick={onStart} className="btn-primary w-full">
          Почати
        </button>
      </div>
    </div>
  )
}
