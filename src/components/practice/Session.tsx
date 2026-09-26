import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useState } from 'react'
import { useFocusMode } from '../../lib/focusMode'
import { useReviewWord, type WordWithTags } from '../../lib/queries'
import { buildQueue, type Card, type Exercise } from '../../lib/session'
import { complexGrade, schedule, worseGrade, type Grade, type SrsState } from '../../lib/sm2'
import type { Progress } from '../../types'
import Choice from './Choice'
import Flashcard from './Flashcard'
import Gaps from './Gaps'
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
  useFocusMode()

  // Live schedule per word, so a card repeated within the session builds on its latest state.
  const [live, setLive] = useState<Map<string, Live>>(() => new Map())
  const stateOf = useCallback((id: string): Live => live.get(id) ?? fromProgress(progress.get(id)!), [live, progress])

  const [initial] = useState(() => buildQueue(words, progress, allWords, modes))
  const [queue, setQueue] = useState<Card[]>(initial)
  const total = initial.length
  const [done, setDone] = useState(0)
  const [stats, setStats] = useState({ right: 0, wrong: 0 })
  const [step, setStep] = useState(0)
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  // Complex: the worst grade a word got in its earlier exercises; combined with the last one to set the schedule once.
  const [earlier, setEarlier] = useState<Map<string, Grade>>(() => new Map())

  const card = queue[0]

  const onGrade = useCallback(
    (grade: Grade) => {
      const current = queue[0]
      if (!current) return
      const id = current.word.id
      const prev = stateOf(id)
      const errorCount = grade === 'again' ? prev.error_count + 1 : prev.error_count
      const correct = grade !== 'again'

      if (current.commit) {
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
      setQueue((q) => {
        const rest = q.slice(1)
        if (correct) return rest
        // Missed: see it again a few cards later, as a plain flashcard (it keeps the original card's commit rule).
        const again: Card = { word: current.word, mode: 'flashcard', reverse: false, commit: current.commit, final: current.final, retry: true }
        rest.splice(Math.min(REQUEUE_AFTER, rest.length), 0, again)
        return rest
      })
      if (!correct) setFailed((f) => new Set(f).add(id))
      else setDone((d) => d + 1)
      setStep((s) => s + 1)
    },
    [queue, stateOf, saveReview, earlier],
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
        {failed.size > 0 && <p className="text-sm text-white/40">Слів з помилками: {failed.size}</p>}
        <button onClick={onFinish} className="btn-primary">
          Готово
        </button>
      </div>
    )
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
        <span>
          {done} / {total}
        </span>
      </div>

      {card.stages !== undefined && card.stages > 1 && !card.retry && (
        <p className="text-center text-xs tracking-widest text-white/35 uppercase">
          Комплекс · вправа {card.stage} з {card.stages}
        </p>
      )}

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
