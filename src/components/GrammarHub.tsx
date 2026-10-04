import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { LogRow } from '../lib/exerciseLog'
import { fixCount } from '../lib/exercises'
import { useGrammarReview } from '../lib/grammarReview'
import { buildRoute, loadPlacement, type TopicProgress } from '../lib/learningPath'
import { count, NEW_QUESTION, QUESTION } from '../lib/plural'
import { grammarPanelPref } from '../lib/prefs'
import { ContrastPairs } from './GrammarReview'
import LearningPath from './LearningPath'

interface Props {
  log: LogRow[] | undefined
  progress: Map<string, TopicProgress>
  /** Level and topic filters of the list («B1 · Часи»), applied to mixed practice too. */
  filterLabel: string | null
  practiceQuery: (extra: Record<string, string>) => string
  mistakes: number
  /** The list shows only the short «X or Y» topics; the chip toggles that filter. */
  shortsOn: boolean
  onShorts: () => void
}

interface Action {
  title: string
  text: string
  label: string
  to: string
  /** A second, quieter link next to the main button. */
  aside?: { label: string; to: string }
}

/**
 * The top of the Grammar page: one «Сьогодні» card with the single next step, then a row of chips for the other tools.
 * Route and contrast pairs open as panels under the chips, so the article list starts right below on a phone.
 */
export default function GrammarHub({ log, progress, filterLabel, practiceQuery, mistakes, shortsOn, onShorts }: Props) {
  const navigate = useNavigate()
  const [placement, setPlacement] = useState(loadPlacement)
  const { due, next, pairs } = useGrammarReview(log)
  const panel = grammarPanelPref.use()
  const route = useMemo(() => (placement ? buildRoute(placement, progress) : null), [placement, progress])
  const nextTopic = route?.todo[0]?.article
  const mixedQuery = practiceQuery({})

  // The next step, most urgent first: due repetition, then the placement test, then the route, then free practice.
  const action: Action = (() => {
    if (due > 0)
      return {
        title: 'Граматика на сьогодні',
        text: `${count(due, QUESTION)} з помилками чекають повторення. Кожне повертається через 1 → 3 → 7 → 14 днів, доки не закріпиться.`,
        label: `Повторити · ${due}`,
        to: '/grammar/practice?review=1',
      }
    if (!placement)
      return {
        title: 'Почніть із тесту рівня',
        text: '10–15 хвилин: тест визначить рівень, а маршрут покаже теми по порядку, першими — ті, де були помилки.',
        label: 'Пройти тест',
        to: '/grammar/placement',
      }
    if (nextTopic && route) {
      const p = progress.get(nextTopic.slug)
      const unseen = p ? p.total - p.attempted : 0
      const state = !p || p.attempted === 0 ? 'ще не розпочато' : [`правильно ${p.mastered} з ${p.total}`, unseen > 0 && count(unseen, NEW_QUESTION)].filter(Boolean).join(' · ')
      return {
        title: nextTopic.title,
        text: `Наступна тема маршруту · ${route.level} · ${state}`,
        label: p && p.attempted > 0 ? 'Продовжити' : 'Почати',
        to: `/grammar/${nextTopic.slug}/exercises`,
        aside: { label: 'Читати', to: `/grammar/${nextTopic.slug}` },
      }
    }
    return {
      title: 'Маршрут пройдено',
      text: 'Усі теми вашого рівня засвоєно. Тримайте форму змішаними вправами: першими в них ідуть запитання, яких ви ще не бачили.',
      label: 'Змішані вправи',
      to: `/grammar/practice?${mixedQuery}`,
    }
  })()

  const toggle = (p: 'route' | 'pairs') => grammarPanelPref.set(panel === p ? 'none' : p)

  return (
    <div className="space-y-3">
      <div className="glass space-y-3 rounded-2xl p-4">
        <div className="min-w-0">
          <p className="text-xs tracking-widest text-white/55 uppercase">Сьогодні</p>
          <p className="mt-1 font-medium">{action.title}</p>
          <p className="text-sm text-white/60">{action.text}</p>
          {due === 0 && next && (
            <p className="mt-1 text-xs text-white/55">
              Повторення: {next.days === 1 ? 'завтра' : `через ${next.days} дн.`}
              {next.count > 0 && ` · ${count(next.count, QUESTION)}`}
            </p>
          )}
        </div>
        <div className="flex gap-2 *:flex-1 sm:*:flex-none">
          {action.aside && (
            <Link to={action.aside.to} className="btn-ghost text-center">
              {action.aside.label}
            </Link>
          )}
          <Link to={action.to} className="btn-primary text-center">
            {action.label}
          </Link>
        </div>
      </div>

      <div className="chip-row" role="group" aria-label="Інструменти">
        <button onClick={() => toggle('route')} data-on={panel === 'route'} aria-expanded={panel === 'route'} className="chip">
          Маршрут {panel === 'route' ? '▴' : '▾'}
        </button>
        <button onClick={() => toggle('pairs')} data-on={panel === 'pairs'} aria-expanded={panel === 'pairs'} className="chip">
          Контрастні пари {panel === 'pairs' ? '▴' : '▾'}
        </button>
        <button onClick={() => navigate(`/grammar/practice?${mixedQuery}`)} className="chip" title="15 запитань з усіх тем або з вибраних фільтрів; першими — ті, яких ви ще не бачили">
          Змішані{filterLabel ? ` · ${filterLabel}` : ''}
        </button>
        {fixCount > 0 && (
          <button onClick={() => navigate(`/grammar/practice?${practiceQuery({ type: 'fix' })}`)} className="chip" title={`${fixCount} речень із розділів «Типові помилки»`}>
            Знайди помилку
          </button>
        )}
        {mistakes > 0 && (
          <button onClick={() => navigate('/grammar/practice?mistakes=1')} className="chip">
            Помилки · {mistakes}
          </button>
        )}
        <button onClick={onShorts} data-on={shortsOn} aria-pressed={shortsOn} className="chip" title="Короткі теми «що обрати»: say чи tell, lie чи lay, until чи by… Корисні на будь-якому рівні">
          Короткі теми
        </button>
        <button onClick={() => navigate('/grammar/writing')} className="chip" title="Напишіть кілька речень: перевірка знайде помилки, а з них вийдуть ваші картки">
          Тренер письма
        </button>
      </div>

      {panel === 'route' && <LearningPath progress={progress} placement={placement} onChange={setPlacement} />}
      {panel === 'pairs' && <ContrastPairs pairs={pairs} />}
    </div>
  )
}
