import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LogRow } from '../lib/exerciseLog'
import { topicStats } from '../lib/exerciseLog'
import { exercises } from '../lib/exercises'
import { personalPairs, reviewSchedule, reviewSummary, shortTitle } from '../lib/grammarReview'
import { count, QUESTION } from '../lib/plural'
import { loadCards, MY_WRITING } from '../lib/writingCards'

const SHOWN_PAIRS = 3

/** «Повторення» on the Grammar page: questions due today (spaced repetition) and topic pairs to tell apart. */
export default function GrammarReview({ log }: { log: LogRow[] | undefined }) {
  const navigate = useNavigate()
  const [allPairs, setAllPairs] = useState(false)

  const { due, next, pairs } = useMemo(() => {
    const cards = new Set(loadCards().map((c) => c.id))
    const valid = (slug: string, id: string) => (slug === MY_WRITING ? cards.has(id) : Boolean(exercises.get(slug)?.some((q) => q.id === id)))
    const { due, next } = reviewSummary(reviewSchedule(log, valid))
    const mistakes = new Map([...exercises].map(([slug, qs]) => [slug, topicStats(log, slug, new Set(qs.map((q) => q.id))).mistakes.length]))
    return { due: due.length, next, pairs: personalPairs(mistakes) }
  }, [log])

  const shown = allPairs ? pairs : pairs.slice(0, SHOWN_PAIRS)
  return (
    <div className="glass space-y-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">Граматика на сьогодні</p>
          <p className="text-sm text-white/45">
            {due > 0
              ? `${count(due, QUESTION)} з помилками чекають повторення. Кожне повертається через 1 → 3 → 7 → 14 днів, доки не закріпиться.`
              : next
                ? `Сьогодні все повторено. Наступне: ${next.days === 1 ? 'завтра' : `через ${next.days} дн.`}${next.count > 0 ? ` (${count(next.count, QUESTION)})` : ''}.`
                : 'Запитання, на які ви помилитеся, повертатимуться сюди через 1 → 3 → 7 → 14 днів.'}
          </p>
        </div>
        {due > 0 && (
          <button onClick={() => navigate('/grammar/practice?review=1')} className="btn-primary w-full sm:w-auto">
            Повторити · {due}
          </button>
        )}
      </div>

      <div className="space-y-2 border-t border-white/8 pt-3">
        <p className="text-sm text-white/60">
          Контрастні пари <span className="text-white/35">· теми, які легко сплутати; назва теми під час вправи прихована</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {shown.map(({ pair, both }) => (
            <button
              key={pair.join()}
              onClick={() => navigate(`/grammar/practice?pair=${pair.join(',')}`)}
              className={`chip ${both ? 'border-bad/40! text-white' : ''}`}
              title={both ? 'В обох темах є ваші помилки' : undefined}
            >
              {shortTitle(pair[0])} / {shortTitle(pair[1])}
            </button>
          ))}
          {pairs.length > SHOWN_PAIRS && (
            <button onClick={() => setAllPairs((a) => !a)} className="px-2 text-sm text-accent hover:underline">
              {allPairs ? 'менше' : `усі ${pairs.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
