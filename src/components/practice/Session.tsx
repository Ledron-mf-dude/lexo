import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useState } from 'react'
import { useReviewWord, type WordWithTags } from '../../lib/queries'
import { makeCard, type Card, type ModeChoice } from '../../lib/session'
import { schedule, type Grade, type SrsState } from '../../lib/sm2'
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
  mode: ModeChoice
  onFinish: () => void
}

interface Live extends SrsState {
  error_count: number
}

const REQUEUE_AFTER = 3

function fromProgress(p: Progress): Live {
  return { ease_factor: p.ease_factor, interval_days: p.interval_days, repetitions: p.repetitions, error_count: p.error_count }
}

export default function Session({ userId, words, allWords, progress, mode, onFinish }: Props) {
  const { mutate: saveReview } = useReviewWord(userId)

  // Live schedule per word, so a card repeated within the session builds on its latest state.
  const [live, setLive] = useState<Map<string, Live>>(() => new Map())
  const stateOf = useCallback((id: string): Live => live.get(id) ?? fromProgress(progress.get(id)!), [live, progress])

  const [queue, setQueue] = useState<Card[]>(() => words.map((w) => makeCard(w, progress.get(w.id)!, allWords, mode)))
  const [total] = useState(words.length)
  const [done, setDone] = useState(0)
  const [stats, setStats] = useState({ right: 0, wrong: 0 })
  const [step, setStep] = useState(0)
  const [failed, setFailed] = useState<Set<string>>(() => new Set())

  const card = queue[0]

  const onGrade = useCallback(
    (grade: Grade) => {
      const current = queue[0]
      if (!current) return
      const id = current.word.id
      const prev = stateOf(id)
      const next = schedule(prev, grade)
      const errorCount = grade === 'again' ? prev.error_count + 1 : prev.error_count
      setLive((m) => new Map(m).set(id, { ...next, error_count: errorCount }))
      saveReview({ wordId: id, mode: current.mode, correct: grade !== 'again', errorCount, next })

      setStats((s) => (grade === 'again' ? { ...s, wrong: s.wrong + 1 } : { ...s, right: s.right + 1 }))
      setQueue((q) => {
        const rest = q.slice(1)
        if (grade !== 'again') return rest
        // Missed: see it again a few cards later, as a plain flashcard.
        const again: Card = { word: current.word, mode: 'flashcard', reverse: false }
        rest.splice(Math.min(REQUEUE_AFTER, rest.length), 0, again)
        return rest
      })
      if (grade === 'again') setFailed((f) => new Set(f).add(id))
      else setDone((d) => d + 1)
      setStep((s) => s + 1)
    },
    [queue, stateOf, saveReview],
  )

  if (!card) {
    const accuracy = stats.right + stats.wrong > 0 ? Math.round((stats.right / (stats.right + stats.wrong)) * 100) : 0
    return (
      <div className="glass space-y-4 rounded-[2rem] p-8 text-center">
        <h2 className="text-3xl font-light">Сесію завершено</h2>
        <p className="text-white/60">
          Слів: {total} · правильно {stats.right} · помилок {stats.wrong} · точність {accuracy}%
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
