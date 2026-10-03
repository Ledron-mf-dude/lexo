import { useEffect, useState } from 'react'
import type { Grade } from '../../lib/sm2'
import type { Card } from '../../lib/session'
import { normalize, type TypedResult } from '../../lib/text'
import Verdict from './Verdict'

const NO_LETTERS: string[] = []

interface Props {
  card: Card
  onGrade: (grade: Grade) => void
}

/** Build the word by tapping shuffled letter tiles in order. */
export default function Scramble({ card, onGrade }: Props) {
  const { word } = card
  const letters = card.letters ?? NO_LETTERS
  const [picked, setPicked] = useState<number[]>([]) // indices into `letters`
  const [gaveUp, setGaveUp] = useState(false)

  const answer = picked.map((i) => letters[i]).join('')
  const full = picked.length === letters.length
  const result: TypedResult | null = gaveUp ? 'wrong' : full ? (normalize(answer) === normalize(word.term) ? 'exact' : 'wrong') : null

  useEffect(() => {
    if (result !== null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Backspace') {
        setPicked((p) => p.slice(0, -1))
      } else if (e.key.length === 1) {
        const i = letters.findIndex((ch, idx) => !picked.includes(idx) && ch.toLowerCase() === e.key.toLowerCase())
        if (i >= 0) setPicked((p) => [...p, i])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [result, letters, picked])

  return (
    <div className="space-y-4">
      <div className="glass grid min-h-44 place-items-center rounded-[2rem] p-8 text-center">
        <div className="space-y-3">
          <p className="text-xs tracking-widest text-white/55 uppercase">Складіть слово</p>
          <p className="text-3xl font-light tracking-tight break-words">{word.translation}</p>
          {word.definition && <p className="text-sm text-white/55">{word.definition}</p>}
        </div>
      </div>

      <div className="flex min-h-14 flex-wrap justify-center gap-1.5">
        {letters.map((_, slot) => (
          <span
            key={slot}
            className={`grid size-11 place-items-center rounded-xl border text-xl ${
              slot < picked.length ? 'border-accent/50 bg-accent/10' : 'border-dashed border-white/15'
            } ${result === 'exact' ? 'border-good/60! text-good' : ''}`}
          >
            {slot < picked.length ? letters[picked[slot]] : ''}
          </span>
        ))}
      </div>

      {result === null ? (
        <>
          <div className="flex flex-wrap justify-center gap-2">
            {letters.map((ch, i) => (
              <button
                key={i}
                disabled={picked.includes(i)}
                onClick={() => setPicked((p) => [...p, i])}
                className="glass grid size-12 place-items-center rounded-xl text-xl transition-opacity hover:bg-white/15 disabled:opacity-20"
              >
                {ch}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPicked((p) => p.slice(0, -1))} disabled={picked.length === 0} className="btn-ghost">
              ⌫ Стерти
            </button>
            <button onClick={() => setGaveUp(true)} className="btn-ghost">
              Не знаю
            </button>
          </div>
        </>
      ) : (
        <Verdict result={result} expected={word.term} word={word} onGrade={onGrade} />
      )}
    </div>
  )
}
