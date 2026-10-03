import { useEffect, useState, type FormEvent } from 'react'
import { speak } from '../../lib/speech'
import type { Grade } from '../../lib/sm2'
import type { Card } from '../../lib/session'
import { checkTyped, type TypedResult } from '../../lib/text'
import Verdict from './Verdict'

interface Props {
  card: Card
  onGrade: (grade: Grade) => void
}

/** Dictation: the word is spoken, the user types what they hear. */
export default function Listen({ card, onGrade }: Props) {
  const { word } = card
  const [value, setValue] = useState('')
  const [result, setResult] = useState<TypedResult | null>(null)

  useEffect(() => {
    speak(word.term)
  }, [word.term])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (result === null && value.trim() !== '') setResult(checkTyped(value, word.term))
  }

  return (
    <div className="space-y-4">
      <div className="glass grid min-h-56 place-items-center rounded-[2rem] p-8 text-center">
        <div className="space-y-4">
          <p className="text-xs tracking-widest text-white/55 uppercase">Послухайте й введіть слово</p>
          <div className="flex justify-center gap-3">
            <button type="button" onClick={() => speak(word.term)} aria-label="Прослухати ще раз" className="grid size-20 place-items-center rounded-full bg-accent/20 text-accent transition-colors hover:bg-accent/30">
              <svg viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
              </svg>
            </button>
            <button type="button" onClick={() => speak(word.term, 0.55)} className="rounded-full border border-white/12 px-4 text-sm text-white/55 transition-colors hover:text-white">
              Повільно
            </button>
          </div>
          <p className="text-xs text-white/50">
            {word.term.length} символів · переклад: {word.translation}
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
            placeholder="Що ви почули?"
            className="field text-center text-lg"
          />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setResult('wrong')} className="btn-ghost">
              Не розібрав
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
