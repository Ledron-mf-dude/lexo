import { useMemo, useState } from 'react'
import { GROUP_LABELS, groupTags } from '../lib/tagTaxonomy'
import type { Tag } from '../types'
import Dropdown from './Dropdown'

interface Props {
  tags: Tag[]
  selected: string[]
  onChange: (ids: string[]) => void
  /** Words per tag, shown next to each name. */
  counts?: Map<string, number>
}

/** Multi-select of tags: a dropdown with search and groups, plus the chosen tags as removable chips. */
export default function TagPicker({ tags, selected, onChange, counts }: Props) {
  const [query, setQuery] = useState('')
  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])
  const q = query.trim().toLowerCase()
  const groups = useMemo(() => groupTags(tags.filter((t) => t.name.toLowerCase().includes(q))), [tags, q])

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Dropdown active={selected.length > 0} width="sm:w-[30rem]" label={() => <>Теги{selected.length > 0 && <span className="tabular-nums">· {selected.length}</span>}</>}>
        {() => (
          <div className="space-y-2">
            {tags.length > 8 && (
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Знайти тег"
                className="field py-2 text-sm"
                autoFocus={!window.matchMedia('(pointer: coarse)').matches}
              />
            )}
            <div className="max-h-[min(24rem,55vh)] space-y-3 overflow-y-auto overscroll-contain px-1 pb-1">
              {groups.length === 0 && <p className="px-2 py-3 text-sm text-white/40">Нічого не знайдено</p>}
              {groups.map(({ group, tags: items }) => (
                <div key={group} className="space-y-1">
                  <p className="px-2 pt-1 text-[11px] tracking-widest text-white/35 uppercase">{GROUP_LABELS[group]}</p>
                  <div className="grid grid-cols-1 gap-0.5 min-[420px]:grid-cols-2">
                    {items.map((t) => {
                      const on = selected.includes(t.id)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggle(t.id)}
                          aria-pressed={on}
                          className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${on ? 'bg-accent/15 text-accent' : 'text-white/75 hover:bg-white/8'}`}
                        >
                          <span className={`grid size-4 shrink-0 place-items-center rounded border text-[10px] ${on ? 'border-accent bg-accent text-[#0a0b0f]' : 'border-white/25'}`}>{on && '✓'}</span>
                          <span className="size-2 shrink-0 rounded-full" style={{ background: t.color ?? '#94a3b8' }} aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{t.name}</span>
                          {counts && <span className="shrink-0 text-xs text-white/35 tabular-nums">{counts.get(t.id) ?? 0}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="w-full rounded-lg py-1.5 text-sm text-white/50 hover:bg-white/5 hover:text-white">
                Скинути вибір
              </button>
            )}
          </div>
        )}
      </Dropdown>

      {selected.map((id) => {
        const t = byId.get(id)
        if (!t) return null
        return (
          <button
            key={id}
            type="button"
            onClick={() => toggle(id)}
            aria-label={`Прибрати тег ${t.name}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/8 py-1 pr-2 pl-2.5 text-xs text-white/75 hover:bg-white/12"
          >
            <span className="size-2 rounded-full" style={{ background: t.color ?? '#94a3b8' }} aria-hidden />
            {t.name}
            <span className="text-white/40">✕</span>
          </button>
        )
      })}
    </div>
  )
}
