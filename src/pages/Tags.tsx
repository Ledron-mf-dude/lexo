import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { TAG_COLORS, useTagActions, useTags, useWords } from '../lib/queries'
import type { Tag } from '../types'

type Sort = 'name' | 'count'

export default function Tags() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const tags = useTags()
  const words = useWords()
  const actions = useTagActions(session!.user.id)

  const [newName, setNewName] = useState('')
  const [sort, setSort] = useState<Sort>('name')
  const [editing, setEditing] = useState<string | null>(null) // tag id being renamed
  const [draft, setDraft] = useState('')
  const [merging, setMerging] = useState<Tag | null>(null)
  const [error, setError] = useState<string | null>(null)

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const w of words.data ?? []) for (const id of w.tagIds) map.set(id, (map.get(id) ?? 0) + 1)
    return map
  }, [words.data])

  const rows = useMemo(() => {
    const list = [...(tags.data ?? [])]
    return sort === 'name' ? list : list.sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'uk'))
  }, [tags.data, counts, sort])

  const unused = rows.filter((t) => (counts.get(t.id) ?? 0) === 0)

  // Every action reports failures (e.g. a name that already exists) in one place.
  const run = (p: Promise<unknown>, after?: () => void) =>
    p.then(() => {
      setError(null)
      after?.()
    }, (e: Error) => setError(e.message.includes('duplicate') ? 'Тег із такою назвою вже існує.' : e.message))

  function add(e: FormEvent) {
    e.preventDefault()
    if (newName.trim()) run(actions.create.mutateAsync(newName), () => setNewName(''))
  }

  function saveRename(tag: Tag) {
    if (draft.trim() && draft.trim() !== tag.name) run(actions.rename.mutateAsync({ id: tag.id, name: draft }), () => setEditing(null))
    else setEditing(null)
  }

  function remove(tag: Tag) {
    const n = counts.get(tag.id) ?? 0
    const text = n > 0 ? `Видалити тег «${tag.name}»? Він зникне зі ${n} слів; самі слова залишаться.` : `Видалити тег «${tag.name}»?`
    if (window.confirm(text)) run(actions.remove.mutateAsync([tag.id]))
  }

  function removeUnused() {
    if (window.confirm(`Видалити ${unused.length} тегів, до яких не прив'язано жодного слова?`)) run(actions.remove.mutateAsync(unused.map((t) => t.id)))
  }

  function practice(tag: Tag) {
    const ids = (words.data ?? []).filter((w) => w.tagIds.includes(tag.id)).map((w) => w.id)
    navigate('/practice', { state: { wordIds: ids, title: `Тег ${tag.name}` } })
  }

  if (tags.isLoading || words.isLoading) return <p className="text-white/50">Завантаження…</p>
  const loadError = (tags.error ?? words.error) as Error | null
  if (loadError) return <p className="text-bad">{loadError.message}</p>

  return (
    <section className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-light tracking-tight sm:text-3xl">
          Теги <span className="text-lg text-white/40">{rows.length}</span>
        </h1>
        <div className="flex gap-1 text-sm">
          {(['name', 'count'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`rounded-full border px-3 py-1 transition-colors ${sort === s ? 'border-accent bg-accent/20 text-accent' : 'border-white/12 text-white/60 hover:text-white'}`}
            >
              {s === 'name' ? 'За назвою' : 'За кількістю'}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={add} className="flex gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Новий тег" className="field" />
        <button disabled={!newName.trim()} className="btn-primary shrink-0">
          Додати
        </button>
      </form>

      {error && <p className="text-sm text-bad">{error}</p>}

      {unused.length > 0 && (
        <p className="text-sm text-white/45">
          Без слів: {unused.length}.{' '}
          <button onClick={removeUnused} className="text-accent hover:underline">
            видалити всі
          </button>
        </p>
      )}

      {rows.length === 0 && <p className="glass rounded-3xl p-8 text-center text-white/50">Тегів ще немає. Створіть перший або додайте теги до слів.</p>}

      <ul className="space-y-2">
        {rows.map((tag) => {
          const n = counts.get(tag.id) ?? 0
          return (
            <li key={tag.id} className="glass space-y-3 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <span className="size-3 shrink-0 rounded-full" style={{ background: tag.color ?? '#94a3b8' }} aria-hidden />
                {editing === tag.id ? (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      saveRename(tag)
                    }}
                  >
                    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} className="field py-1.5" />
                    <button className="btn-primary py-1.5">Зберегти</button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-medium">{tag.name}</span>
                    <span className="shrink-0 text-sm text-white/45 tabular-nums">{n} слів</span>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="flex gap-2 sm:gap-1.5" role="group" aria-label="Колір тегу">
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      aria-label={`Колір ${c}`}
                      aria-pressed={tag.color === c}
                      onClick={() => run(actions.recolor.mutateAsync({ id: tag.id, color: c }))}
                      className={`size-7 rounded-full border-2 transition-transform hover:scale-110 sm:size-5 ${tag.color === c ? 'border-white' : 'border-transparent'}`}
                      style={{ background: c }}
                    />
                  ))}
                </span>
                <span className="ml-auto flex flex-wrap gap-x-1 gap-y-0.5 text-white/55 *:rounded-lg *:px-2 *:py-1.5">
                  {n > 0 && (
                    <button onClick={() => practice(tag)} className="text-accent hover:underline">
                      Практикувати
                    </button>
                  )}
                  {n > 0 && (
                    <button onClick={() => navigate('/words', { state: { tagId: tag.id } })} className="hover:text-white">
                      Слова
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditing(tag.id)
                      setDraft(tag.name)
                    }}
                    className="hover:text-white"
                  >
                    Перейменувати
                  </button>
                  {rows.length > 1 && (
                    <button onClick={() => setMerging(tag)} className="hover:text-white">
                      Об'єднати
                    </button>
                  )}
                  <button onClick={() => remove(tag)} className="hover:text-bad">
                    Видалити
                  </button>
                </span>
              </div>
            </li>
          )
        })}
      </ul>

      {merging && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setMerging(null)}>
          <div onClick={(e) => e.stopPropagation()} className="glass w-full max-w-sm space-y-4 rounded-3xl bg-[#14161d]/80 p-6">
            <h2 className="text-xl font-light">Об'єднати «{merging.name}»</h2>
            <p className="text-sm text-white/50">Усі слова цього тегу отримають вибраний тег, а «{merging.name}» буде видалено.</p>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {rows
                .filter((t) => t.id !== merging.id)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => run(actions.merge.mutateAsync({ from: merging.id, into: t.id }), () => setMerging(null))}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/10"
                  >
                    <span className="size-3 rounded-full" style={{ background: t.color ?? '#94a3b8' }} aria-hidden />
                    <span className="flex-1 truncate">{t.name}</span>
                    <span className="text-sm text-white/40">{counts.get(t.id) ?? 0}</span>
                  </button>
                ))}
            </div>
            <button onClick={() => setMerging(null)} className="btn-ghost w-full">
              Скасувати
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
