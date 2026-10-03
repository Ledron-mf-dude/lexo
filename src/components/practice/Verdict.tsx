import { useEffect } from 'react'
import { useSpeakOnShow } from '../../lib/speech'
import type { Grade } from '../../lib/sm2'
import SpeakButton from '../SpeakButton'
import type { TypedResult } from '../../lib/text'
import type { Word } from '../../types'

interface Props {
  result: TypedResult
  expected: string
  onGrade: (grade: Grade) => void
  /** Heading for a near miss; typing says «одруківка», speaking says the sound was a little off. */
  typoLabel?: string
  /** The word behind the answer: after a miss its transcription, example and note help it stick. */
  word?: Pick<Word, 'ipa' | 'example' | 'note'>
}

const GRADE: Record<TypedResult, Grade> = { exact: 'good', typo: 'hard', wrong: 'again' }

/**
 * Feedback after a typed / assembled answer. A perfect answer moves on by itself;
 * a typo or a miss waits for the user so the correct spelling can be read.
 */
export default function Verdict({ result, expected, onGrade, typoLabel = 'Майже — є одруківка', word }: Props) {
  useSpeakOnShow(expected)
  useEffect(() => {
    if (result === 'exact') {
      const t = setTimeout(() => onGrade('good'), 800)
      return () => clearTimeout(t)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onGrade(GRADE[result])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [result, onGrade])

  if (result === 'exact') return <p className="text-center text-good">Правильно</p>

  return (
    <div className="space-y-3">
      <div className={`glass rounded-2xl p-4 text-center ${result === 'typo' ? 'border-accent/50!' : 'border-bad/50!'}`}>
        <p className={`text-sm ${result === 'typo' ? 'text-accent' : 'text-bad'}`}>
          {result === 'typo' ? typoLabel : 'Неправильно'}
        </p>
        <p className="mt-1 flex items-center justify-center gap-2 text-2xl break-words">
          {expected}
          <SpeakButton text={expected} />
        </p>
        {word?.ipa && <p className="text-sm text-white/55">{word.ipa}</p>}
        {word?.example && (
          <p className="mt-2 flex items-start justify-center gap-1 text-sm text-white/70 italic">
            <span>{word.example}</span>
            <SpeakButton text={word.example} />
          </p>
        )}
        {word?.note && <p className="mt-2 text-sm text-white/60">💡 {word.note}</p>}
      </div>
      <button onClick={() => onGrade(GRADE[result])} className="btn-primary w-full">
        Далі
      </button>
    </div>
  )
}
