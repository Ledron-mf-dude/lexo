import { useEffect, useState } from 'react'
import { useSpeakOnShow } from '../../lib/speech'
import { intervalLabel, type Grade, type SrsState } from '../../lib/sm2'
import SpeakButton from '../SpeakButton'
import type { Card } from '../../lib/session'

interface Props {
  card: Card
  state: SrsState
  onGrade: (grade: Grade) => void
}

const grades: { grade: Grade; label: string; style: string }[] = [
  { grade: 'again', label: 'Знову', style: 'text-bad' },
  { grade: 'hard', label: 'Важко', style: 'text-white/70' },
  { grade: 'good', label: 'Добре', style: 'text-accent' },
  { grade: 'easy', label: 'Легко', style: 'text-good' },
]

/** Classic recall card: front -> reveal -> self-grade. `card.reverse` swaps the sides. */
export default function Flashcard({ card, state, onGrade }: Props) {
  const [revealed, setRevealed] = useState(false)
  const { word, reverse } = card
  const front = reverse ? word.translation : word.term
  const back = reverse ? word.term : word.translation
  // The English side is the front, or the back once revealed (reverse cards).
  const englishShown = !reverse || revealed
  useSpeakOnShow(word.term, englishShown)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!revealed) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          setRevealed(true)
        }
        return
      }
      const i = Number(e.key) - 1
      if (i >= 0 && i < grades.length) onGrade(grades[i].grade)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, onGrade])

  return (
    <div className="relative space-y-4">
      {englishShown && <SpeakButton text={word.term} className="absolute top-3 right-3 z-[1]" />}
      <button
        onClick={() => setRevealed(true)}
        disabled={revealed}
        className="glass grid min-h-72 w-full place-items-center rounded-[2rem] p-8 text-center"
      >
        <div className="space-y-4">
          <p className="text-xs tracking-widest text-white/35 uppercase">{reverse ? 'Переклад → слово' : 'Слово → переклад'}</p>
          <p className="text-4xl font-light tracking-tight break-words">{front}</p>
          {revealed ? (
            <div className="space-y-2 border-t border-white/10 pt-4">
              <p className="text-2xl text-accent break-words">{back}</p>
              {word.definition && <p className="text-sm text-white/50">{word.definition}</p>}
              {word.example && <p className="text-sm text-white/40 italic">{word.example}</p>}
            </div>
          ) : (
            <p className="text-sm text-white/30">Натисніть, щоб показати відповідь</p>
          )}
        </div>
      </button>

      {revealed && (
        <div className="grid grid-cols-4 gap-2">
          {grades.map((g, i) => (
            <button key={g.grade} onClick={() => onGrade(g.grade)} className="glass rounded-2xl px-2 py-3 transition-colors hover:bg-white/15">
              <span className={`block text-sm ${g.style}`}>{g.label}</span>
              <span className="block text-xs text-white/40">{intervalLabel(state, g.grade)}</span>
              <span className="hidden text-[10px] text-white/25 md:block">{i + 1}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
