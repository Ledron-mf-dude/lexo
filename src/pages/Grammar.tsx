import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import LevelBadge from '../components/LevelBadge'
import { LEVELS, articles, categories, levelCounts, searchArticles, startLevel, type Article, type Hit, type Level } from '../lib/grammar'

type View = 'category' | 'level'

export default function Grammar() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const level = (LEVELS as readonly string[]).includes(params.get('level') ?? '') ? (params.get('level') as Level) : null
  const category = params.get('cat')
  const view: View = params.get('view') === 'level' ? 'level' : 'category'
  const searching = q.trim() !== ''
  const input = useRef<HTMLInputElement>(null)

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

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm transition-colors sm:py-1 ${active ? 'border-accent bg-accent/20 text-accent' : 'border-white/12 text-white/60 hover:text-white'}`

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-light tracking-tight sm:text-3xl">
        Граматика <span className="text-lg text-white/40">{articles.length}</span>
      </h1>

      <input
        ref={input}
        autoFocus={!window.matchMedia('(pointer: coarse)').matches}
        type="search"
        enterKeyHint="search"
        value={q}
        onChange={(e) => update({ q: e.target.value || null })}
        placeholder="Пошук за назвою чи темою…  ( / )"
        className="field"
      />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-xs tracking-widest text-white/35 uppercase sm:w-16">Рівень</span>
          <div className="chip-row m-0! min-w-0 flex-1 p-0! sm:items-center">
            <button onClick={() => update({ level: null })} className={chip(level === null)}>
              Усі
            </button>
            {LEVELS.map((l) => (
              <button key={l} onClick={() => update({ level: level === l ? null : l })} className={chip(level === l)}>
                {l} <span className="text-xs text-white/35">{levelCounts[l]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-xs tracking-widest text-white/35 uppercase sm:w-16">Тема</span>
          <div className="chip-row m-0! min-w-0 flex-1 p-0! sm:items-center">
            <button onClick={() => update({ cat: null })} className={chip(category === null)}>
              Усі
            </button>
            {categories.map((c) => (
              <button key={c.name} onClick={() => update({ cat: category === c.name ? null : c.name })} className={chip(category === c.name)}>
                {c.name} <span className="text-xs text-white/35">{c.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {!searching && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-white/45">
          <span>
            {filtered ? `Показано ${shown} з ${articles.length}` : `${articles.length} статей`}
            {filtered && (
              <button onClick={() => update({ level: null, cat: null })} className="ml-3 text-accent hover:underline">
                скинути фільтри
              </button>
            )}
          </span>
          <div className="flex gap-1">
            {(['category', 'level'] as const).map((v) => (
              <button key={v} onClick={() => update({ view: v === 'category' ? null : v })} className={chip(view === v)}>
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
                <ArticleRow key={h.article.slug} hit={h} showCategory />
              ))}
            </Section>
          )}
          {textHits.length > 0 && (
            <Section title="Згадується в тексті статей" count={textHits.length} muted>
              {textHits.map((h) => (
                <ArticleRow key={h.article.slug} hit={h} showCategory />
              ))}
            </Section>
          )}
        </>
      ) : (
        groups.map(([name, items]) => (
          <Section key={name} title={view === 'level' ? `Рівень ${name}` : name} count={items.length}>
            {items.map((h) => (
              <ArticleRow key={h.article.slug} hit={h} showCategory={view === 'level'} />
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
      <ul className="space-y-2">{children}</ul>
    </div>
  )
}

function ArticleRow({ hit, showCategory }: { hit: Hit; showCategory?: boolean }) {
  const { article, snippet } = hit
  return (
    <li>
      <Link to={`/grammar/${article.slug}`} className="glass block rounded-2xl p-4 transition-colors hover:bg-white/10">
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
      </Link>
    </li>
  )
}
