import { useRef, useState } from 'react'
import type { Grade } from '../../lib/sm2'
import type { Card } from '../../lib/session'
import { normalize, type TypedResult } from '../../lib/text'
import Verdict from './Verdict'

interface Props {
  card: Card
  onGrade: (grade: Grade) => void
}

/** The word with some letters hidden; the user fills the gaps one letter at a time. */
export default function Gaps({ card, onGrade }: Props) {
  const { word } = card
  const gaps = card.gaps ?? []
  const chars = [...word.term]
  const [values, setValues] = useState<string[]>(() => gaps.map(() => ''))
  const [result, setResult] = useState<TypedResult | null>(null)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  function assemble(v: string[]) {
    const filled = [...chars]
    gaps.forEach((pos, g) => (filled[pos] = v[g]))
    return filled.join('')
  }

  function check(v: string[]) {
    setResult(normalize(assemble(v)) === normalize(word.term) ? 'exact' : 'wrong')
  }

  function onChange(g: number, raw: string) {
    const ch = raw.slice(-1)
    const next = values.map((x, i) => (i === g ? ch : x))
    setValues(next)
    if (ch === '') return
    if (next.every((x) => x !== '')) check(next)
    else {
      const nextEmpty = next.findIndex((x, i) => i > g && x === '')
      inputs.current[nextEmpty >= 0 ? nextEmpty : next.indexOf('')]?.focus()
    }
  }

  function onKeyDown(g: number, key: string) {
    if (key === 'Backspace' && values[g] === '' && g > 0) inputs.current[g - 1]?.focus()
  }

  return (
    <div className="space-y-4">
      <div className="glass grid min-h-44 place-items-center rounded-[2rem] p-8 text-center">
        <div className="space-y-3">
          <p className="text-xs tracking-widest text-white/35 uppercase">Допишіть пропущені літери</p>
          <p className="text-3xl font-light tracking-tight break-words">{word.translation}</p>
          {word.definition && <p className="text-sm text-white/40">{word.definition}</p>}
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-1.5 text-2xl">
        {chars.map((ch, i) => {
          const g = gaps.indexOf(i)
          if (g < 0) return ch === ' ' ? <span key={i} className="w-3" /> : <span key={i} className="grid size-11 place-items-center">{ch}</span>
          return (
            <input
              key={i}
              ref={(el) => {
                inputs.current[g] = el
              }}
              autoFocus={g === 0}
              disabled={result !== null}
              value={result !== null ? chars[i] : values[g]}
              onChange={(e) => onChange(g, e.target.value)}
              onKeyDown={(e) => onKeyDown(g, e.key)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={2}
              className={`size-11 rounded-xl border bg-white/5 text-center outline-none focus:border-accent ${
                result === 'exact' ? 'border-good/60 text-good' : result === 'wrong' ? 'border-bad/60 text-bad' : 'border-white/20'
              }`}
            />
          )
        })}
      </div>

      {result === null ? (
        <button onClick={() => setResult('wrong')} className="btn-ghost w-full">
          Не знаю
        </button>
      ) : (
        <Verdict result={result} expected={word.term} onGrade={onGrade} />
      )}
    </div>
  )
}
