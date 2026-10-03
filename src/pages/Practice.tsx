import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import DailyGoal from '../components/DailyGoal'
import Session from '../components/practice/Session'
import TagPicker from '../components/TagPicker'
import WordOfDay from '../components/WordOfDay'
import { useAuth } from '../lib/authContext'
import { REVIEW_KEY, useProgress, useTags, useWords, type WordWithTags } from '../lib/queries'
import { canRecognize } from '../lib/recognition'
import { canSpeak } from '../lib/speech'
import { EXERCISES as ALL_EXERCISES, countSources, pickWords, type Exercise, type SessionConfig, type Source } from '../lib/session'
import type { Progress } from '../types'
import { useTitle } from '../lib/useTitle'
import { count, EXERCISE, EXERCISE_GEN, WORD } from '../lib/plural'
import { matchesLevel, useWordLevels, WORD_LEVELS, type LevelFilter } from '../lib/wordLevels'
import { practiceSettingsPref } from '../lib/prefs'

// Listening needs speech synthesis and speaking needs speech recognition; browsers without them do not show those exercises.
const EXERCISES = ALL_EXERCISES.filter((e) => ((e.value !== 'listen' && e.value !== 'dictation') || canSpeak) && (e.value !== 'speak' || canRecognize))

// Ready-made complexes: every word goes through all of the listed exercises in one session.
const PRESETS: { title: string; modes: Exercise[] }[] = [
  { title: 'Швидкий', modes: ['choice', 'typing'] },
  { title: 'Повний', modes: ['choice', 'translation', 'scramble', 'typing'] },
  { title: 'Змішаний', modes: ['match', 'cloze', 'listen', 'typing'] },
]

// Recognising a word comes before producing it; the grid shows the two kinds apart.
const EXERCISE_GROUPS: { title: string; modes: Exercise[] }[] = [
  { title: 'Впізнати', modes: ['choice', 'match', 'matchdef', 'flashcard', 'cloze', 'passage'] },
  { title: 'Відтворити', modes: ['translation', 'gaps', 'scramble', 'listen', 'dictation', 'typing', 'speak'] },
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
  const settingsOpen = practiceSettingsPref.use() === 'open'
  // Level filter (per session, not remembered): words of the chosen CEFR levels only; empty = all words.
  const [levelFilter, setLevelFilter] = useState<LevelFilter[]>([])
  const levels = useWordLevels()
  // Words from a grammar article are practised as they are; the level filter applies to the other sources.
  const pool = useMemo(
    () => (config.source === 'subset' || levelFilter.length === 0 ? (words.data ?? []) : (words.data ?? []).filter((w) => matchesLevel(w.term, levels, levelFilter))),
    [words.data, levels, levelFilter, config.source],
  )

  const progressById = useMemo(() => new Map((progress.data ?? []).map((p): [string, Progress] => [p.word_id, p])), [progress.data])
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const w of words.data ?? []) for (const id of w.tagIds) map.set(id, (map.get(id) ?? 0) + 1)
    return map
  }, [words.data])
  const counts = useMemo(
    () => countSources(pool, progressById, config.tagIds),
    [pool, progressById, config.tagIds],
  )

  const sources: { value: Source; title: string; hint: string; count: number }[] = [
    ...(config.subset
      ? [{ value: 'subset' as Source, title: `Слова: ${config.subset.title}`, hint: 'вибрані слова з вашого словника', count: config.subset.ids.length }]
      : []),
    {
      value: 'today',
      title: 'Сьогодні',
      hint: `${counts.due} до повторення + ${counts.fresh} нових${counts.later > 0 ? ` · ще ${counts.later} пізніше` : ''}`,
      count: counts.due + counts.fresh,
    },
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
          // While answers are still queued (offline), the cache already holds them and the queue refetches when it is done.
          if (qc.isMutating({ mutationKey: REVIEW_KEY }) > 0) return
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

  function start() {
    const picked = pickWords(pool, progressById, config)
    if (picked.length > 0) setRunning(picked)
  }

  const wordCount = Math.min(available, config.limit)
  const complex = config.modes.length >= 2
  const modeHint =
    config.modes.length === 0
      ? ''
      : complex
        ? `Комплекс по порядку: ${config.modes.map((m) => `«${EXERCISES.find((e) => e.value === m)!.label}»`).join(' → ')}. Спершу всі слова в першій вправі, потім усі в наступній (близько ${wordCount * config.modes.length} карток). Розклад повторень оновиться один раз, після останньої вправи.`
        : 'Усі слова — в одній вправі.'

  const label = 'text-xs tracking-widest text-white/55 uppercase'

  // What the session will be, in one line, so the settings can stay folded away.
  const modesSummary =
    config.modes.length === 0 ? 'вправи: авто' : complex ? `комплекс із ${count(config.modes.length, EXERCISE_GEN)}` : `«${EXERCISES.find((e) => e.value === config.modes[0])!.label}»`
  const summary = [
    count(wordCount, WORD),
    modesSummary,
    levelFilter.length > 0 && config.source !== 'subset' ? `рівень ${levelFilter.join(', ')}` : null,
    config.tagIds.length > 0 ? `тегів: ${config.tagIds.length}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Практика</h1>

      <DailyGoal />

      <div className="grid grid-cols-2 gap-2">
        {sources.map((s) => (
          <button
            key={s.value}
            onClick={() => setConfig((c) => ({ ...c, source: s.value }))}
            aria-pressed={config.source === s.value}
            className={`glass min-w-0 rounded-2xl p-3 text-left transition-colors sm:p-4 ${s.value === 'subset' ? 'col-span-2' : ''} ${config.source === s.value ? 'border-accent! bg-accent/10' : 'hover:bg-white/10'}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 text-sm leading-tight font-medium break-words sm:text-base">{s.title}</span>
              <span className="text-lg font-light text-accent tabular-nums sm:text-xl">{s.count}</span>
            </div>
            <p className="text-xs text-white/55 sm:text-sm">{s.hint}</p>
          </button>
        ))}
      </div>

      {/* Start comes right after the source: most sessions keep the settings as they are. */}
      <div className="space-y-2">
        <button onClick={start} disabled={available === 0} className="btn-primary w-full py-3 text-lg">
          {available === 0 ? 'Немає слів для цього вибору' : `Почати · ${count(wordCount, WORD)}${complex ? ` × ${count(config.modes.length, EXERCISE)}` : ''}`}
        </button>
        <button
          onClick={() => practiceSettingsPref.set(settingsOpen ? 'closed' : 'open')}
          aria-expanded={settingsOpen}
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-1 py-1 text-left text-sm text-white/50 hover:text-white"
        >
          <span className="min-w-0">
            Налаштування <span className="text-white/55">· {summary}</span>
          </span>
          <span aria-hidden="true">{settingsOpen ? '▴' : '▾'}</span>
        </button>
      </div>

      {settingsOpen && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <div className="space-y-2">
              <p className={label}>Кількість слів</p>
              <div className="segmented">
                {limits.map((n) => (
                  <button key={n} onClick={() => setConfig((c) => ({ ...c, limit: n }))} data-on={config.limit === n} className="min-w-11">
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {levels && config.source !== 'subset' && (
              <div className="space-y-2">
                <p className={label}>
                  Рівень <span className="tracking-normal normal-case">{levelFilter.length === 0 ? '· усі' : ''}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {WORD_LEVELS.map((l) => (
                    <button
                      key={l}
                      onClick={() => setLevelFilter((f) => (f.includes(l) ? f.filter((x) => x !== l) : [...f, l]))}
                      data-on={levelFilter.includes(l)}
                      aria-pressed={levelFilter.includes(l)}
                      className="chip min-w-10 justify-center"
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(tags.data?.length ?? 0) > 0 && (
              <div className="min-w-0 space-y-2">
                <p className={label}>
                  Теги <span className="tracking-normal normal-case">{config.tagIds.length === 0 ? '· усі слова' : ''}</span>
                </p>
                <TagPicker tags={tags.data!} selected={config.tagIds} counts={tagCounts} onChange={(ids) => setConfig((c) => ({ ...c, tagIds: ids }))} />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className={label}>Вправи</p>
              {config.modes.length > 0 && (
                <button onClick={() => setModes([])} className="text-xs text-white/60 hover:text-white">
                  скинути
                </button>
              )}
            </div>
            <button onClick={() => setModes([])} data-on={config.modes.length === 0} className="tile w-full">
              <span className="font-medium">Авто</span>
              <span className="text-xs text-white/60">вправа залежить від того, наскільки слово вже вивчене</span>
            </button>
            {EXERCISE_GROUPS.map((group) => (
              <div key={group.title} className="space-y-1.5">
                <p className="text-xs text-white/55">{group.title}</p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {EXERCISES.filter((e) => group.modes.includes(e.value)).map((e) => {
                    const on = config.modes.includes(e.value)
                    return (
                      <button key={e.value} onClick={() => toggleExercise(e.value)} aria-pressed={on} data-on={on} className="tile">
                        <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] tabular-nums ${on ? 'bg-accent text-[#0a0b0f]' : 'border border-white/20'}`}>
                          {on ? (complex ? config.modes.indexOf(e.value) + 1 : '✓') : ''}
                        </span>
                        <span className="min-w-0">{e.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="space-y-1.5">
              <p className="text-xs text-white/55">Готові комплекси</p>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {PRESETS.map((preset) => {
                  const on = preset.modes.join() === config.modes.join()
                  return (
                    <button key={preset.title} onClick={() => setModes(preset.modes)} data-on={on} className="tile flex-col items-start! gap-0.5!">
                      <span className="font-medium">{preset.title}</span>
                      <span className="text-xs text-white/60">{preset.modes.map((m) => EXERCISES.find((e) => e.value === m)?.label).filter(Boolean).join(' → ')}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            {config.modes.length > 0 && <p className="text-sm text-white/55">{modeHint}</p>}
            {config.modes.some((m) => ['cloze', 'passage', 'dictation', 'matchdef'].includes(m)) && (
              <p className="text-xs text-white/50">
                «Слово в реченні», «Текст із пропусками» й «Диктант речень» працюють для слів із прикладом, «Слово ↔ пояснення» — для слів із визначенням. Інші слова цю вправу пропускають.
              </p>
            )}
          </div>
        </div>
      )}

      <WordOfDay words={words.data ?? []} />
    </section>
  )
}
