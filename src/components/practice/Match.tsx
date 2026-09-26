import { useEffect, useState } from 'react'
import type { WordWithTags } from '../../lib/queries'
import type { Card } from '../../lib/session'
import { speak, useAutoSpeak } from '../../lib/speech'

const NO_WORDS: WordWithTags[] = []

interface Props {
  card: Card
  /** Mistakes per word id (a word never tapped wrongly is absent). */
  onDone: (mistakes: Record<string, number>) => void
}

function shuffled<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** "Match the pairs": words on the left, translations (or explanations) on the right; tap one of each. */
export default function Match({ card, onDone }: Props) {
  const group = card.group ?? NO_WORDS
  const byDefinition = card.pairs === 'definition'
  const textOf = (w: WordWithTags) => (byDefinition ? (w.definition ?? w.translation) : w.translation)
  const autoSpeak = useAutoSpeak()

  const [right] = useState(() => shuffled(group))
  const [left] = useState(() => shuffled(group))
  const [doneLeft, setDoneLeft] = useState<Set<string>>(() => new Set())
  const [doneRight, setDoneRight] = useState<Set<string>>(() => new Set())
  const [pickL, setPickL] = useState<string | null>(null)
  const [pickR, setPickR] = useState<string | null>(null)
  const [wrong, setWrong] = useState<{ l: string; r: string } | null>(null)
  const [mistakes, setMistakes] = useState<Record<string, number>>({})

  const byId = new Map(group.map((w) => [w.id, w]))
  const finished = doneLeft.size === group.length

  function check(l: string, r: string) {
    // Two words with the same translation are interchangeable.
    if (l === r || textOf(byId.get(l)!) === textOf(byId.get(r)!)) {
      setDoneLeft((s) => new Set(s).add(l))
      setDoneRight((s) => new Set(s).add(r))
      setPickL(null)
      setPickR(null)
    } else {
      setMistakes((m) => ({ ...m, [l]: (m[l] ?? 0) + 1 }))
      setWrong({ l, r })
      if (navigator.vibrate) navigator.vibrate(60)
      setTimeout(() => {
        setWrong(null)
        setPickL(null)
        setPickR(null)
      }, 550)
    }
  }

  function tapLeft(id: string) {
    if (wrong || doneLeft.has(id)) return
    setPickL(id)
    if (autoSpeak) speak(byId.get(id)!.term)
    if (pickR !== null) check(id, pickR)
  }

  function tapRight(id: string) {
    if (wrong || doneRight.has(id)) return
    setPickR(id)
    if (pickL !== null) check(pickL, id)
  }

  useEffect(() => {
    if (!finished) return
    const t = setTimeout(() => onDone(mistakes), 700)
    return () => clearTimeout(t)
  }, [finished, mistakes, onDone])

  const style = (picked: boolean, done: boolean, isWrong: boolean) =>
    done
      ? 'border-good/50 bg-good/10 text-good/70'
      : isWrong
        ? 'border-bad/60 bg-bad/15 text-bad'
        : picked
          ? 'border-accent bg-accent/15 text-accent'
          : 'hover:bg-white/15'

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-xs tracking-widest text-white/35 uppercase">Знайдіть пари</p>
        <p className="mt-1 text-sm text-white/45">Торкніться слова, а потім {byDefinition ? 'його пояснення' : 'його перекладу'}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid content-start gap-2">
          {left.map((w) => (
            <button
              key={w.id}
              onClick={() => tapLeft(w.id)}
              disabled={doneLeft.has(w.id)}
              className={`glass min-h-14 rounded-2xl px-3 py-2 text-left font-medium break-words transition-colors ${style(pickL === w.id, doneLeft.has(w.id), wrong?.l === w.id)}`}
            >
              {w.term}
            </button>
          ))}
        </div>
        <div className="grid content-start gap-2">
          {right.map((w) => (
            <button
              key={w.id}
              onClick={() => tapRight(w.id)}
              disabled={doneRight.has(w.id)}
              className={`glass min-h-14 rounded-2xl px-3 py-2 text-left text-sm break-words transition-colors ${style(pickR === w.id, doneRight.has(w.id), wrong?.r === w.id)}`}
            >
              {textOf(w)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
