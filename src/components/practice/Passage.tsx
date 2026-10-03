import { useState } from 'react'
import type { WordWithTags } from '../../lib/queries'
import type { Card } from '../../lib/session'
import { findInExample } from '../../lib/text'

interface Props {
  card: Card
  /** Mistakes per word id, as for matching: a misplaced word counts as not known. */
  onDone: (mistakes: Record<string, number>) => void
}

const NO_WORDS: WordWithTags[] = []

function shuffled<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * «Текст із пропусками»: the examples of several words with the words taken out, and a bank of those words
 * (in the form the sentence needs). Tap a word to put it into the selected gap; tap a filled gap to take it back.
 */
export default function Passage({ card, onDone }: Props) {
  const group = card.group ?? NO_WORDS
  const [items] = useState(() =>
    shuffled(group.flatMap((w) => {
      const blank = w.example ? findInExample(w.term, w.example) : null
      return blank ? [{ word: w, blank }] : []
    })),
  )
  const [bank] = useState(() => shuffled(items.map((i) => ({ id: i.word.id, text: i.blank.found }))))
  // gap index -> word id placed there
  const [placed, setPlaced] = useState<(string | null)[]>(() => items.map(() => null))
  const [active, setActive] = useState(0)
  const [checked, setChecked] = useState(false)

  const used = new Set(placed.filter(Boolean))
  const full = placed.every(Boolean)

  function put(id: string) {
    if (checked) return
    const target = placed[active] === null ? active : placed.indexOf(null)
    if (target < 0) return
    const next = placed.map((p, i) => (i === target ? id : p))
    setPlaced(next)
    const empty = next.indexOf(null)
    if (empty >= 0) setActive(empty)
  }

  function takeBack(i: number) {
    if (checked) return
    if (placed[i]) setPlaced(placed.map((p, j) => (j === i ? null : p)))
    setActive(i)
  }

  function finish() {
    const mistakes: Record<string, number> = {}
    items.forEach((it, i) => {
      if (!isRight(i)) mistakes[it.word.id] = 2
    })
    onDone(mistakes)
  }

  const textOf = (id: string | null) => bank.find((b) => b.id === id)?.text ?? ''
  // Two words with the same form in the bank are interchangeable: what counts is the text in the gap.
  const isRight = (i: number) => textOf(placed[i]).toLowerCase() === items[i].blank.found.toLowerCase()
  const gap = (i: number) => {
    const id = placed[i]
    const right = isRight(i)
    const style = checked
      ? right
        ? 'border-good/60 bg-good/15 text-good'
        : 'border-bad/60 bg-bad/15 text-bad'
      : id
        ? 'border-accent/60 bg-accent/15 text-accent'
        : i === active
          ? 'border-accent border-dashed'
          : 'border-white/25 border-dashed'
    return (
      <button type="button" onClick={() => takeBack(i)} className={`mx-0.5 inline-block min-w-16 rounded-lg border px-2 py-0.5 align-baseline transition-colors ${style}`}>
        {id ? textOf(id) : <span className="text-white/50">{i + 1}</span>}
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <div className="glass space-y-3 rounded-[2rem] p-5 sm:p-7">
        <p className="text-xs tracking-widest text-white/55 uppercase">Вставте слова в текст</p>
        <ol className="space-y-3 text-lg leading-9">
          {items.map((it, i) => (
            <li key={it.word.id} className="flex gap-2">
              <span className="w-5 shrink-0 text-sm leading-9 text-white/50">{i + 1}.</span>
              <span>
                {it.blank.before}
                {gap(i)}
                {it.blank.after}
                {checked && !isRight(i) && (
                  <span className="ml-2 text-sm text-good">
                    ✓ {it.blank.found} <span className="text-white/55">— {it.word.translation}</span>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {!checked && (
        <div className="flex flex-wrap justify-center gap-2">
          {bank.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={used.has(b.id)}
              onClick={() => put(b.id)}
              className="glass rounded-xl px-3 py-2 text-lg transition-opacity hover:bg-white/15 disabled:opacity-20"
            >
              {b.text}
            </button>
          ))}
        </div>
      )}

      {checked ? (
        <button onClick={finish} className="btn-primary w-full">
          Далі
        </button>
      ) : (
        <button onClick={() => setChecked(true)} disabled={!full} className="btn-primary w-full">
          Перевірити
        </button>
      )}
    </div>
  )
}
