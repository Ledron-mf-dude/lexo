import { use } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ArticleMarkdown from '../components/ArticleMarkdown'
import LevelBadge from '../components/LevelBadge'
import { MIN_WORDS, wordsForArticle } from '../lib/articleWords'
import { exerciseIds } from '../lib/exercises'
import { topicStats, useExerciseLog } from '../lib/exerciseLog'
import { bySlug, loadArticle } from '../lib/grammar'
import { topicStatus } from '../lib/learningPath'
import { useTags, useWords } from '../lib/queries'
import { count, QUESTION } from '../lib/plural'
import { articleSections, headingId } from '../lib/articleText'
import { articleSummaryPref } from '../lib/prefs'
import { useTitle } from '../lib/useTitle'
import { textsForGrammar } from '../lib/reading'

export default function GrammarArticle() {
  const { slug = '' } = useParams()
  const article = bySlug.get(slug)
  useTitle(article?.title.split(/[:(—]/)[0].trim())
  const navigate = useNavigate()
  const words = useWords()
  const tags = useTags()
  const log = useExerciseLog()
  const summaryOpen = articleSummaryPref.use() === 'open'
  const bank = exerciseIds.get(slug)
  const stats = bank ? topicStats(log.data, slug, new Set(bank)) : null

  if (!article) {
    return (
      <section className="space-y-4">
        <Link to="/grammar" className="text-sm text-white/50 hover:text-white">
          ← До статей
        </Link>
        <p className="glass rounded-3xl p-8 text-center text-white/50">Статтю не знайдено.</p>
      </section>
    )
  }

  // The body loads with the article (the route's Suspense shows «Завантаження…» the first time).
  const content = use(loadArticle(slug))
  const fullBody = content.body
  const topicWords = words.data && tags.data ? wordsForArticle(article, content, words.data, tags.data) : []
  // «Як вибрати» is the article's cheat sheet: it opens the page as «Коротко» instead of closing it.
  const summary = articleSections(fullBody).find((s) => s.title === 'Як вибрати')
  const body = summary ? fullBody.replace(summary.body, '') : fullBody

  const inTexts = textsForGrammar(article.slug)
  const related = article.related.map((s) => bySlug.get(s)).filter((a) => a !== undefined)
  // Short chip labels ("Модальні дієслова"), unless two related articles would get the same one.
  const short = (title: string) => title.split(/[:(—]/)[0].trim()
  const label = (title: string) => (related.filter((r) => short(r.title) === short(title)).length > 1 ? title : short(title))
  const sections = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1].replace(/[*`]/g, '').trim())

  return (
    <article className="space-y-4">
      <Link to="/grammar" className="text-sm text-white/50 hover:text-white">
        ← До статей
      </Link>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/grammar?cat=${encodeURIComponent(article.category)}`}
            className="text-xs tracking-widest text-white/55 uppercase hover:text-white"
          >
            {article.category}
          </Link>
          {article.levels.map((l) => (
            <Link key={l} to={`/grammar?level=${encodeURIComponent(l)}`}>
              <LevelBadge level={l} />
            </Link>
          ))}
          {bank && (
            // The exercises are also at the end of the article; this shortcut saves scrolling through it on a repeat visit.
            <Link to={`/grammar/${slug}/exercises`} className="ml-auto rounded-full border border-accent/40 px-3 py-1 text-xs text-accent transition-colors hover:bg-accent/10">
              Вправи · {bank.length}
            </Link>
          )}
        </div>
        <h1 className="text-2xl font-light tracking-tight break-words sm:text-3xl">{article.title}</h1>
      </div>
      {sections.length >= 4 && (
        <nav aria-label="Зміст" className="chip-row">
          {sections.map((title) => (
            <button
              key={title}
              onClick={() => document.getElementById(headingId(title))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${title.startsWith('Типові помилки') ? 'border-bad/30 text-bad/80 hover:text-bad' : 'border-white/12 text-white/55 hover:text-white'}`}
            >
              {title}
            </button>
          ))}
        </nav>
      )}
      {summary && (
        <details
          open={summaryOpen}
          onToggle={(e) => articleSummaryPref.set(e.currentTarget.open ? 'open' : 'closed')}
          className="glass rounded-2xl px-4 py-3"
        >
          <summary className="cursor-pointer text-sm font-medium text-accent">Коротко: як вибрати</summary>
          <div className="mt-2">
            <ArticleMarkdown body={summary.body.replace(/^## .*\r?\n/, '')} />
          </div>
        </details>
      )}
      <ArticleMarkdown body={body} />

      {bank && stats && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4 sm:p-5">
          <div>
            <p className="font-medium">Вправи до теми: {count(bank.length, QUESTION)}</p>
            <p className="text-sm text-white/60">
              {stats.attempted === 0
                ? 'Ще не проходили'
                : [
                    topicStatus({ mastered: stats.mastered, attempted: stats.attempted, total: bank.length }) === 'done' ? '✓ Тему засвоєно' : `Правильно ${stats.mastered} з ${bank.length}`,
                    stats.mistakes.length > 0 && `помилок ${stats.mistakes.length}`,
                    // Unseen questions come first in the next round, so «21 of 22» is closed by simply going on.
                    stats.attempted < bank.length && `ще не бачили ${bank.length - stats.attempted}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
          </div>
          <div className="flex w-full gap-2 *:flex-1 sm:w-auto sm:*:flex-none">
            {stats.mistakes.length > 0 && (
              <button onClick={() => navigate(`/grammar/${slug}/exercises`, { state: { mistakes: true } })} className="btn-ghost">
                Повторити помилки
              </button>
            )}
            <button onClick={() => navigate(`/grammar/${slug}/exercises`)} className="btn-primary">
              {stats.attempted === 0 || stats.attempted === bank.length ? 'Пройти вправи' : 'Продовжити'}
            </button>
          </div>
        </div>
      )}

      {topicWords.length >= MIN_WORDS && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4 sm:p-5">
          <div>
            <p className="font-medium">Слова за темою у вашому словнику: {topicWords.length}</p>
            <p className="text-sm text-white/60">
              {topicWords
                .slice(0, 6)
                .map((w) => w.term)
                .join(', ')}
              {topicWords.length > 6 && '…'}
            </p>
          </div>
          <button
            onClick={() => navigate('/practice', { state: { wordIds: topicWords.map((w) => w.id), title: article.title.split(/[:(—]/)[0].trim() } })}
            className="btn-primary w-full sm:w-auto"
          >
            Практикувати
          </button>
        </div>
      )}

      {inTexts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm tracking-widest text-white/55 uppercase">Тема в текстах</h2>
          <div className="flex flex-wrap gap-2">
            {inTexts.map((t) => (
              <Link key={t.slug} to={`/reading/${t.slug}`} className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white">
                <span className="text-[11px] text-white/55">{t.level}</span> {t.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      {related.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm tracking-widest text-white/55 uppercase">Пов'язані статті</h2>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <Link key={r.slug} to={`/grammar/${r.slug}`} className="glass rounded-full px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white">
                {label(r.title)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}
