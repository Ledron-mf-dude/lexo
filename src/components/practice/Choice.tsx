import { useEffect, useState } from 'react'
import { useSpeakOnShow } from '../../lib/speech'
import type { Grade } from '../../lib/sm2'
import SpeakButton from '../SpeakButton'
import type { Card } from '../../lib/session'

const NO_OPTIONS: string[] = []

interface Props {
  card: Card
  /** `given`: the wrong option picked, logged to find words that get confused. */
  onGrade: (grade: Grade, given?: string) => void
}

/** Multiple choice: pick the translation. Right -> "good" after a short pause, wrong -> "again" after the user has seen the answer. */
export default function Choice({ card, onGrade }: Props) {
  const [picked, setPicked] = useState<string | null>(null)
  const options = card.options ?? NO_OPTIONS
  const correct = card.word.translation
  const answered = picked !== null
  const isRight = picked === correct
  useSpeakOnShow(card.word.term)

  function pick(option: string) {
    if (!answered) setPicked(option)
  }

  useEffect(() => {
    if (!answered) return
    if (isRight) {
      const t = setTimeout(() => onGrade('good'), 900)
      return () => clearTimeout(t)
    }
  }, [answered, isRight, onGrade])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!answered) {
        const i = Number(e.key) - 1
        if (i >= 0 && i < options.length) setPicked(options[i])
      } else if (!isRight && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        onGrade('again', picked ?? undefined)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [answered, isRight, options, onGrade, picked])

  function style(option: string) {
    if (!answered) return 'hover:bg-white/15'
    if (option === correct) return 'border-good/60 bg-good/15 text-good'
    if (option === picked) return 'border-bad/60 bg-bad/15 text-bad'
    return 'opacity-40'
  }

  return (
    <div className="space-y-4">
      <div className="glass grid min-h-56 place-items-center rounded-[2rem] p-8 text-center">
        <div className="space-y-3">
          <p className="text-xs tracking-widest text-white/35 uppercase">Оберіть переклад</p>
          <p className="flex items-center justify-center gap-2 text-4xl font-light tracking-tight break-words">
            {card.word.term}
            <SpeakButton text={card.word.term} />
          </p>
          {answered && card.word.example && <p className="text-sm text-white/40 italic">{card.word.example}</p>}
        </div>
      </div>

      <div className="grid gap-2">
        {options.map((option, i) => (
          <button
            key={option}
            onClick={() => pick(option)}
            className={`glass flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${style(option)}`}
          >
            <span className="hidden w-4 text-xs text-white/30 md:block">{i + 1}</span>
            <span className="break-words">{option}</span>
          </button>
        ))}
      </div>

      {answered && !isRight && (
        <button onClick={() => onGrade('again', picked ?? undefined)} className="btn-primary w-full">
          Далі
        </button>
      )}
    </div>
  )
}
