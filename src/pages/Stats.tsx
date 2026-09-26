import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BarChart, Card, Kpi, Meter, StackedBar, type Bar } from '../components/charts'
import { exercises } from '../lib/exercises'
import { topicStats, useExerciseLog, type LogRow } from '../lib/exerciseLog'
import { articles, categories } from '../lib/grammar'
import { useProgress, useWords } from '../lib/queries'
import { useReviewLog } from '../lib/reviewLog'
import { MODE_LABELS, activity, forecast, maturity, modeStats, percent, streak } from '../lib/stats'
import { demoExerciseLog, demoProgress, demoReviewLog } from '../lib/statsDemo'

const dateLabel = (d: Date) => d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
const weekday = (d: Date) => d.toLocaleDateString('uk-UA', { weekday: 'short' })

export default function Stats() {
  const [params] = useSearchParams()
  const demo = params.get('demo') === '1'
  const navigate = useNavigate()

  const words = useWords()
  const realProgress = useProgress()
  const realLog = useReviewLog()
  const realExercises = useExerciseLog()

  const banks = useMemo(() => new Map([...exercises].map(([slug, qs]) => [slug, qs.map((q) => q.id)])), [])
  const progress = useMemo(() => (demo ? demoProgress(words.data ?? []) : (realProgress.data ?? [])), [demo, words.data, realProgress.data])
  const log = useMemo(() => (demo ? demoReviewLog() : (realLog.data ?? [])), [demo, realLog.data])
  const exLog: LogRow[] | undefined = useMemo(() => (demo ? demoExerciseLog(banks) : realExercises.data), [demo, banks, realExercises.data])

  const loading = words.isLoading || (!demo && (realProgress.isLoading || realLog.isLoading))
  const failed = (!demo && (realProgress.error ?? realLog.error ?? words.error)) as Error | null

  const days30 = useMemo(() => activity(log, 30), [log])
  const stats = useMemo(() => {
    const week = days30.slice(-7)
    const weekTotal = week.reduce((s, d) => s + d.total, 0)
    const weekCorrect = week.reduce((s, d) => s + d.correct, 0)
    const m = maturity(progress)
    const next7 = forecast(progress, 7)
    return { weekTotal, weekAccuracy: percent(weekCorrect, weekTotal), m, next7, streak: streak(log), monthTotal: days30.reduce((s, d) => s + d.total, 0) }
  }, [days30, progress, log])

  const wordById = useMemo(() => new Map((words.data ?? []).map((w) => [w.id, w])), [words.data])
  const hardWords = useMemo(
    () =>
      progress
        .filter((p) => p.error_count >= 2)
        .sort((a, b) => b.error_count - a.error_count)
        .slice(0, 8)
        .map((p) => ({ word: wordById.get(p.word_id), errors: p.error_count }))
        .filter((h) => h.word),
    [progress, wordById],
  )
  const hardCount = progress.filter((p) => p.error_count >= 2).length
  const modes = useMemo(() => modeStats(log).filter((m) => m.total >= 3), [log])

  const topics = useMemo(
    () =>
      articles
        .filter((a) => banks.has(a.slug))
        .map((article) => {
          const ids = banks.get(article.slug)!
          const st = topicStats(exLog, article.slug, new Set(ids))
          return { article, total: ids.length, ...st }
        }),
    [banks, exLog],
  )
  const grammar = useMemo(() => {
    const total = topics.reduce((s, t) => s + t.total, 0)
    const mastered = topics.reduce((s, t) => s + t.mastered, 0)
    const started = topics.filter((t) => t.attempted > 0).length
    const weak = topics.filter((t) => t.mistakes.length > 0).sort((a, b) => b.mistakes.length - a.mistakes.length).slice(0, 6)
    return { total, mastered, started, weak }
  }, [topics])

  if (loading) return <p className="text-white/50">Завантаження…</p>
  if (failed) return <p className="text-bad">{failed.message}</p>

  const activityBars: Bar[] = days30.map((d) => ({
    key: d.key,
    label: dateLabel(d.date),
    value: d.total,
    detail: `${dateLabel(d.date)} · ${d.total} повторень${d.total > 0 ? ` · ${percent(d.correct, d.total)}% правильно` : ''}`,
  }))
  const forecastBars: Bar[] = stats.next7.map((d, i) => ({
    key: d.date.toISOString(),
    label: i === 0 ? 'сьогодні' : weekday(d.date),
    value: d.due,
    detail: `${i === 0 ? 'Сьогодні (із простроченими)' : dateLabel(d.date)} · ${d.due} слів`,
  }))

  return (
    <section className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-3xl font-light tracking-tight">Статистика</h1>
        {demo && (
          <Link to="/stats" className="rounded-full bg-accent/15 px-3 py-1 text-xs text-accent">
            демо-дані · вийти
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Слів" value={progress.length} hint={`вивчено ${stats.m.mature} · нових ${stats.m.fresh}`} />
        <Kpi label="Сьогодні до повторення" value={stats.next7[0].due} hint={stats.next7[0].due > 0 ? 'на екрані «Практика»' : stats.m.fresh > 0 ? 'є нові слова для вивчення' : 'усе повторено'} />
        <Kpi label="Серія" value={stats.streak} hint={stats.streak === 1 ? 'день поспіль' : 'днів поспіль'} />
        <Kpi label="Точність, 7 днів" value={stats.weekTotal > 0 ? `${stats.weekAccuracy}%` : '—'} hint={`${stats.weekTotal} повторень`} />
      </div>

      <Card title="Активність, 30 днів" note={`${stats.monthTotal} повторень`}>
        {stats.monthTotal === 0 ? (
          <p className="text-sm text-white/45">Повторень ще немає. Пройдіть першу сесію на екрані «Практика» — тут з'явиться графік.</p>
        ) : (
          <BarChart data={activityBars} ariaLabel="Повторення слів за днями" unit="повторень" />
        )}
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Словник за зрілістю">
          <StackedBar
            ariaLabel="Розподіл слів за зрілістю"
            segments={[
              { key: 'fresh', label: 'Нові', value: stats.m.fresh, color: 'bg-white/25' },
              { key: 'learning', label: 'Вчаться (< 7 днів)', value: stats.m.learning, color: 'bg-accent/40' },
              { key: 'young', label: 'Молоді (7–20 днів)', value: stats.m.young, color: 'bg-accent/70' },
              { key: 'mature', label: 'Зрілі (21+ день)', value: stats.m.mature, color: 'bg-accent' },
            ]}
          />
        </Card>

        <Card title="Прогноз повторень" note="7 днів">
          <BarChart data={forecastBars} color="bg-accent-alt" height={110} ariaLabel="Слова до повторення за днями" unit="слів" />
        </Card>
      </div>

      {modes.length > 0 && (
        <Card title="Точність за режимами" note="90 днів">
          <div className="space-y-3">
            {modes.map((m) => (
              <Meter key={m.mode} label={MODE_LABELS[m.mode] ?? m.mode} value={m.correct} max={m.total} right={`${percent(m.correct, m.total)}% · ${m.total}`} />
            ))}
          </div>
        </Card>
      )}

      {hardCount > 0 && (
        <Card title="Складні слова" note={`${hardCount} зі щонайменше 2 помилками`}>
          <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {hardWords.map(({ word, errors }) => (
              <li key={word!.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">
                  {word!.term} <span className="text-white/40">— {word!.translation}</span>
                </span>
                <span className="shrink-0 text-white/40 tabular-nums">{errors}×</span>
              </li>
            ))}
          </ul>
          {!demo && (
            <button onClick={() => navigate('/practice', { state: { source: 'hard' } })} className="btn-ghost">
              Практикувати складні
            </button>
          )}
        </Card>
      )}

      <Card title="Граматика" note={`опановано ${grammar.mastered} з ${grammar.total} запитань · тем розпочато ${grammar.started} з ${topics.length}`}>
        <Meter label="Загальний прогрес" value={grammar.mastered} max={grammar.total} right={`${percent(grammar.mastered, grammar.total)}%`} color="bg-accent-alt" />

        {grammar.weak.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm tracking-widest text-white/40 uppercase">Що повторити</h3>
            <ul className="space-y-1.5">
              {grammar.weak.map((t) => (
                <li key={t.article.slug} className="flex items-center justify-between gap-3 text-sm">
                  <Link to={`/grammar/${t.article.slug}`} className="min-w-0 truncate hover:text-accent">
                    {t.article.title}
                  </Link>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-white/40">помилок {t.mistakes.length}</span>
                    <button onClick={() => navigate(`/grammar/${t.article.slug}/exercises`, { state: { mistakes: true } })} className="text-accent hover:underline">
                      повторити
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-sm tracking-widest text-white/40 uppercase">За темами</h3>
          {categories.map((c) => {
            const rows = topics.filter((t) => t.article.category === c.name)
            if (rows.length === 0) return null
            const total = rows.reduce((s, t) => s + t.total, 0)
            const mastered = rows.reduce((s, t) => s + t.mastered, 0)
            return (
              <details key={c.name} className="group rounded-2xl bg-white/5 px-4 py-3">
                <summary className="cursor-pointer list-none">
                  <Meter label={c.name} value={mastered} max={total} right={`${mastered} / ${total}`} color="bg-accent-alt" />
                </summary>
                <ul className="mt-3 space-y-2.5 border-t border-white/10 pt-3">
                  {rows.map((t) => (
                    <li key={t.article.slug}>
                      <Meter
                        label={
                          <Link to={`/grammar/${t.article.slug}`} className="hover:text-accent">
                            {t.article.title}
                          </Link>
                        }
                        value={t.mastered}
                        max={t.total}
                        right={t.attempted === 0 ? 'не розпочато' : `${t.mastered} / ${t.total}`}
                        color="bg-accent-alt"
                      />
                    </li>
                  ))}
                </ul>
              </details>
            )
          })}
        </div>
        <p className="text-xs text-white/30">«Опановано» — питання, на яке остання відповідь була правильною.</p>
      </Card>

      {!demo && stats.monthTotal === 0 && grammar.started === 0 && (
        <p className="text-center text-sm text-white/35">
          Бажаєте побачити, як виглядатиме статистика? <Link to="/stats?demo=1" className="text-accent hover:underline">Показати демо-дані</Link>
        </p>
      )}
    </section>
  )
}
