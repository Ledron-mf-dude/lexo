import { useMemo, useState } from 'react'
import ImportDialog from '../components/ImportDialog'
import WordForm from '../components/WordForm'
import { useAuth } from '../lib/auth'
import { useDeleteWord, useSaveWord, useTags, useWords, type WordInput, type WordWithTags } from '../lib/queries'

export default function Words() {
  const { session } = useAuth()
  const words = useWords()
  const tags = useTags()
  const save = useSaveWord(session!.user.id)
  const remove = useDeleteWord()

  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [editing, setEditing] = useState<WordInput | 'new' | null>(null)
  const [importing, setImporting] = useState(false)

  const tagNameById = useMemo(() => new Map((tags.data ?? []).map((t) => [t.id, t.name])), [tags.data])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (words.data ?? []).filter(
      (w) =>
        (activeTags.length === 0 || w.tagIds.some((id) => activeTags.includes(id))) &&
        (q === '' || w.term.toLowerCase().includes(q) || w.translation.toLowerCase().includes(q)),
    )
  }, [words.data, query, activeTags])

  function toggleTag(id: string) {
    setActiveTags((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]))
  }

  function startEdit(w: WordWithTags) {
    setEditing({
      id: w.id,
      term: w.term,
      translation: w.translation,
      definition: w.definition ?? '',
      example: w.example ?? '',
      tagNames: w.tagIds.map((id) => tagNameById.get(id)).filter((n): n is string => Boolean(n)),
    })
  }

  function onSubmit(input: WordInput) {
    save.mutate(input, { onSuccess: () => setEditing(null) })
  }

  function onDelete(w: WordWithTags) {
    if (window.confirm(`Видалити слово «${w.term}»?`)) remove.mutate(w.id)
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-light tracking-tight">
          Слова <span className="text-lg text-white/40">{words.data?.length ?? ''}</span>
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setImporting(true)} className="btn-ghost">
            Імпорт
          </button>
          <button
            onClick={() => {
              save.reset()
              setEditing('new')
            }}
            className="btn-primary"
          >
            + Додати
          </button>
        </div>
      </div>

      <input
        placeholder="Пошук за словом або перекладом"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="field"
      />

      {(tags.data?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.data!.map((t) => (
            <button
              key={t.id}
              onClick={() => toggleTag(t.id)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                activeTags.includes(t.id)
                  ? 'border-accent bg-accent/20 text-accent'
                  : 'border-white/12 text-white/60 hover:text-white'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {words.isLoading && <p className="text-white/50">Завантаження…</p>}
      {words.error && <p className="text-bad">{(words.error as Error).message}</p>}
      {words.data && visible.length === 0 && (
        <div className="glass rounded-3xl p-8 text-center text-white/50">
          {words.data.length === 0 ? 'Слів ще немає. Додайте перше!' : 'Нічого не знайдено.'}
        </div>
      )}

      <ul className="space-y-2">
        {visible.map((w) => (
          <li key={w.id} className="glass flex items-start justify-between gap-3 rounded-2xl p-4">
            <div className="min-w-0">
              <p className="font-medium">
                {w.term} <span className="font-light text-white/60">— {w.translation}</span>
              </p>
              {w.definition && <p className="mt-0.5 text-sm text-white/40">{w.definition}</p>}
              {w.tagIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {w.tagIds.map((id) => (
                    <span key={id} className="rounded-full bg-white/8 px-2 py-0.5 text-xs text-white/60">
                      {tagNameById.get(id)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-1 text-sm">
              <button onClick={() => startEdit(w)} className="rounded-lg px-2 py-1 text-white/50 hover:text-white">
                Змінити
              </button>
              <button onClick={() => onDelete(w)} className="rounded-lg px-2 py-1 text-white/50 hover:text-bad">
                Видалити
              </button>
            </div>
          </li>
        ))}
      </ul>

      {importing && <ImportDialog userId={session!.user.id} onClose={() => setImporting(false)} />}

      {editing && (
        <WordForm
          initial={editing === 'new' ? undefined : editing}
          suggestions={(tags.data ?? []).map((t) => t.name)}
          saving={save.isPending}
          error={save.error ? (save.error as Error).message : null}
          onSubmit={onSubmit}
          onCancel={() => setEditing(null)}
        />
      )}
    </section>
  )
}
