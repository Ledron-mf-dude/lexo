import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import DailyGoal from '../components/DailyGoal'
import Session from '../components/practice/Session'
import WordOfDay from '../components/WordOfDay'
import { useAuth } from '../lib/authContext'
import { useProgress, useTags, useWords, type WordWithTags } from '../lib/queries'
import { canSpeak } from '../lib/speech'
import { EXERCISES as ALL_EXERCISES, countSources, pickWords, type Exercise, type SessionConfig, type Source } from '../lib/session'
import type { Progress } from '../types'
import { useTitle } from '../lib/useTitle'

// Listening needs speech synthesis, which a few browsers lack.
const EXERCISES = ALL_EXERCISES.filter((e) => e.value !== 'listen' || canSpeak)

// Ready-made complexes: every word goes through all of the listed exercises in one session.
const PRESETS: { label: string; modes: Exercise[] }[] = [
  { label: 'Швидкий: вибір + введення', modes: ['choice', 'typing'] },
  { label: 'Повний: вибір, переклад, складання, введення', modes: ['choice', 'translation', 'scramble', 'typing'] },
  { label: 'Змішаний: пари, речення, слухання, введення', modes: ['match', 'cloze', 'listen', 'typing'] },
]

const MODES_KEY = 'lexo.practice.modes'

/** The exercises picked last time, in the order picked (per browser); empty means automatic. */
function loadModes(): Exercise[] {
  try {
    const saved = JSON.parse(localStorage.getItem(MODES_KEY) ?? '[]') as string[]
    return saved.filter((m): m is Exercise => EXERCISES.some((e) => e.value === m))
  } catch {
    return []
  }
}

function saveModes(modes: Exercise[]) {
  try {
    localStorage.setItem(MODES_KEY, JSON.stringify(modes))
  } catch {
    // private mode etc.: the choice just is not remembered
  }
}

const limits = [10, 20, 50, 100]

/** Router state: from the grammar section (exactly these words) or from the statistics page (a preset source). */
interface NavState {
  wordIds?: string[]
  title?: string
  source?: Source
}

export default function Practice() {
  useTitle('Практика')
  const { session } = useAuth()
  const nav = (useLocation().state as NavState | null) ?? null
  const fromArticle = nav?.wordIds && nav.title ? { wordIds: nav.wordIds, title: nav.title } : null
  const qc = useQueryClient()
  const words = useWords()
  const tags = useTags()
  const progress = useProgress()

  const [config, setConfig] = useState<SessionConfig>(() =>
    fromArticle
      ? { source: 'subset', subset: { ids: fromArticle.wordIds, title: fromArticle.title }, tagIds: [], limit: limits.find((n) => n >= fromArticle.wordIds.length) ?? 100, modes: loadModes() }
      : { source: nav?.source ?? 'today', tagIds: [], limit: 20, modes: loadModes() },
  )
  const [running, setRunning] = useState<WordWithTags[] | null>(null)

  const progressById = useMemo(() => new Map((progress.data ?? []).map((p): [string, Progress] => [p.word_id, p])), [progress.data])
  const counts = useMemo(
    () => countSources(words.data ?? [], progressById, config.tagIds),
    [words.data, progressById, config.tagIds],
  )

  const sources: { value: Source; title: string; hint: string; count: number }[] = [
    ...(config.subset
      ? [{ value: 'subset' as Source, title: `Слова: ${config.subset.title}`, hint: 'вибрані слова з вашого словника', count: config.subset.ids.length }]
      : []),
    { value: 'today', title: 'Сьогодні', hint: `${counts.due} до повторення + ${counts.fresh} нових`, count: counts.due + counts.fresh },
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
        modes={config.modes}
        onFinish={() => {
          setRunning(null)
          qc.invalidateQueries({ queryKey: ['progress'] })
          qc.invalidateQueries({ queryKey: ['review_log'] })
        }}
      />
    )
  }

  // The order of `modes` is the order of the rounds: exercises run in the order they were picked.
  function setModes(modes: Exercise[]) {
    saveModes(modes)
    setConfig((c) => ({ ...c, modes }))
  }

  function toggleExercise(value: Exercise) {
    setModes(config.modes.includes(value) ? config.modes.filter((m) => m !== value) : [...config.modes, value])
  }

  function toggleTag(id: string) {
    setConfig((c) => ({ ...c, tagIds: c.tagIds.includes(id) ? c.tagIds.filter((t) => t !== id) : [...c.tagIds, id] }))
  }

  function start() {
    const picked = pickWords(words.data ?? [], progressById, config)
    if (picked.length > 0) setRunning(picked)
  }

  const wordCount = Math.min(available, config.limit)
  const complex = config.modes.length >= 2
  const modeHint =
    config.modes.length === 0
      ? 'Авто: вправа залежить від того, наскільки слово вже вивчене.'
      : complex
        ? `Комплекс по порядку: ${config.modes.map((m) => `«${EXERCISES.find((e) => e.value === m)!.label}»`).join(' → ')}. Спершу всі слова в першій вправі, потім усі в наступній (близько ${wordCount * config.modes.length} карток). Розклад повторень оновиться один раз, після останньої вправи.`
        : 'Усі слова — в одній вправі.'

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition-colors ${active ? 'border-accent bg-accent/20 text-accent' : 'border-white/12 text-white/60 hover:text-white'}`

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Практика</h1>

      <DailyGoal />

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

      <div className="space-y-3">
        <p className="text-sm text-white/50">Вправи</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setModes([])} className={chip(config.modes.length === 0)}>
            Авто
          </button>
          {EXERCISES.map((e) => (
            <button key={e.value} onClick={() => toggleExercise(e.value)} aria-pressed={config.modes.includes(e.value)} className={chip(config.modes.includes(e.value))}>
              {complex && config.modes.includes(e.value) && <span className="mr-1.5 text-xs opacity-70">{config.modes.indexOf(e.value) + 1}.</span>}
              {e.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => setModes(preset.modes)}
              className="rounded-full border border-dashed border-white/15 px-3 py-1 text-xs text-white/50 transition-colors hover:text-white"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-white/40">{modeHint}</p>
        {(config.modes.includes('cloze') || config.modes.includes('matchdef')) && (
          <p className="text-xs text-white/30">«Слово в реченні» працює для слів із прикладом, де це слово є, «Слово ↔ пояснення» — для слів із визначенням. Інші слова цю вправу пропускають.</p>
        )}
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

      {/* On a phone the button stays above the bottom bar, so it is reachable without scrolling to the end of the settings. */}
      <WordOfDay words={words.data ?? []} />

      <div className="sticky bottom-24 z-[5] md:static">
        <button onClick={start} disabled={available === 0} className="btn-primary w-full py-3 text-lg shadow-[0_8px_30px_rgb(0_0_0/0.45)] md:shadow-none">
          {available === 0 ? 'Немає слів для цього вибору' : `Почати · ${wordCount} слів${complex ? ` × ${config.modes.length} вправи` : ''}`}
        </button>
      </div>
    </section>
  )
}
