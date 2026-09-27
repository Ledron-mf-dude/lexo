import { useEffect, useState, type FormEvent } from 'react'
import type { WordInput } from '../lib/queries'
import { BUILT_IN, loadTopicDictionary, suggestTags, type TopicDictionary } from '../lib/tagTaxonomy'
import TagInput from './TagInput'

interface Props {
  initial?: WordInput
  suggestions: string[]
  saving: boolean
  error: string | null
  onSubmit: (input: WordInput) => void
  onCancel: () => void
}

const empty: WordInput = { term: '', translation: '', definition: '', example: '', tagNames: [] }

export default function WordForm({ initial, suggestions, saving, error, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<WordInput>(initial ?? empty)
  const [dict, setDict] = useState<TopicDictionary | null>(null)

  useEffect(() => {
    loadTopicDictionary().then(setDict, () => {})
  }, [])

  // Tags that fit the word (known words from the topic dictionary, others by their shape), minus those already added.
  const suggested = form.term.trim() ? suggestTags(form.term, dict).filter((n) => !form.tagNames.includes(n)) : []
  const allNames = [...new Set([...suggestions, ...Object.values(BUILT_IN).map((t) => t.name)])]

  function set<K extends keyof WordInput>(key: K, value: WordInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit(form)
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
        <textarea
          rows={2}
          placeholder="Визначення / підказка (необов'язково)"
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
