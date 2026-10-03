import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { count, WORD_GEN } from '../lib/plural'
import { MIGRATION_0004, updateWords, type WordFill, type WordWithTags } from '../lib/queries'
import { isKnownMissing, lookupOnline } from '../lib/wiktionary'
import { loadWordDetails } from '../lib/wordDetails'

const WORKERS = 4 // parallel lookups: fast enough for ~1000 words in a few minutes, gentle on Wiktionary
const SAVE_BATCH = 20

// A word that has never been looked up has none of the three; one looked up and found gets at least a part of speech.
const needsLookup = (w: WordWithTags) => w.ipa == null && w.pos == null && w.audio_url == null && !isKnownMissing(w.term)

interface Run {
  done: number
  total: number
  found: number
  failed: number
}

/**
 * Bulk lookup on Wiktionary: transcription, part of speech and a recording for every word that has none,
 * plus a definition and an example for words the built-in dictionary does not know. Only empty fields are filled.
 */
export default function PronunciationCard({ words }: { words: WordWithTags[] }) {
  const qc = useQueryClient()
  const [run, setRun] = useState<Run | null>(null)
  const [state, setState] = useState<'idle' | 'running' | 'finished'>('idle')
  const [error, setError] = useState<string | null>(null)
  const stop = useRef(false)

  // Before migration 0004 the rows come without the ipa column at all.
  const migrated = words.length === 0 || 'ipa' in words[0]
  const todo = words.filter(needsLookup)

  if (state === 'finished' && run) {
    return (
      <p className="glass rounded-2xl p-4 text-sm text-good">
        Готово: транскрипцію й вимову додано до {count(run.found, WORD_GEN)}.
        {run.done - run.found - run.failed > 0 && <span className="text-white/60"> У Wiktionary не знайшлося {count(run.done - run.found - run.failed, WORD_GEN)}.</span>}
        {run.failed > 0 && <span className="text-white/60"> Не вдалося перевірити {count(run.failed, WORD_GEN)} (мережа), спробуйте пізніше.</span>}
      </p>
    )
  }
  if (state === 'idle' && todo.length === 0) return null

  async function start() {
    stop.current = false
    setError(null)
    setState('running')
    const dict = await loadWordDetails().catch(() => ({}) as Record<string, unknown>)
    const queue = [...todo]
    const progress: Run = { done: 0, total: queue.length, found: 0, failed: 0 }
    setRun({ ...progress })
    let pending: WordFill[] = []

    async function flush() {
      const batch = pending
      pending = []
      if (batch.length > 0) await updateWords(batch)
    }

    async function worker() {
      while (queue.length > 0 && !stop.current) {
        const w = queue.shift()!
        const known = w.term.trim().toLowerCase() in dict
        const wantDetails = !known && (!w.definition?.trim() || !w.example?.trim())
        try {
          const entry = await lookupOnline(w.term, wantDetails)
          if (entry) {
            const fill: WordFill = { id: w.id }
            if (entry.ipa) fill.ipa = entry.ipa
            if (entry.pos) fill.pos = entry.pos
            if (entry.audio) fill.audio_url = entry.audio
            if (!w.definition?.trim() && entry.definition) fill.definition = entry.definition
            if (!w.example?.trim() && entry.example) fill.example = entry.example
            if (Object.keys(fill).length > 1) {
              pending.push(fill)
              progress.found++
            }
          }
        } catch {
          progress.failed++
        }
        progress.done++
        setRun({ ...progress })
        if (pending.length >= SAVE_BATCH) await flush()
      }
    }

    try {
      await Promise.all(Array.from({ length: WORKERS }, worker))
      await flush()
      setState(stop.current ? 'idle' : 'finished')
    } catch (e) {
      stop.current = true
      setError((e as Error).message)
      setState('idle')
    }
    qc.invalidateQueries({ queryKey: ['words'] })
  }

  return (
    <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium">Транскрипція і вимова</p>
        <p className="text-sm text-white/60">
          {migrated
            ? `Для ${count(todo.length, WORD_GEN)} ще немає транскрипції. Візьмемо її з Wiktionary разом із записом вимови живим голосом і частиною мови; словам, яких немає у вбудованому словнику, додамо й пояснення з прикладом. Заповнюються тільки порожні поля.`
            : MIGRATION_0004}
        </p>
        {state === 'running' && run && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-accent transition-all" style={{ width: `${(run.done / Math.max(1, run.total)) * 100}%` }} />
          </div>
        )}
        {error && <p className="mt-1 text-sm text-bad">{error}</p>}
        <p className="mt-1 text-xs text-white/50">
          Дані:{' '}
          <a href="https://en.wiktionary.org" target="_blank" rel="noreferrer" className="hover:text-white/60">
            Wiktionary
          </a>{' '}
          (CC BY-SA), записи — Wikimedia Commons.
        </p>
      </div>
      {migrated &&
        (state === 'running' ? (
          <button onClick={() => (stop.current = true)} className="btn-ghost w-full sm:w-auto">
            Зупинити · {run ? `${run.done} / ${run.total}` : '…'}
          </button>
        ) : (
          <button onClick={start} className="btn-primary w-full sm:w-auto">
            Додати з Wiktionary
          </button>
        ))}
    </div>
  )
}
