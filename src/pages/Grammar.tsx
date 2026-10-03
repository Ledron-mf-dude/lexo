import { useEffect, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import LevelBadge from '../components/LevelBadge'
import GrammarHub from '../components/GrammarHub'
import SelectMenu from '../components/SelectMenu'
import { exercises } from '../lib/exercises'
import { allMistakes, useExerciseLog } from '../lib/exerciseLog'
import { LEVELS, articles, categories, levelCounts, searchArticles, startLevel, type Article, type Hit, type Level } from '../lib/grammar'
import { topicProgress, topicStatus } from '../lib/learningPath'
import { ARTICLE, count } from '../lib/plural'
import { useTitle } from '../lib/useTitle'

/** Per-topic exercise progress shown on each row: questions whose latest answer was right, out of all. */
type Progress = Map<string, { mastered: number; total: number; attempted: number }>

const coarse = window.matchMedia('(pointer: coarse)').matches

type View = 'category' | 'level'

export default function Grammar() {
  useTitle('Граматика')
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const level = (LEVELS as readonly string[]).includes(params.get('level') ?? '') ? (params.get('level') as Level) : null
  const category = params.get('cat')
  const view: View = params.get('view') === 'level' ? 'level' : 'category'
  const searching = q.trim() !== ''
  const input = useRef<HTMLInputElement>(null)
  const log = useExerciseLog()
  const mistakes = allMistakes(log.data, exercises).length
  const progress: Progress = useMemo(() => topicProgress(log.data), [log.data])

  /** Query string for mixed practice with the current level and topic filters. */
  const practiceQuery = (extra: Record<string, string>) =>
    new URLSearchParams(Object.entries({ level, cat: category, ...extra }).filter((e): e is [string, string] => Boolean(e[1]))).toString()

  // Filters live in the URL, so Back from an article returns to the same list.
  function update(next: Record<string, string | null>) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(next)) {
          if (v) p.set(k, v)
          else p.delete(k)
        }
        return p
      },
      { replace: true },
    )
  }

  // Ready to type on a computer; preventScroll keeps the list where Back left it (autoFocus would jump to the top).
  useEffect(() => {
    if (!coarse) input.current?.focus({ preventScroll: true })
  }, [])

  // "/" jumps to the search box from anywhere on the page, Esc clears it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        input.current?.focus()
      } else if (e.key === 'Escape') {
        update({ q: null })
        input.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const result = searchArticles(q)
  const passes = (a: Article) => (!level || a.levels.includes(level)) && (!category || a.category === category)
  const primary = result.primary.filter((h) => passes(h.article))
  const textHits = result.text.filter((h) => passes(h.article))
  const shown = primary.length + textHits.length
  const filtered = level !== null || category !== null

  const keyOf = (a: Article) => (view === 'level' ? startLevel(a) : a.category)
  const groups = (() => {
    const map = new Map<string, Hit[]>()
    for (const hit of primary) map.set(keyOf(hit.article), [...(map.get(keyOf(hit.article)) ?? []), hit])
    const entries = [...map]
    if (view === 'level') entries.sort((a, b) => LEVELS.indexOf(a[0] as Level) - LEVELS.indexOf(b[0] as Level))
    return entries
  })()

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-light tracking-tight sm:text-3xl">
        Граматика <span className="text-lg text-white/40">{articles.length}</span>
      </h1>

      <input
        ref={input}
        type="search"
        enterKeyHint="search"
        value={q}
        onChange={(e) => update({ q: e.target.value || null })}
        placeholder={coarse ? 'Пошук за назвою чи темою' : 'Пошук за назвою чи темою  ·  натисніть /'}
        className="field"
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="segmented" role="group" aria-label="Рівень">
          <button onClick={() => update({ level: null })} data-on={level === null}>
            Усі рівні
          </button>
          {LEVELS.map((l) => (
            <button key={l} onClick={() => update({ level: level === l ? null : l })} data-on={level === l} title={`${levelCounts[l]} статей`}>
              {l}
            </button>
          ))}
        </div>
        <SelectMenu
          label="Тема"
          value={category}
          width="sm:w-80"
          options={[{ value: null, label: 'Усі теми', count: articles.length }, ...categories.map((c) => ({ value: c.name, label: c.name, count: c.count }))]}
          onChange={(v) => update({ cat: v })}
        />
      </div>

      {!searching && (
        <GrammarHub log={log.data} progress={progress} filterLabel={[level, category].filter(Boolean).join(' · ') || null} practiceQuery={practiceQuery} mistakes={mistakes} />
      )}

      {!searching && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-white/45">
          <span>
            {filtered ? `Показано ${shown} з ${articles.length}` : count(articles.length, ARTICLE)}
            {filtered && (
              <button onClick={() => update({ level: null, cat: null })} className="ml-3 text-accent hover:underline">
                скинути фільтри
              </button>
            )}
          </span>
          <div className="segmented" role="group" aria-label="Групувати">
            {(['category', 'level'] as const).map((v) => (
              <button key={v} onClick={() => update({ view: v === 'category' ? null : v })} data-on={view === v}>
                {v === 'category' ? 'За темами' : 'За рівнями'}
              </button>
            ))}
          </div>
        </div>
      )}

      {shown === 0 && (
        <p className="glass rounded-3xl p-8 text-center text-white/50">
          {searching ? `Нічого не знайдено за запитом «${q}».` : 'Немає статей за цими фільтрами.'}
        </p>
      )}

      {searching ? (
        <>
          {primary.length > 0 && (
            <Section title="За назвою та темою" count={primary.length}>
              {primary.map((h) => (
                <ArticleRow key={h.article.slug} hit={h} progress={progress.get(h.article.slug)} showCategory />
              ))}
            </Section>
          )}
          {textHits.length > 0 && (
            <Section title="Згадується в тексті статей" count={textHits.length} muted>
              {textHits.map((h) => (
                <ArticleRow key={h.article.slug} hit={h} progress={progress.get(h.article.slug)} showCategory />
              ))}
            </Section>
          )}
        </>
      ) : (
        groups.map(([name, items]) => (
          <Section key={name} title={view === 'level' ? `Рівень ${name}` : name} count={items.length}>
            {items.map((h) => (
              <ArticleRow key={h.article.slug} hit={h} progress={progress.get(h.article.slug)} showCategory={view === 'level'} />
            ))}
          </Section>
        ))
      )}
    </section>
  )
}

function Section({ title, count, muted, children }: { title: string; count: number; muted?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className={`text-sm tracking-widest uppercase ${muted ? 'text-white/30' : 'text-white/45'}`}>
        {title} <span className="text-white/25">{count}</span>
      </h2>
      <ul className="glass divide-y divide-white/6 overflow-hidden rounded-2xl">{children}</ul>
    </div>
  )
}

function ArticleRow({ hit, progress, showCategory }: { hit: Hit; progress?: { mastered: number; total: number; attempted: number }; showCategory?: boolean }) {
  const { article, snippet } = hit
  const done = topicStatus(progress) === 'done'
  const unseen = progress ? progress.total - progress.attempted : 0
  return (
    <li>
      <Link to={`/grammar/${article.slug}`} className="block px-4 py-3 transition-colors hover:bg-white/6">
        <div className="flex items-start justify-between gap-3">
          <p className="font-medium">{article.title}</p>
          <span className="flex shrink-0 gap-1">
            {article.levels.map((l) => (
              <LevelBadge key={l} level={l} />
            ))}
          </span>
        </div>
        {showCategory && <p className="text-xs text-white/35">{article.category}</p>}
        {snippet && <p className="mt-1 text-sm text-white/45">{snippet}</p>}
        {progress && progress.attempted > 0 && (
          <div className="mt-2.5 flex items-center gap-2 text-xs text-white/40" title="Запитання, на які остання відповідь була правильною. Тема засвоєна від 80%.">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
              <div className={`h-full rounded-full ${done ? 'bg-good' : 'bg-accent-alt'}`} style={{ width: `${(progress.mastered / progress.total) * 100}%` }} />
            </div>
            {/* Unseen questions come first in the next round, so this shows where there is still something new. */}
            {unseen > 0 && <span className="shrink-0 text-accent">нових {unseen}</span>}
            <span className={`tabular-nums ${done ? 'text-good' : ''}`}>{done ? '✓ засвоєно' : `${progress.mastered} / ${progress.total}`}</span>
          </div>
        )}
      </Link>
    </li>
  )
}
