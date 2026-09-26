import { useState, type FormEvent } from 'react'
import type { WordInput } from '../lib/queries'
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
        <TagInput value={form.tagNames} onChange={(tags) => set('tagNames', tags)} suggestions={suggestions} />
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
