import { useMemo } from 'react'
import type { WordWithTags } from '../lib/queries'
import { dayKey } from '../lib/stats'
import SpeakButton from './SpeakButton'

/** One word from the user's own dictionary that stays the same for the whole day (chosen by the date). */
export default function WordOfDay({ words }: { words: WordWithTags[] }) {
  const word = useMemo(() => {
    const pool = words.filter((w) => w.example)
    if (pool.length === 0) return null
    const seed = [...dayKey(new Date())].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
    return pool[seed % pool.length]
  }, [words])

  if (!word) return null
  return (
    <div className="glass space-y-1 rounded-2xl p-4">
      <p className="text-xs tracking-widest text-white/35 uppercase">Слово дня</p>
      <p className="flex items-center gap-1 text-2xl font-light tracking-tight break-words">
        {word.term}
        <SpeakButton text={word.term} />
      </p>
      <p className="text-accent">{word.translation}</p>
      <p className="flex items-start gap-1 text-sm text-white/45 italic">
        <span className="min-w-0">{word.example}</span>
        <SpeakButton text={word.example!} className="-mt-1.5 size-8" />
      </p>
    </div>
  )
}
