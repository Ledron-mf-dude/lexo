import { useEffect, useRef, useState } from 'react'
import { checkSpoken, startListening, type Listening, type SpokenResult } from '../../lib/recognition'
import type { Grade } from '../../lib/sm2'
import type { Card } from '../../lib/session'
import Verdict from './Verdict'

interface Props {
  card: Card
  onGrade: (grade: Grade) => void
  /** Leaves the word (or, with `all`, every speaking card of the session) without a grade. */
  onSkip: (all: boolean) => void
}

const MAX_TRIES = 3

/** Speaking: the translation is shown, the user says the English word; the browser recognises it. */
export default function Speak({ card, onGrade, onSkip }: Props) {
  const { word } = card
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [heard, setHeard] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const [result, setResult] = useState<SpokenResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const session = useRef<Listening | null>(null)

  // Leaving the card (answer, skip, exit) must not leave the microphone on.
  useEffect(() => () => session.current?.stop(), [])

  async function listen() {
    if (listening) {
      session.current?.stop()
      return
    }
    setError(null)
    setInterim('')
    setHeard(null)
    try {
      const s = startListening(setInterim)
      session.current = s
      setListening(true)
      const alternatives = await s.result
      setListening(false)
      if (alternatives.length === 0) {
        setError('Нічого не почуто. Натисніть мікрофон і скажіть слово.')
        return
      }
      setHeard(alternatives[0])
      const outcome = checkSpoken(alternatives, word.term)
      const attempt = tries + 1
      setTries(attempt)
      if (outcome !== 'wrong' || attempt >= MAX_TRIES) setResult(outcome)
    } catch (e) {
      setListening(false)
      setError((e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass grid min-h-56 place-items-center rounded-[2rem] p-8 text-center">
        <div className="space-y-3">
          <p className="text-xs tracking-widest text-white/35 uppercase">Скажіть англійською</p>
          <p className="text-3xl font-light tracking-tight break-words">{word.translation}</p>
          {word.definition && <p className="text-sm text-white/40">{word.definition}</p>}
        </div>
      </div>

      {result !== null ? (
        <>
          {heard && result !== 'exact' && <p className="text-center text-sm text-white/45">Почули: «{heard}»</p>}
          <Verdict result={result} expected={word.term} onGrade={onGrade} typoLabel="Майже — звучить трохи інакше" />
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={listen}
              aria-label={listening ? 'Зупинити запис' : 'Почати говорити'}
              className={`relative grid size-20 place-items-center rounded-full transition-colors ${listening ? 'bg-bad/25 text-bad' : 'bg-accent/20 text-accent hover:bg-accent/30'}`}
            >
              {listening && <span className="absolute inset-0 animate-ping rounded-full bg-bad/20" aria-hidden />}
              <svg viewBox="0 0 24 24" className="relative size-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
            <p className="min-h-6 text-center text-sm text-white/55">
              {listening ? interim || 'Слухаю…' : heard ? `Почули: «${heard}» — не те слово, спробуйте ще (${MAX_TRIES - tries})` : 'Натисніть і скажіть слово'}
            </p>
            {error && <p className="text-center text-sm text-bad">{error}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setResult('wrong')} className="btn-ghost">
              Показати слово
            </button>
            <button type="button" onClick={() => onSkip(false)} className="btn-ghost">
              Пропустити
            </button>
          </div>
          <button type="button" onClick={() => onSkip(true)} className="w-full text-center text-sm text-white/40 hover:text-white">
            Не можу говорити зараз — пропустити всі такі картки
          </button>
        </div>
      )}
    </div>
  )
}
