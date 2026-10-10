import { use, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { articleSections } from '../lib/articleText'
import type { Question } from '../lib/exercises'
import { bySlug, loadArticle } from '../lib/grammar'
import { ruleSectionIndex } from '../lib/ruleFinder'
import ArticleMarkdown from './ArticleMarkdown'

/**
 * «Правило» during a quiz: the article section that explains the question, over the quiz, so the deck is not lost.
 * The other sections are chips, in case the guess is off. Render it inside Suspense: the body may still be loading.
 */
export default function RuleSheet({ slug, q, onClose }: { slug: string; q: Question; onClose: () => void }) {
  const article = bySlug.get(slug)
  const { body } = use(loadArticle(slug))
  const sections = useMemo(() => articleSections(body), [body])
  const [index, setIndex] = useState(() => ruleSectionIndex(sections, q))
  const panel = useRef<HTMLDivElement>(null)

  // Esc closes; the page behind does not scroll while the sheet is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  // A new section starts at its top; its chip is brought into view in the sideways-scrolling row.
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 })
    panel.current?.querySelector('.chip[data-on="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [index])

  if (!article || sections.length === 0) return null
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label="Правило">
      <div
        ref={panel}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88dvh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-t-3xl bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm text-white/50">{article.title}</p>
          <button onClick={onClose} aria-label="Закрити правило" className="-m-2 grid size-10 shrink-0 place-items-center text-white/50 hover:text-white">
            ✕
          </button>
        </div>
        {sections.length > 1 && (
          <div className="chip-row">
            {sections.map((s, i) => (
              <button key={s.title} onClick={() => setIndex(i)} data-on={i === index} className="chip">
                {s.title}
              </button>
            ))}
          </div>
        )}
        <ArticleMarkdown body={sections[index].body} />
        <div className="flex gap-2 *:flex-1">
          <Link to={`/grammar/${slug}`} className="btn-ghost text-center">
            Уся стаття
          </Link>
          <button onClick={onClose} className="btn-primary">
            Назад до вправи
          </button>
        </div>
      </div>
    </div>
  )
}
