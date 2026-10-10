import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import LevelBadge from '../components/LevelBadge'
import { createPref } from '../lib/prefs'
import { READING_LEVELS, studyReadingLevel, texts, useReadResults, type ReadingLevel, type TextMeta } from '../lib/reading'
import { count, TEXT_GEN, WORD } from '../lib/plural'
import { useTitle } from '../lib/useTitle'

const LEVEL_NAMES: Record<ReadingLevel, string> = {
  A1: 'Початковий',
  A2: 'Елементарний',
  B1: 'Середній',
  B2: 'Вище середнього',
  C1: 'Просунутий',
  C2: 'Вільне володіння',
}

/** The level filter of the list, per device. */
const readingLevelPref = createPref('readingLevel', ['all', ...READING_LEVELS] as const, 'all')

export default function Reading() {
  useTitle('Читання')
  const filter = readingLevelPref.use()
  const results = useReadResults()
  const studyLevel = studyReadingLevel()

  // The suggested text: the first unread one at the study level, else the first unread one overall.
  const next = useMemo(() => {
    const unread = texts.filter((t) => !results[t.slug])
    return unread.find((t) => t.level === studyLevel) ?? unread[0]
  }, [results, studyLevel])

  const shown = READING_LEVELS.filter((l) => filter === 'all' || l === filter)

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Читання</h1>
        <p className="text-sm text-white/55">
          Короткі тексти за рівнями. Торкніться незнайомого слова, щоб побачити переклад і додати його у словник разом із реченням. Після тексту — запитання на розуміння і граматика, яку він тренує.
        </p>
      </header>

      {next && (
        <Link to={`/reading/${next.slug}`} className="glass block space-y-1.5 rounded-3xl p-5 transition-colors hover:border-accent/40">
          <p className="text-xs tracking-widest text-white/55 uppercase">{Object.keys(results).length === 0 ? 'Почніть із цього тексту' : 'Наступний текст'}</p>
          <p className="flex items-center gap-2 text-lg">
            <LevelBadge level={next.level} />
            {next.title}
          </p>
          <p className="text-sm text-white/60">{next.summary}</p>
          <p className="pt-1 text-sm text-accent">Читати · {next.minutes} хв →</p>
        </Link>
      )}

      <div className="chip-row">
        <button className="chip" data-on={filter === 'all'} onClick={() => readingLevelPref.set('all')}>
          Усі рівні
        </button>
        {READING_LEVELS.map((l) => (
          <button key={l} className="chip" data-on={filter === l} onClick={() => readingLevelPref.set(l)}>
            {l}
            {l === studyLevel && <span className="ml-1 text-xs text-white/55">· ваш</span>}
          </button>
        ))}
      </div>

      {shown.map((level) => {
        const list = texts.filter((t) => t.level === level)
        if (list.length === 0) return null
        const done = list.filter((t) => results[t.slug]).length
        return (
          <div key={level} className="space-y-2">
            <h2 className="flex items-baseline justify-between gap-3 px-1">
              <span className="text-xs tracking-widest text-white/55 uppercase">
                {level} · {LEVEL_NAMES[level]}
              </span>
              <span className="text-xs text-white/55">
                прочитано {done} з {count(list.length, TEXT_GEN)}
              </span>
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {list.map((t) => (
                <li key={t.slug}>
                  <TextCard text={t} result={results[t.slug]} />
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

function TextCard({ text, result }: { text: TextMeta; result?: { score: number; total: number } }) {
  return (
    <Link to={`/reading/${text.slug}`} className="glass flex h-full flex-col gap-1 rounded-2xl p-4 transition-colors hover:border-accent/40">
      <span className="flex items-start justify-between gap-2">
        <span className="font-medium">{text.title}</span>
        {result ? (
          <span className={`shrink-0 text-xs tabular-nums ${result.score === result.total ? 'text-good' : 'text-white/55'}`}>
            ✓ {result.score}/{result.total}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">нове</span>
        )}
      </span>
      <span className="text-sm text-white/60">{text.summary}</span>
      <span className="mt-auto pt-1 text-xs text-white/55">
        {text.topic} · {text.minutes} хв · {count(text.words, WORD)}
      </span>
    </Link>
  )
}
