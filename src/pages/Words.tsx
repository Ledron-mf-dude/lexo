import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import AddFromTextDialog from '../components/AddFromTextDialog'
import FillDetailsCard from '../components/FillDetailsCard'
import PronunciationCard from '../components/PronunciationCard'
import ImportDialog from '../components/ImportDialog'
import WordForm from '../components/WordForm'
import SelectMenu from '../components/SelectMenu'
import SpeakButton from '../components/SpeakButton'
import { posLabel } from '../lib/wiktionary'
import { levelOf, NO_LEVEL, useWordLevels, WORD_LEVELS, type LevelFilter } from '../lib/wordLevels'
import TagPicker from '../components/TagPicker'
import { useAuth } from '../lib/authContext'
import { useDeleteWord, useProgress, useSaveWord, useTags, useWords, type WordInput, type WordWithTags } from '../lib/queries'
import { HARD_ERRORS } from '../lib/session'
import { useTitle } from '../lib/useTitle'
import type { Progress } from '../types'

type Status = 'new' | 'due' | 'hard' | 'learning' | 'known'

const STATUS: Record<Status, { label: string; dot: string; text: string }> = {
  new: { label: 'нове', dot: 'border border-white/30', text: 'text-white/45' },
  due: { label: 'до повторення', dot: 'bg-accent', text: 'text-accent' },
  hard: { label: 'складне', dot: 'bg-bad', text: 'text-bad' },
  learning: { label: 'вчиться', dot: 'bg-white/40', text: 'text-white/55' },
  known: { label: 'вивчене', dot: 'bg-good', text: 'text-good' },
}

const FILTERS: { value: Status | null; label: string }[] = [
  { value: null, label: 'Усі' },
  { value: 'new', label: 'Нові' },
  { value: 'due', label: 'До повторення' },
  { value: 'learning', label: 'Вчаться' },
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
const PAGE = 100

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
  const [level, setLevel] = useState<LevelFilter | null>(null)
  const levels = useWordLevels()
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState<WordInput | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [fromText, setFromText] = useState(false)
  const [open, setOpen] = useState<string | null>(null) // word shown with details

  const tagById = useMemo(() => new Map((tags.data ?? []).map((t) => [t.id, t])), [tags.data])
  const statusById = useMemo(() => statuses(words.data ?? [], progress.data ?? []), [words.data, progress.data])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (words.data ?? []).filter(
      (w) =>
        (activeTags.length === 0 || w.tagIds.some((id) => activeTags.includes(id))) &&
        (status === null || statusById.get(w.id) === status) &&
        (level === null || (levelOf(w.term, levels) ?? NO_LEVEL) === level) &&
        (q === '' || w.term.toLowerCase().includes(q) || w.translation.toLowerCase().includes(q)),
    )
  }, [words.data, query, activeTags, status, statusById, level, levels])
  const filtered = query.trim() !== '' || activeTags.length > 0 || status !== null || level !== null
  const levelCounts = useMemo(() => {
    const map = new Map<LevelFilter, number>()
    for (const w of words.data ?? []) {
      const l = levelOf(w.term, levels) ?? NO_LEVEL
      map.set(l, (map.get(l) ?? 0) + 1)
    }
    return map
  }, [words.data, levels])
  const statusCounts = useMemo(() => {
    const map = new Map<Status, number>()
    for (const st of statusById.values()) map.set(st, (map.get(st) ?? 0) + 1)
    return map
  }, [statusById])
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const w of words.data ?? []) for (const id of w.tagIds) map.set(id, (map.get(id) ?? 0) + 1)
    return map
  }, [words.data])

  // Any new filter starts from the first page again.
  function filter(apply: () => void) {
    apply()
    setLimit(PAGE)
  }

  function startEdit(w: WordWithTags) {
    setEditing({
      id: w.id,
      term: w.term,
      translation: w.translation,
      definition: w.definition ?? '',
      example: w.example ?? '',
      ipa: w.ipa ?? '',
      pos: w.pos ?? '',
      ...('note' in w && { note: w.note ?? '' }),
      audio_url: w.audio_url ?? '',
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
          <button onClick={() => setFromText(true)} className="btn-ghost px-3 whitespace-nowrap sm:px-[1.1rem]">
            З тексту
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

      <div className="flex flex-wrap items-center gap-2">
        <SelectMenu
          label="Статус"
          value={status}
          width="sm:w-64"
          options={FILTERS.map((f) => ({ ...f, count: f.value === null ? words.data?.length : (statusCounts.get(f.value) ?? 0) }))}
          onChange={(v) => filter(() => setStatus(v))}
        />
        {levels && (
          <SelectMenu<LevelFilter>
            label="Рівень"
            value={level}
            width="sm:w-56"
            options={[
              { value: null, label: 'Усі', count: words.data?.length },
              ...WORD_LEVELS.map((l) => ({ value: l, label: l, count: levelCounts.get(l) ?? 0 })),
              { value: NO_LEVEL, label: 'Без рівня', count: levelCounts.get(NO_LEVEL) ?? 0 },
            ]}
            onChange={(v) => filter(() => setLevel(v))}
          />
        )}
        {(tags.data?.length ?? 0) > 0 && <TagPicker tags={tags.data!} selected={activeTags} counts={tagCounts} onChange={(ids) => filter(() => setActiveTags(ids))} />}
        {words.data && filtered && (
          <span className="ml-auto text-sm text-white/45">
            {visible.length} з {words.data.length}
            <button
              onClick={() =>
                filter(() => {
                  setQuery('')
                  setActiveTags([])
                  setStatus(null)
                  setLevel(null)
                })
              }
              className="ml-2 text-accent hover:underline"
            >
              скинути
            </button>
          </span>
        )}
      </div>

      {words.data && !filtered && <FillDetailsCard words={words.data} />}
      {words.data && !filtered && <PronunciationCard words={words.data} />}

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

      {visible.length > 0 && (
        <ul className="glass divide-y divide-white/6 overflow-hidden rounded-2xl">
          {visible.slice(0, limit).map((w) => {
            const st = STATUS[statusById.get(w.id) ?? 'new']
            const expanded = open === w.id
            return (
              <li key={w.id} className={expanded ? 'bg-white/4' : ''}>
                <div className="flex items-center gap-1 py-1 pr-1.5 pl-3">
                  <button
                    onClick={() => setOpen(expanded ? null : w.id)}
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 flex-col py-1.5 text-left sm:flex-row sm:items-baseline sm:gap-3"
                  >
                    <span className="max-w-full truncate font-medium sm:max-w-[45%] sm:shrink-0">{w.term}</span>
                    <span className="min-w-0 truncate text-sm font-light text-white/55 sm:text-base">{w.translation}</span>
                  </button>
                  {levelOf(w.term, levels) && (
                    <span title="Рівень CEFR (оцінка)" className="w-6 shrink-0 text-center text-[10px] text-white/35 tabular-nums">
                      {levelOf(w.term, levels)}
                    </span>
                  )}
                  <span title={st.label} className={`size-2 shrink-0 rounded-full ${st.dot}`} aria-label={st.label} />
                  <SpeakButton text={w.term} className="size-8 shrink-0" />
                </div>
                {expanded && (
                  <div className="space-y-2 px-3 pb-3 text-sm">
                    {(w.ipa || w.pos) && (
                      <p className="flex flex-wrap gap-x-2 text-white/45">
                        {w.ipa && <span className="font-mono text-white/65">{w.ipa}</span>}
                        {w.pos && <span>{posLabel(w.pos)}</span>}
                      </p>
                    )}
                    {w.definition && <p className="text-white/55">{w.definition}</p>}
                    {w.example && <p className="text-white/45 italic">{w.example}</p>}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-xs ${st.text}`}>{st.label}</span>
                      {w.tagIds.map((id) => {
                        const tag = tagById.get(id)
                        return (
                          <button
                            key={id}
                            onClick={() => filter(() => setActiveTags([id]))}
                            className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-xs text-white/60 hover:bg-white/12"
                          >
                            {tag?.color && <span className="size-1.5 rounded-full" style={{ background: tag.color }} aria-hidden />}
                            {tag?.name}
                          </button>
                        )
                      })}
                      <span className="ml-auto flex gap-1">
                        <button onClick={() => startEdit(w)} className="rounded-lg px-2.5 py-1 text-white/60 hover:bg-white/8 hover:text-white">
                          Змінити
                        </button>
                        <button onClick={() => onDelete(w)} className="rounded-lg px-2.5 py-1 text-white/60 hover:bg-bad/10 hover:text-bad">
                          Видалити
                        </button>
                      </span>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {visible.length > limit && (
        <button onClick={() => setLimit((n) => n + PAGE * 2)} className="btn-ghost w-full">
          Показати ще · залишилось {visible.length - limit}
        </button>
      )}

      {importing && <ImportDialog userId={session!.user.id} onClose={() => setImporting(false)} />}
      {fromText && <AddFromTextDialog userId={session!.user.id} words={words.data ?? []} onClose={() => setFromText(false)} />}

      {editing && (
        <WordForm
          initial={editing === 'new' ? undefined : editing}
          suggestions={(tags.data ?? []).map((t) => t.name)}
          saving={save.isPending}
          error={save.error ? (save.error as Error).message : null}
          onSubmit={onSubmit}
          canNote={!words.data?.length || 'note' in words.data[0]}
          onCancel={() => setEditing(null)}
        />
      )}
    </section>
  )
}
