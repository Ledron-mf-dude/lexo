import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import ImportDialog from '../components/ImportDialog'
import WordForm from '../components/WordForm'
import SpeakButton from '../components/SpeakButton'
import { useAuth } from '../lib/authContext'
import { useDeleteWord, useProgress, useSaveWord, useTags, useWords, type WordInput, type WordWithTags } from '../lib/queries'
import { HARD_ERRORS } from '../lib/session'
import { useTitle } from '../lib/useTitle'
import type { Progress } from '../types'

type Status = 'new' | 'due' | 'hard' | 'learning' | 'known'

const STATUS: Record<Status, { label: string; className: string }> = {
  new: { label: 'нове', className: 'bg-white/8 text-white/50' },
  due: { label: 'до повторення', className: 'bg-accent/15 text-accent' },
  hard: { label: 'складне', className: 'bg-bad/15 text-bad' },
  learning: { label: 'вчиться', className: 'bg-white/8 text-white/50' },
  known: { label: 'вивчене', className: 'bg-good/15 text-good' },
}

const FILTERS: { value: Status | null; label: string }[] = [
  { value: null, label: 'Усі' },
  { value: 'new', label: 'Нові' },
  { value: 'due', label: 'До повторення' },
  { value: 'hard', label: 'Складні' },
  { value: 'known', label: 'Вивчені' },
]

/** "Known" is the same threshold as a mature card in statistics: an interval of three weeks or more. */
function statusOf(p: Progress | undefined, now: number): Status {
  if (!p || p.last_reviewed === null) return 'new'
  if (p.error_count >= HARD_ERRORS) return 'hard'
  if (new Date(p.due_at).getTime() <= now) return 'due'
  return p.interval_days >= 21 ? 'known' : 'learning'
}

/** Status of every word as of now (recomputed when the words or the progress change). */
function statuses(words: WordWithTags[], progress: Progress[]): Map<string, Status> {
  const now = Date.now()
  const byWord = new Map(progress.map((p) => [p.word_id, p]))
  return new Map(words.map((w) => [w.id, statusOf(byWord.get(w.id), now)]))
}

// Rendering 1000+ glass cards at once is slow on a phone: the list grows by a page at a time.
const PAGE = 60

export default function Words() {
  useTitle('Слова')
  const { session } = useAuth()
  const words = useWords()
  const tags = useTags()
  const progress = useProgress()
  const save = useSaveWord(session!.user.id)
  const remove = useDeleteWord()

  const [query, setQuery] = useState('')
  // The Tags page can open this list already filtered (router state).
  const startTag = (useLocation().state as { tagId?: string } | null)?.tagId
  const [activeTags, setActiveTags] = useState<string[]>(startTag ? [startTag] : [])
  const [status, setStatus] = useState<Status | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState<WordInput | 'new' | null>(null)
  const [importing, setImporting] = useState(false)

  const tagById = useMemo(() => new Map((tags.data ?? []).map((t) => [t.id, t])), [tags.data])
  const statusById = useMemo(() => statuses(words.data ?? [], progress.data ?? []), [words.data, progress.data])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (words.data ?? []).filter(
      (w) =>
        (activeTags.length === 0 || w.tagIds.some((id) => activeTags.includes(id))) &&
        (status === null || statusById.get(w.id) === status) &&
        (q === '' || w.term.toLowerCase().includes(q) || w.translation.toLowerCase().includes(q)),
    )
  }, [words.data, query, activeTags, status, statusById])
  const filtered = query.trim() !== '' || activeTags.length > 0 || status !== null

  // Any new filter starts from the first page again.
  function filter(apply: () => void) {
    apply()
    setLimit(PAGE)
  }

  function toggleTag(id: string) {
    filter(() => setActiveTags((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id])))
  }

  function startEdit(w: WordWithTags) {
    setEditing({
      id: w.id,
      term: w.term,
      translation: w.translation,
      definition: w.definition ?? '',
      example: w.example ?? '',
      tagNames: w.tagIds.map((id) => tagById.get(id)?.name).filter((n): n is string => Boolean(n)),
    })
  }

  function onSubmit(input: WordInput) {
    save.mutate(input, { onSuccess: () => setEditing(null) })
  }

  function onDelete(w: WordWithTags) {
    if (window.confirm(`Видалити слово «${w.term}»? Прогрес вивчення цього слова теж зникне.`)) remove.mutate(w.id)
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-light tracking-tight sm:text-3xl">
          Слова <span className="text-lg text-white/40">{words.data?.length ?? ''}</span>
        </h1>
        <div className="flex gap-2 text-sm sm:text-base">
          <button onClick={() => setImporting(true)} className="btn-ghost px-3 sm:px-[1.1rem]">
            Імпорт
          </button>
          <button
            onClick={() => {
              save.reset()
              setEditing('new')
            }}
            className="btn-primary px-3 whitespace-nowrap sm:px-[1.1rem]"
          >
            + Додати
          </button>
        </div>
      </div>

      <input
        type="search"
        enterKeyHint="search"
        placeholder="Пошук за словом або перекладом"
        value={query}
        onChange={(e) => filter(() => setQuery(e.target.value))}
        className="field"
      />

      <div className="chip-row">
        {FILTERS.map((f) => (
          <button key={f.label} onClick={() => filter(() => setStatus(f.value))} data-on={status === f.value} className="chip">
            {f.label}
          </button>
        ))}
      </div>

      {(tags.data?.length ?? 0) > 0 && (
        <div className="chip-row">
          {tags.data!.map((t) => (
            <button key={t.id} onClick={() => toggleTag(t.id)} data-on={activeTags.includes(t.id)} className="chip">
              {t.color && <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: t.color }} aria-hidden />}
              {t.name}
            </button>
          ))}
        </div>
      )}

      {words.data && filtered && visible.length > 0 && (
        <p className="text-sm text-white/45">
          Знайдено {visible.length} з {words.data.length}
          <button
            onClick={() =>
              filter(() => {
                setQuery('')
                setActiveTags([])
                setStatus(null)
              })
            }
            className="ml-3 text-accent hover:underline"
          >
            скинути
          </button>
        </p>
      )}

      {words.isLoading && <p className="animate-pulse text-white/50">Завантаження…</p>}
      {words.error && <p className="text-bad">{(words.error as Error).message}</p>}
      {words.data && visible.length === 0 && (
        <div className="glass space-y-3 rounded-3xl p-8 text-center text-white/50">
          <p>{words.data.length === 0 ? 'Слів ще немає. Додайте перше або імпортуйте список з Anki.' : 'Нічого не знайдено.'}</p>
          {words.data.length === 0 && (
            <button onClick={() => setImporting(true)} className="btn-ghost">
              Імпортувати
            </button>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {visible.slice(0, limit).map((w) => {
          const st = STATUS[statusById.get(w.id) ?? 'new']
          return (
            <li key={w.id} className="glass flex items-start gap-2 rounded-2xl py-3 pr-2 pl-4">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="flex flex-wrap items-center gap-x-1 font-medium">
                  <span className="break-words">{w.term}</span>
                  <SpeakButton text={w.term} className="-my-1.5 size-8" />
                </p>
                <p className="font-light break-words text-white/65">{w.translation}</p>
                {w.definition && <p className="text-sm text-white/40">{w.definition}</p>}
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${st.className}`}>{st.label}</span>
                  {w.tagIds.map((id) => {
                    const tag = tagById.get(id)
                    return (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-xs text-white/60">
                        {tag?.color && <span className="size-1.5 rounded-full" style={{ background: tag.color }} aria-hidden />}
                        {tag?.name}
                      </span>
                    )
                  })}
                </div>
              </div>
              <div className="flex shrink-0 gap-0.5 text-sm">
                <button onClick={() => startEdit(w)} aria-label={`Змінити «${w.term}»`} title="Змінити" className="grid size-9 place-items-center rounded-lg text-white/45 hover:bg-white/8 hover:text-white">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
                    <path d="m13.5 6.5 4 4" />
                  </svg>
                </button>
                <button onClick={() => onDelete(w)} aria-label={`Видалити «${w.term}»`} title="Видалити" className="grid size-9 place-items-center rounded-lg text-white/45 hover:bg-bad/10 hover:text-bad">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                  </svg>
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {visible.length > limit && (
        <button onClick={() => setLimit((n) => n + PAGE * 2)} className="btn-ghost w-full">
          Показати ще · залишилось {visible.length - limit}
        </button>
      )}

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
