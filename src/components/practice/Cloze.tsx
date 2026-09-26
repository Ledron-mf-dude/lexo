import { useEffect, useState } from 'react'
import { useSpeakOnShow } from '../../lib/speech'
import type { Grade } from '../../lib/sm2'
import type { Card } from '../../lib/session'
import SpeakButton from '../SpeakButton'

const NO_OPTIONS: string[] = []

interface Props {
  card: Card
  onGrade: (grade: Grade) => void
}

/** A sentence with the word blanked out: pick the word that fits. */
export default function Cloze({ card, onGrade }: Props) {
  const { word, blank } = card
  const options = card.options ?? NO_OPTIONS
  const [picked, setPicked] = useState<string | null>(null)
  const answered = picked !== null
  const isRight = picked === word.term
  const full = blank ? `${blank.before}${blank.found}${blank.after}` : word.term
  useSpeakOnShow(full, answered)

  useEffect(() => {
    if (!answered) return
    if (isRight) {
      const t = setTimeout(() => onGrade('good'), 1400)
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
        onGrade('again')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [answered, isRight, options, onGrade])

  function style(option: string) {
    if (!answered) return 'hover:bg-white/15'
    if (option === word.term) return 'border-good/60 bg-good/15 text-good'
    if (option === picked) return 'border-bad/60 bg-bad/15 text-bad'
    return 'opacity-40'
  }

  return (
    <div className="space-y-4">
      <div className="glass grid min-h-56 place-items-center rounded-[2rem] p-6 text-center">
        <div className="space-y-3">
          <p className="text-xs tracking-widest text-white/35 uppercase">Вставте потрібне слово</p>
          <p className="text-2xl leading-snug font-light break-words">
            {blank?.before}
            {answered ? (
              <span className={`inline-block rounded-lg px-1.5 ${isRight ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'}`}>{blank?.found}</span>
            ) : (
              <span className="inline-block min-w-16 border-b-2 border-accent/70 text-transparent select-none">____</span>
            )}
            {blank?.after}
          </p>
          <p className="text-sm text-white/40">підказка: {word.translation}</p>
          {answered && <SpeakButton text={full} />}
        </div>
      </div>

      <div className="grid gap-2">
        {options.map((option, i) => (
          <button
            key={option}
            onClick={() => !answered && setPicked(option)}
            className={`glass flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${style(option)}`}
          >
            <span className="hidden w-4 text-xs text-white/30 md:block">{i + 1}</span>
            <span className="break-words">{option}</span>
          </button>
        ))}
      </div>

      {answered && !isRight && (
        <button onClick={() => onGrade('again')} className="btn-primary w-full">
          Далі
        </button>
      )}
    </div>
  )
}
