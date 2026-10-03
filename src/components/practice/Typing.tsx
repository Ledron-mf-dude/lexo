import { useState, type FormEvent } from 'react'
import type { Grade } from '../../lib/sm2'
import type { Card } from '../../lib/session'
import { checkTyped, type TypedResult } from '../../lib/text'
import Verdict from './Verdict'

interface Props {
  card: Card
  onGrade: (grade: Grade) => void
}

/** Show the translation, the user types the word. Small typos are accepted with a lower grade. */
export default function Typing({ card, onGrade }: Props) {
  const { word } = card
  const [value, setValue] = useState('')
  const [result, setResult] = useState<TypedResult | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (result === null && value.trim() !== '') setResult(checkTyped(value, word.term))
  }

  return (
    <div className="space-y-4">
      <div className="glass grid min-h-56 place-items-center rounded-[2rem] p-8 text-center">
        <div className="space-y-3">
          <p className="text-xs tracking-widest text-white/55 uppercase">Введіть слово</p>
          <p className="text-3xl font-light tracking-tight break-words">{word.translation}</p>
          {word.definition && <p className="text-sm text-white/55">{word.definition}</p>}
          <p className="text-xs text-white/50">
            {word.term.length} символів, починається на «{word.term[0]}»
          </p>
        </div>
      </div>

      {result === null ? (
        <form onSubmit={submit} className="space-y-2">
          <input
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ваша відповідь"
            className="field text-center text-lg"
          />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setResult('wrong')} className="btn-ghost">
              Не знаю
            </button>
            <button disabled={value.trim() === ''} className="btn-primary">
              Перевірити
            </button>
          </div>
        </form>
      ) : (
        <Verdict result={result} expected={word.term} word={word} onGrade={onGrade} />
      )}
    </div>
  )
}
