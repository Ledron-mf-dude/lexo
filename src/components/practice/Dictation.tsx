import { useEffect, useState, type FormEvent } from 'react'
import type { Grade } from '../../lib/sm2'
import type { Card } from '../../lib/session'
import { speak } from '../../lib/speech'
import type { TypedResult } from '../../lib/text'
import Verdict from './Verdict'

interface Props {
  card: Card
  onGrade: (grade: Grade) => void
}

/** Words of a sentence for comparison: case, punctuation and curly apostrophes do not count. */
const wordsOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

/** Word-level edit distance: how many words are missing, extra or different. */
function wordErrors(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

/** «Диктант речень»: the word's example sentence is read aloud; the learner writes the whole sentence down. */
export default function Dictation({ card, onGrade }: Props) {
  const sentence = card.word.example ?? ''
  const [value, setValue] = useState('')
  const [result, setResult] = useState<TypedResult | null>(null)

  useEffect(() => {
    speak(sentence)
  }, [sentence])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (result || value.trim() === '') return
    const expected = wordsOf(sentence)
    const errors = wordErrors(wordsOf(value), expected)
    // One slip per ~7 words is «almost»: the ear caught the sentence, the spelling needs another look.
    setResult(errors === 0 ? 'exact' : errors <= Math.max(1, Math.round(expected.length / 7)) ? 'typo' : 'wrong')
  }

  return (
    <div className="space-y-4">
      <div className="glass grid min-h-48 place-items-center rounded-[2rem] p-8 text-center">
        <div className="space-y-4">
          <p className="text-xs tracking-widest text-white/55 uppercase">Запишіть речення</p>
          <div className="flex items-center justify-center gap-3">
            <button type="button" onClick={() => speak(sentence)} aria-label="Прослухати ще раз" className="grid size-16 place-items-center rounded-full bg-accent/20 text-accent transition-colors hover:bg-accent/30">
              <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
              </svg>
            </button>
            <button type="button" onClick={() => speak(sentence, 0.6)} className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/55 transition-colors hover:text-white">
              Повільно
            </button>
          </div>
          <p className="text-sm text-white/55">Підказка: у реченні є слово «{card.word.translation}»</p>
        </div>
      </div>

      {result === null ? (
        <form onSubmit={submit} className="space-y-2">
          <textarea
            rows={2}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) submit(e)
            }}
            autoComplete="off"
            autoCapitalize="sentences"
            spellCheck={false}
            placeholder="Що ви почули"
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
        <>
          {result !== 'exact' && value.trim() && <p className="text-center text-sm text-white/60">Ви написали: «{value.trim()}»</p>}
          <Verdict result={result} expected={sentence} onGrade={onGrade} typoLabel="Майже — одне-два слова відрізняються" />
        </>
      )}
    </div>
  )
}
