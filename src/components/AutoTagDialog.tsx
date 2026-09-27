import { useEffect, useMemo, useState } from 'react'
import { count, TAG, WORD, WORD_GEN } from '../lib/plural'
import { useAutoTag, type WordWithTags } from '../lib/queries'
import { BUILT_IN, GROUP_LABELS, isBuiltInTag, loadTopicDictionary, suggestTags, type TopicDictionary } from '../lib/tagTaxonomy'
import type { Tag } from '../types'

interface Props {
  userId: string
  words: WordWithTags[]
  tags: Tag[]
  onClose: () => void
}

/** Sorts the whole dictionary into the built-in topic tags; old personal tags can be removed in the same step. */
export default function AutoTagDialog({ userId, words, tags, onClose }: Props) {
  const [dict, setDict] = useState<TopicDictionary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const oldTags = useMemo(() => tags.filter((t) => !isBuiltInTag(t.name)), [tags])
  const [remove, setRemove] = useState<Set<string>>(() => new Set(oldTags.map((t) => t.id)))
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const autoTag = useAutoTag(userId)

  useEffect(() => {
    loadTopicDictionary().then(setDict, (e: Error) => setLoadError(e.message))
  }, [])

  const tagName = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags])
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const w of words) for (const id of w.tagIds) map.set(id, (map.get(id) ?? 0) + 1)
    return map
  }, [words])

  const plan = useMemo(() => {
    if (!dict) return null
    const links: { wordId: string; tagNames: string[] }[] = []
    const perTag = new Map<string, number>()
    const untagged: WordWithTags[] = []
    for (const w of words) {
      const has = new Set(w.tagIds.map((id) => tagName.get(id)))
      const suggested = suggestTags(w.term, dict)
      const add = suggested.filter((n) => !has.has(n))
      if (add.length > 0) links.push({ wordId: w.id, tagNames: add })
      for (const n of suggested) perTag.set(n, (perTag.get(n) ?? 0) + 1)
      if (suggested.length === 0 && ![...has].some((n) => n && isBuiltInTag(n))) untagged.push(w)
    }
    return { links, perTag, untagged }
  }, [dict, words, tagName])

  function apply() {
    if (!plan) return
    autoTag.mutate({ plan: { links: plan.links, removeTagIds: [...remove] }, onProgress: (done, total) => setProgress([done, total]) })
  }

  const done = autoTag.data
  const groups = (['topic', 'language'] as const).map((g) => ({
    group: g,
    items: Object.values(BUILT_IN)
      .filter((t) => t.group === g)
      .map((t) => ({ ...t, n: plan?.perTag.get(t.name) ?? 0 }))
      .filter((t) => t.n > 0),
  }))

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={autoTag.isPending ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass max-h-full w-full max-w-xl space-y-4 overflow-y-auto rounded-3xl bg-[#14161d]/90 p-5 sm:p-6">
        <h2 className="text-xl font-light">Розкласти слова за темами</h2>

        {loadError && <p className="text-bad">{loadError}</p>}
        {!plan && !loadError && <p className="animate-pulse text-white/50">Підбираю теги…</p>}

        {done ? (
          <>
            <p className="text-good">
              Готово: теги додано до {count(done.tagged, WORD_GEN)}
              {done.removed > 0 && `, видалено ${count(done.removed, TAG)}`}.
            </p>
            <div className="flex justify-end">
              <button onClick={onClose} className="btn-primary">
                Закрити
              </button>
            </div>
          </>
        ) : (
          plan && (
            <>
              <p className="text-sm text-white/60">
                Кожне слово отримає 1–3 теги за значенням (<i>почуття й емоції</i>, <i>робота й кар'єра</i>…) і за типом виразу (<i>фразові дієслова</i>,{' '}
                <i>герундій</i>…). Теги, які вже є на словах, залишаться.
              </p>

              {groups.map(
                ({ group, items }) =>
                  items.length > 0 && (
                    <div key={group} className="space-y-1.5">
                      <p className="text-xs tracking-widest text-white/35 uppercase">{GROUP_LABELS[group]}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((t) => (
                          <span key={t.name} className="inline-flex items-center gap-1.5 rounded-full bg-white/6 px-2.5 py-1 text-xs text-white/75">
                            <span className="size-2 rounded-full" style={{ background: t.color }} aria-hidden />
                            {t.name}
                            <span className="text-white/35 tabular-nums">{t.n}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ),
              )}

              <p className="text-sm">
                Нові теги отримають <span className="text-accent">{count(plan.links.length, WORD)}</span> з {words.length}.
                {plan.untagged.length > 0 && (
                  <span className="text-white/45">
                    {' '}
                    Без теми залишаться {plan.untagged.length}: {plan.untagged.slice(0, 5).map((w) => w.term).join(', ')}
                    {plan.untagged.length > 5 && '…'} — їм можна додати теги вручну.
                  </span>
                )}
              </p>

              {oldTags.length > 0 && (
                <div className="space-y-2 rounded-2xl bg-white/4 p-3">
                  <p className="text-sm text-white/70">Видалити старі теги? Слова залишаться, зникне лише позначка.</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {oldTags.map((t) => (
                      <label key={t.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={remove.has(t.id)}
                          onChange={(e) =>
                            setRemove((cur) => {
                              const next = new Set(cur)
                              if (e.target.checked) next.add(t.id)
                              else next.delete(t.id)
                              return next
                            })
                          }
                          className="size-4 accent-[#7c9bff]"
                        />
                        {t.name} <span className="text-white/35">{counts.get(t.id) ?? 0}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {autoTag.error && <p className="text-sm text-bad">{(autoTag.error as Error).message}</p>}

              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={onClose} disabled={autoTag.isPending} className="btn-ghost">
                  Скасувати
                </button>
                <button onClick={apply} disabled={autoTag.isPending || (plan.links.length === 0 && remove.size === 0)} className="btn-primary">
                  {autoTag.isPending ? (progress ? `Зберігаю… ${progress[0]} / ${progress[1]}` : 'Зберігаю…') : 'Застосувати'}
                </button>
              </div>
            </>
          )
        )}
      </div>
    </div>
  )
}
