import { useEffect, useState, type FormEvent } from 'react'
import type { WordInput } from '../lib/queries'
import { playRecording, speak } from '../lib/speech'
import { lookupOnline, posLabel, type OnlineEntry } from '../lib/wiktionary'
import { BUILT_IN, loadTopicDictionary, suggestTags, type TopicDictionary } from '../lib/tagTaxonomy'
import { fillFor, loadWordDetails, type DetailsDictionary } from '../lib/wordDetails'
import TagInput from './TagInput'

interface Props {
  /** The note field exists once migration 0005 is run. */
  canNote?: boolean
  initial?: WordInput
  suggestions: string[]
  saving: boolean
  error: string | null
  onSubmit: (input: WordInput) => void
  onCancel: () => void
}

const empty: WordInput = { term: '', translation: '', definition: '', example: '', tagNames: [] }

export default function WordForm({ canNote = false, initial, suggestions, saving, error, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<WordInput>(initial ?? empty)
  const [dict, setDict] = useState<TopicDictionary | null>(null)
  const [details, setDetails] = useState<DetailsDictionary | null>(null)

  // Wiktionary entry for the typed word: looked up a moment after typing stops, kept only while the term still matches.
  const [online, setOnline] = useState<{ term: string; entry: OnlineEntry | null } | null>(null)
  const term = form.term.trim()

  useEffect(() => {
    loadTopicDictionary().then(setDict, () => {})
    loadWordDetails().then(setDetails, () => {})
  }, [])

  useEffect(() => {
    if (term.length < 2 || !navigator.onLine) return
    let live = true
    const t = setTimeout(() => {
      lookupOnline(term).then(
        (entry) => live && setOnline({ term, entry }),
        () => {}, // offline or Wiktionary unavailable: the form works as before
      )
    }, 600)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [term])

  const entry = online?.term === term ? online.entry : null
  // A changed word keeps nothing of the old one's pronunciation.
  const sameWord = term === (initial?.term ?? '').trim()
  const ipa = (sameWord && form.ipa) || entry?.ipa || ''
  const pos = (sameWord && form.pos) || entry?.pos || ''
  const audio = (sameWord && form.audio_url) || entry?.audio || ''

  // Empty definition or example: the built-in dictionary (plain English) first, Wiktionary for the rest. Filled only on a tap.
  const local = details && term ? fillFor(form, details) : null
  const fill = {
    definition: local?.definition ?? (!form.definition.trim() ? (entry?.definition ?? undefined) : undefined),
    example: local?.example ?? (!form.example.trim() ? (entry?.example ?? undefined) : undefined),
  }
  const fromWiktionary = (!local?.definition && fill.definition) || (!local?.example && fill.example)

  // Tags that fit the word (known words from the topic dictionary, others by their shape), minus those already added.
  const suggested = form.term.trim() ? suggestTags(form.term, dict).filter((n) => !form.tagNames.includes(n)) : []
  const allNames = [...new Set([...suggestions, ...Object.values(BUILT_IN).map((t) => t.name)])]

  function set<K extends keyof WordInput>(key: K, value: WordInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // Transcription, part of speech and recording are not the user's writing: they are saved with the word without asking.
  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({ ...form, ipa, pos, audio_url: audio })
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCancel}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="glass max-h-full w-full max-w-lg space-y-3 overflow-y-auto rounded-3xl bg-[#14161d]/80 p-6"
      >
        <h2 className="text-xl font-light">{initial?.id ? 'Редагувати слово' : 'Нове слово'}</h2>
        <input
          required
          autoFocus
          placeholder="Слово"
          value={form.term}
          onChange={(e) => set('term', e.target.value)}
          className="field"
        />
        <input
          required
          placeholder="Переклад"
          value={form.translation}
          onChange={(e) => set('translation', e.target.value)}
          className="field"
        />
        {(ipa || pos || audio) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/55">
            {ipa && <span className="font-mono text-white/70">{ipa}</span>}
            {pos && <span className="text-white/40">{posLabel(pos)}</span>}
            <button
              type="button"
              onClick={() => (audio ? playRecording(audio, term) : speak(term))}
              className="rounded-full px-2 py-0.5 text-accent hover:bg-accent/10"
              aria-label={`Прослухати «${term}»`}
            >
              ▶ {audio ? 'запис вимови' : 'прослухати'}
            </button>
            {entry && (
              <a href={entry.page} target="_blank" rel="noreferrer" className="ml-auto text-xs text-white/30 hover:text-white/60">
                Wiktionary · CC BY-SA
              </a>
            )}
          </div>
        )}
        {(fill.definition || fill.example) && (
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, definition: fill.definition ?? f.definition, example: fill.example ?? f.example }))}
            className="text-left text-sm text-accent hover:underline"
          >
            ↳ Підставити {fill.definition && fill.example ? 'пояснення й приклад' : fill.definition ? 'пояснення' : 'приклад'}
            {fromWiktionary ? (local ? ' зі словника та Wiktionary' : ' з Wiktionary') : ' зі словника'}
          </button>
        )}
        <textarea
          rows={2}
          placeholder="Пояснення англійською простими словами (необов'язково)"
          value={form.definition}
          onChange={(e) => set('definition', e.target.value)}
          className="field"
        />
        <textarea
          rows={2}
          placeholder="Приклад речення (необов'язково)"
          value={form.example}
          onChange={(e) => set('example', e.target.value)}
          className="field"
        />
        {canNote && (
          <textarea
            rows={2}
            placeholder="Асоціація або підказка: як запам'ятати (необов'язково)"
            value={form.note ?? ''}
            onChange={(e) => set('note', e.target.value)}
            className="field"
          />
        )}
        <TagInput value={form.tagNames} onChange={(tags) => set('tagNames', tags)} suggestions={allNames} />
        {suggested.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-xs text-white/40">Підходять:</span>
            {suggested.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => set('tagNames', [...form.tagNames, name])}
                className="rounded-full border border-dashed border-accent/40 px-2.5 py-0.5 text-xs text-accent/90 hover:bg-accent/10"
              >
                + {name}
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="btn-ghost">
            Скасувати
          </button>
          <button disabled={saving} className="btn-primary">
            {saving ? 'Збереження…' : 'Зберегти'}
          </button>
        </div>
      </form>
    </div>
  )
}
