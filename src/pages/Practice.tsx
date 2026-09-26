import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Session from '../components/practice/Session'
import { useAuth } from '../lib/auth'
import { useProgress, useTags, useWords, type WordWithTags } from '../lib/queries'
import { NEW_PER_DAY, countSources, pickWords, type ModeChoice, type SessionConfig, type Source } from '../lib/session'
import type { Progress } from '../types'

const modes: { value: ModeChoice; label: string }[] = [
  { value: 'auto', label: 'Авто' },
  { value: 'flashcard', label: 'Слово → переклад' },
  { value: 'translation', label: 'Переклад → слово' },
  { value: 'choice', label: 'Вибір відповіді' },
  { value: 'typing', label: 'Введення слова' },
  { value: 'scramble', label: 'Складання з літер' },
  { value: 'gaps', label: 'Пропущені літери' },
]

const limits = [10, 20, 50, 100]

/** Passed by the grammar section: practise exactly these words. */
interface FromArticle {
  wordIds: string[]
  title: string
}

export default function Practice() {
  const { session } = useAuth()
  const fromArticle = (useLocation().state as FromArticle | null) ?? null
  const qc = useQueryClient()
  const words = useWords()
  const tags = useTags()
  const progress = useProgress()

  const [config, setConfig] = useState<SessionConfig>(() =>
    fromArticle
      ? { source: 'subset', subset: { ids: fromArticle.wordIds, title: fromArticle.title }, tagIds: [], limit: limits.find((n) => n >= fromArticle.wordIds.length) ?? 100, mode: 'auto' }
      : { source: 'today', tagIds: [], limit: 20, mode: 'auto' },
  )
  const [running, setRunning] = useState<WordWithTags[] | null>(null)

  const progressById = useMemo(() => new Map((progress.data ?? []).map((p): [string, Progress] => [p.word_id, p])), [progress.data])
  const counts = useMemo(
    () => countSources(words.data ?? [], progressById, config.tagIds),
    [words.data, progressById, config.tagIds],
  )

  const sources: { value: Source; title: string; hint: string; count: number }[] = [
    ...(config.subset
      ? [{ value: 'subset' as Source, title: `Зі статті: ${config.subset.title}`, hint: 'слова зі статті, що є у вашому словнику', count: config.subset.ids.length }]
      : []),
    { value: 'today', title: 'Сьогодні', hint: `до повторення ${counts.due} + нових до ${NEW_PER_DAY}`, count: counts.due + Math.min(counts.fresh, NEW_PER_DAY) },
    { value: 'new', title: 'Нові слова', hint: 'ще жодного разу не вчені', count: counts.fresh },
    { value: 'hard', title: 'Складні', hint: 'часті помилки', count: counts.hard },
    { value: 'all', title: 'Весь словник', hint: 'без огляду на розклад', count: counts.all },
  ]
  const available = sources.find((s) => s.value === config.source)?.count ?? 0

  if (words.isLoading || progress.isLoading) return <p className="text-white/50">Завантаження…</p>
  const error = (words.error ?? progress.error) as Error | null
  if (error) return <p className="text-bad">{error.message}</p>

  if (running) {
    return (
      <Session
        userId={session!.user.id}
        words={running}
        allWords={words.data ?? []}
        progress={progressById}
        mode={config.mode}
        onFinish={() => {
          setRunning(null)
          qc.invalidateQueries({ queryKey: ['progress'] })
        }}
      />
    )
  }

  function toggleTag(id: string) {
    setConfig((c) => ({ ...c, tagIds: c.tagIds.includes(id) ? c.tagIds.filter((t) => t !== id) : [...c.tagIds, id] }))
  }

  function start() {
    const picked = pickWords(words.data ?? [], progressById, config)
    if (picked.length > 0) setRunning(picked)
  }

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition-colors ${active ? 'border-accent bg-accent/20 text-accent' : 'border-white/12 text-white/60 hover:text-white'}`

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-light tracking-tight">Практика</h1>

      <div className="grid gap-2 sm:grid-cols-2">
        {sources.map((s) => (
          <button
            key={s.value}
            onClick={() => setConfig((c) => ({ ...c, source: s.value }))}
            className={`glass rounded-2xl p-4 text-left transition-colors ${config.source === s.value ? 'border-accent! bg-accent/10' : 'hover:bg-white/10'}`}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{s.title}</span>
              <span className="text-xl font-light text-accent">{s.count}</span>
            </div>
            <p className="text-sm text-white/40">{s.hint}</p>
          </button>
        ))}
      </div>

      {(tags.data?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-white/50">Теги {config.tagIds.length === 0 && '(усі)'}</p>
          <div className="flex flex-wrap gap-2">
            {tags.data!.map((t) => (
              <button key={t.id} onClick={() => toggleTag(t.id)} className={chip(config.tagIds.includes(t.id))}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm text-white/50">Режим</p>
        <div className="flex flex-wrap gap-2">
          {modes.map((m) => (
            <button key={m.value} onClick={() => setConfig((c) => ({ ...c, mode: m.value }))} className={chip(config.mode === m.value)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-white/50">Кількість слів</p>
        <div className="flex flex-wrap gap-2">
          {limits.map((n) => (
            <button key={n} onClick={() => setConfig((c) => ({ ...c, limit: n }))} className={chip(config.limit === n)}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <button onClick={start} disabled={available === 0} className="btn-primary w-full py-3 text-lg">
        {available === 0 ? 'Немає слів для цього вибору' : `Почати · ${Math.min(available, config.limit)}`}
      </button>
    </section>
  )
}
