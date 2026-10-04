import MiniSearch from 'minisearch'
import { articles as indexArticles, contents, loadSearch } from 'virtual:lexo/grammar'
import { LEVELS, type Article, type ArticleContent, type Level } from './content/articles'

export { LEVELS, normalizeTerm, type Article, type ArticleContent, type Level } from './content/articles'

// Articles are Markdown files in src/content/grammar. The content plugin (vite/lexoContent.ts) parses them at build
// time: their metadata is always here, the body and terms load when the article is opened, full-text search on the first query.
export const articles = indexArticles as Article[]

export const bySlug = new Map(articles.map((a) => [a.slug, a]))

const contentCache = new Map<string, Promise<ArticleContent>>()

/** The article's Markdown («Title» references already turned into links) and terms; cached, so it loads once per session. */
export function loadArticle(slug: string): Promise<ArticleContent> {
  let p = contentCache.get(slug)
  if (!p) {
    p = contents[slug] ? contents[slug]() : Promise.resolve({ body: '', terms: [] })
    // A failed load (offline before the chunk was cached) is retried next time instead of being remembered.
    p.catch(() => contentCache.delete(slug))
    contentCache.set(slug, p)
  }
  return p
}

// ---- Levels and categories ------------------------------------------------------------------

export const levelIndex = (level: Level) => LEVELS.indexOf(level)
/** The level a learner first meets the topic at. */
export const startLevel = (a: Article): Level => [...a.levels].sort((x, y) => levelIndex(x) - levelIndex(y))[0]

export const categories: { name: string; count: number }[] = [...new Set(articles.map((a) => a.category))]
  .sort((a, b) => a.localeCompare(b, 'uk'))
  .map((name) => ({ name, count: articles.filter((a) => a.category === name).length }))

export const levelCounts: Record<Level, number> = Object.fromEntries(
  LEVELS.map((l) => [l, articles.filter((a) => a.levels.includes(l)).length]),
) as Record<Level, number>

// ---- Search ---------------------------------------------------------------------------------
// Ranking is by topic, not by how often a word occurs in the text:
//   1. titles, aliases, tags and categories (name matches first),
//   2. a separate, lower list of articles that only mention the words in their body.

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'is', 'are', 'be', 'and', 'or', 'for', 'і', 'в', 'на', 'з', 'та', 'що', 'як', 'до'])
const processTerm = (term: string) => (STOP.has(term.toLowerCase()) ? null : term.toLowerCase())

type Doc = { id: string; title: string; aliasText: string; tagText: string; category: string; text: string }
const docs: Doc[] = articles.map((a) => ({
  id: a.slug,
  title: a.title,
  aliasText: a.aliases.join(' '),
  tagText: a.tags.join(' '),
  category: a.category,
  text: '',
}))

const metaIndex = new MiniSearch<Doc>({
  fields: ['title', 'aliasText', 'tagText', 'category'],
  processTerm,
  searchOptions: {
    boost: { title: 6, aliasText: 5, tagText: 2.5, category: 1 },
    prefix: true,
    fuzzy: (term) => (term.length >= 5 ? 0.15 : false),
    combineWith: 'AND',
    processTerm,
  },
})
metaIndex.addAll(docs)

// Body search is exact / prefix only: fuzzy matching in long texts produces noise. The texts load on the first search.
let bodyIndex: MiniSearch<Doc> | null = null
const texts = new Map<string, string>()
let bodyLoad: Promise<void> | null = null

/** Loads the article texts for «Згадується в тексті статей»; until then a search finds titles and topics only. */
export function loadTextSearch(): Promise<void> {
  bodyLoad ??= loadSearch().then(
    (rows) => {
      for (const [slug, text] of rows) texts.set(slug, text)
      const index = new MiniSearch<Doc>({
        fields: ['text'],
        processTerm,
        searchOptions: { prefix: true, fuzzy: false, combineWith: 'AND', processTerm },
      })
      index.addAll(docs.map((d) => ({ ...d, text: texts.get(d.id) ?? '' })))
      bodyIndex = index
    },
    () => {
      bodyLoad = null
    },
  )
  return bodyLoad
}

export const textSearchReady = () => bodyIndex !== null

export interface Hit {
  article: Article
  /** Fragment of the body around the match (text matches only). */
  snippet: string
}

export interface SearchResult {
  /** Matches by title / topic, name matches first. */
  primary: Hit[]
  /** Matches only in the article text (empty until `loadTextSearch` has finished). */
  text: Hit[]
}

function snippet(article: Article, terms: string[]): string {
  const text = texts.get(article.slug) ?? ''
  const lower = text.toLowerCase()
  // Anchor on the longest matched term: short words like "to" occur everywhere and give useless snippets.
  const longest = [...terms].sort((a, b) => b.length - a.length).find((t) => lower.includes(t.toLowerCase()))
  if (!longest) return text.slice(0, 140)
  const at = lower.indexOf(longest.toLowerCase())
  const start = Math.max(0, at - 50)
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 160)}${start + 160 < text.length ? '…' : ''}`
}

export function searchArticles(query: string): SearchResult {
  const q = query.trim()
  if (!q) return { primary: articles.map((article) => ({ article, snippet: '' })), text: [] }

  // Exact / prefix matches first; typo tolerance only when that finds nothing ("would" must not pull in "could").
  let metaResults = metaIndex.search(q, { fuzzy: false })
  if (metaResults.length === 0) metaResults = metaIndex.search(q)

  const primary = metaResults
    .map((r) => {
      // How many query terms were found in the title / aliases themselves.
      const nameTerms = Object.values(r.match).filter((fields) => fields.includes('title') || fields.includes('aliasText')).length
      return { r, nameTerms }
    })
    .sort((x, y) => y.nameTerms - x.nameTerms || y.r.score - x.r.score)
  const seen = new Set(primary.map((p) => p.r.id as string))

  const text = (bodyIndex?.search(q) ?? [])
    .filter((r) => !seen.has(r.id as string))
    .slice(0, 20)
    .map((r) => ({ article: bySlug.get(r.id as string)!, snippet: snippet(bySlug.get(r.id as string)!, r.terms) }))

  return {
    primary: primary.map((p) => ({ article: bySlug.get(p.r.id as string)!, snippet: '' })),
    text,
  }
}
