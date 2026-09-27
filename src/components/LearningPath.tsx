import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildRoute, loadPlacement, resetPlacement, type TopicProgress, type TopicStatus } from '../lib/learningPath'

const DOT: Record<TopicStatus, string> = {
  new: 'border border-white/30',
  progress: 'bg-accent',
  done: 'bg-good',
}

const PREVIEW = 4

/** «Ваш маршрут» on the Grammar page: an invitation to the placement test, or the topics of the level to study. */
export default function LearningPath({ progress }: { progress: Map<string, TopicProgress> }) {
  const [placement, setPlacement] = useState(loadPlacement)
  const [expanded, setExpanded] = useState(false)
  const route = useMemo(() => (placement ? buildRoute(placement, progress) : null), [placement, progress])

  function reset() {
    if (!window.confirm('Скинути маршрут і результат тесту рівня? Доведеться пройти тест заново.')) return
    resetPlacement()
    setPlacement(null)
  }

  if (!placement || !route) {
    return (
      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium">Ваш маршрут</p>
          <p className="text-sm text-white/45">Короткий тест на 5–10 хвилин визначить рівень, а маршрут покаже теми по порядку, першими — ті, де були помилки.</p>
        </div>
        <Link to="/grammar/placement" className="btn-primary w-full text-center sm:w-auto">
          Пройти тест
        </Link>
      </div>
    )
  }

  const [first, ...rest] = route.todo
  const shown = expanded ? rest : rest.slice(0, PREVIEW)
  return (
    <div className="glass space-y-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          Ваш маршрут <span className="text-white/45">· {route.level}</span>
        </p>
        <div className="flex items-center gap-2 text-xs text-white/40">
          <Link to="/grammar/placement" className="hover:text-white">
            тест: {placement.passed ?? 'A1'} · пройти ще раз
          </Link>
          <span aria-hidden="true">·</span>
          <button onClick={reset} className="hover:text-white">
            скинути маршрут
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-good transition-all" style={{ width: `${(route.done.length / Math.max(1, route.total)) * 100}%` }} />
        </div>
        <p className="text-xs text-white/40">
          Засвоєно тем: {route.done.length} / {route.total}. Тема засвоєна, коли на 8+ її запитань більшість останніх відповідей правильні.
        </p>
      </div>

      {first ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white/5 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/40">Наступна тема{first.weak ? ' · була помилка в тесті' : ''}</p>
            <p className="truncate">{first.article.title}</p>
          </div>
          <div className="flex w-full gap-2 *:flex-1 sm:w-auto sm:*:flex-none">
            <Link to={`/grammar/${first.article.slug}`} className="btn-ghost text-center">
              Читати
            </Link>
            <Link to={`/grammar/${first.article.slug}/exercises`} className="btn-primary text-center">
              Вправи
            </Link>
          </div>
        </div>
      ) : (
        <p className="text-sm text-good">Усі теми маршруту засвоєно.</p>
      )}

      {rest.length > 0 && (
        <ul className="divide-y divide-white/6 text-sm">
          {shown.map(({ article, status, weak }) => (
            <li key={article.slug}>
              <Link to={`/grammar/${article.slug}`} className="flex items-center gap-2.5 py-2 hover:text-accent">
                <span className={`size-2 shrink-0 rounded-full ${DOT[status]}`} aria-label={status === 'progress' ? 'в процесі' : 'не почато'} />
                <span className="min-w-0 flex-1 truncate">{article.title}</span>
                {weak && <span className="shrink-0 text-xs text-bad/80">помилка в тесті</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(rest.length > PREVIEW || route.done.length > 0) && (
        <button onClick={() => setExpanded((e) => !e)} className="text-sm text-accent hover:underline">
          {expanded ? 'Згорнути' : `Усі теми маршруту · ${route.total}`}
        </button>
      )}
      {expanded && route.done.length > 0 && (
        <ul className="divide-y divide-white/6 text-sm text-white/50">
          {route.done.map((a) => (
            <li key={a.slug}>
              <Link to={`/grammar/${a.slug}`} className="flex items-center gap-2.5 py-2 hover:text-white">
                <span className={`size-2 shrink-0 rounded-full ${DOT.done}`} aria-label="засвоєно" />
                <span className="min-w-0 flex-1 truncate">{a.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
