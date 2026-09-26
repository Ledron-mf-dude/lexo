import type { ComponentProps } from 'react'
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { Link, useNavigate, useParams } from 'react-router-dom'
import LevelBadge from '../components/LevelBadge'
import { MIN_WORDS, wordsForArticle } from '../lib/articleWords'
import { exercises } from '../lib/exercises'
import { topicStats, useExerciseLog } from '../lib/exerciseLog'
import { bySlug } from '../lib/grammar'
import { useTags, useWords } from '../lib/queries'

// Links to other articles are app-internal routes; everything else opens normally.
function ArticleLink({ href = '', children }: ComponentProps<'a'>) {
  return href.startsWith('/grammar/') ? (
    <Link to={href} className="text-accent no-underline hover:underline">
      {children}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

export default function GrammarArticle() {
  const { slug = '' } = useParams()
  const article = bySlug.get(slug)
  const navigate = useNavigate()
  const words = useWords()
  const tags = useTags()
  const log = useExerciseLog()
  const bank = exercises.get(slug)
  const stats = bank ? topicStats(log.data, slug, new Set(bank.map((q) => q.id))) : null
  const topicWords = article && words.data && tags.data ? wordsForArticle(article, words.data, tags.data) : []

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

  const related = article.related.map((s) => bySlug.get(s)).filter((a) => a !== undefined)

  return (
    <article className="space-y-4">
      <Link to="/grammar" className="text-sm text-white/50 hover:text-white">
        ← До статей
      </Link>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/grammar?cat=${encodeURIComponent(article.category)}`}
            className="text-xs tracking-widest text-white/40 uppercase hover:text-white"
          >
            {article.category}
          </Link>
          {article.levels.map((l) => (
            <Link key={l} to={`/grammar?level=${encodeURIComponent(l)}`}>
              <LevelBadge level={l} />
            </Link>
          ))}
        </div>
        <h1 className="text-3xl font-light tracking-tight">{article.title}</h1>
      </div>
      <div className="glass prose prose-invert max-w-none rounded-3xl p-6 prose-headings:font-normal prose-strong:text-white prose-code:text-accent-alt prose-code:before:content-none prose-code:after:content-none prose-th:text-left">
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={{ a: ArticleLink }}>
          {article.body}
        </Markdown>
      </div>

      {bank && stats && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-5">
          <div>
            <p className="font-medium">Вправи до теми: {bank.length} запитань</p>
            <p className="text-sm text-white/45">
              {stats.attempted === 0 ? 'Ще не проходили' : `Опановано ${stats.mastered} з ${bank.length}${stats.mistakes.length > 0 ? ` · помилок ${stats.mistakes.length}` : ''}`}
            </p>
          </div>
          <div className="flex gap-2">
            {stats.mistakes.length > 0 && (
              <button onClick={() => navigate(`/grammar/${slug}/exercises`, { state: { mistakes: true } })} className="btn-ghost">
                Повторити помилки
              </button>
            )}
            <button onClick={() => navigate(`/grammar/${slug}/exercises`)} className="btn-primary">
              Пройти вправи
            </button>
          </div>
        </div>
      )}

      {topicWords.length >= MIN_WORDS && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-5">
          <div>
            <p className="font-medium">Слова за темою у вашому словнику: {topicWords.length}</p>
            <p className="text-sm text-white/45">
              {topicWords
                .slice(0, 6)
                .map((w) => w.term)
                .join(', ')}
              {topicWords.length > 6 && '…'}
            </p>
          </div>
          <button
            onClick={() => navigate('/practice', { state: { wordIds: topicWords.map((w) => w.id), title: article.title.split(/[:(—]/)[0].trim() } })}
            className="btn-primary"
          >
            Практикувати
          </button>
        </div>
      )}

      {related.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm tracking-widest text-white/40 uppercase">Пов'язані статті</h2>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <Link key={r.slug} to={`/grammar/${r.slug}`} className="glass rounded-full px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white">
                {r.title.split(/[:(—]/)[0].trim()}
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}
