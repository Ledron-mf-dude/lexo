import MiniSearch from 'minisearch'

export const LEVELS = ['A1', 'A2', 'B1', 'B1+', 'B2', 'C1'] as const
export type Level = (typeof LEVELS)[number]

export interface Article {
  slug: string
  title: string
  category: string
  tags: string[]
  /** CEFR levels the topic is taught at (a topic often spans several). */
  levels: Level[]
  /** Other names the topic can be referred to by, used to resolve «Title» references. */
  aliases: string[]
  /** Markdown without the front matter; «Title» references to other articles are turned into links. */
  body: string
  /** Plain text used for search and snippets. */
  text: string
  /** Slugs of the articles this one links to. */
  links: string[]
  /** Linked in either direction, for the "related" list. */
  related: string[]
  /** Expressions the article teaches (bold / code / table cells), used to find matching words in the user's vocabulary. */
  terms: string[]
  /** Vocabulary tags that belong to the topic (front matter `wordTags`). */
  wordTags: string[]
}

// Articles are Markdown files in src/content/grammar, bundled at build time (so search is instant and works offline).
const files = import.meta.glob<string>('../content/grammar/*.md', { query: '?raw', import: 'default', eager: true })

function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: raw }
  const meta: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return { meta, body: match[2].trim() }
}

const parseList = (value = '') =>
  value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/** Strips Markdown syntax so search and snippets see readable text. */
function toPlainText(md: string): string {
  return md
    .replace(/&nbsp;/g, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+>]\s+/gm, '')
    .replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, ' ')
    .replace(/[*_|~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---- Cross-references: «Title» -> link ------------------------------------------------------

const normalizeRef = (s: string) =>
  s
    .toLowerCase()
    .replace(/[«»"“”]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/…+$/, '')
    .trim()

/** Shorter names a title can be referred to by: without brackets, before ":" / " — ", and the bracketed part. */
function titleVariants(title: string): string[] {
  const inBrackets = title.match(/\(([^)]+)\)/)?.[1]
  return [
    title,
    title.replace(/\s*\([^)]*\)/g, ''),
    title.split(':')[0],
    title.split(' — ')[0],
    inBrackets ?? '',
  ]
    .map(normalizeRef)
    .filter(Boolean)
}

/** Lower-case, unified apostrophes, no punctuation: the form in which vocabulary terms are compared with article terms. */
export const normalizeTerm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[.,;:!?()"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Bold spans, code spans and table cells (split on , / ;) of an article body. */
function extractTerms(body: string): string[] {
  const found = new Set<string>()
  for (const m of body.matchAll(/\*\*([^*\n]+)\*\*/g)) found.add(normalizeTerm(m[1]))
  for (const m of body.matchAll(/`([^`\n]+)`/g)) found.add(normalizeTerm(m[1]))
  for (const row of body.matchAll(/^\|[^\n]*\|$/gm))
    for (const cell of row[0].split('|')) for (const part of cell.replace(/\*\*/g, '').split(/[,/;]/)) found.add(normalizeTerm(part))
  return [...found].filter((t) => t.length >= 3)
}

interface Draft {
  slug: string
  title: string
  category: string
  tags: string[]
  levels: Level[]
  aliases: string[]
  wordTags: string[]
  body: string
}

const drafts: Draft[] = Object.entries(files).map(([path, raw]) => {
  const slug = path.split('/').pop()!.replace(/\.md$/, '')
  const { meta, body } = parseFrontMatter(raw)
  const levels = parseList(meta['levels']).filter((l): l is Level => (LEVELS as readonly string[]).includes(l))
  return {
    slug,
    title: meta['title'] || slug,
    category: meta['category'] || 'Інше',
    tags: parseList(meta['tags']),
    levels: levels.length > 0 ? levels : ['B1'],
    aliases: parseList(meta['aliases']),
    wordTags: parseList(meta['wordTags']),
    body,
  }
})

// Exact titles and explicit aliases always win; shorter derived names are used only when unambiguous.
const refTargets = new Map<string, string>()
const derived = new Map<string, Set<string>>()
for (const d of drafts) {
  for (const v of titleVariants(d.title)) (derived.get(v) ?? derived.set(v, new Set()).get(v)!).add(d.slug)
}
for (const [name, slugs] of derived) if (slugs.size === 1) refTargets.set(name, [...slugs][0])
for (const d of drafts) {
  refTargets.set(normalizeRef(d.title), d.slug)
  for (const a of d.aliases) refTargets.set(normalizeRef(a), d.slug)
}

function resolveRef(ref: string, self: string): string | null {
  if (ref.length > 80 || /[*_]/.test(ref)) return null
  const slug = refTargets.get(normalizeRef(ref))
  return slug && slug !== self ? slug : null
}

function linkReferences(draft: Draft): { body: string; links: string[] } {
  const links = new Set<string>()
  // Leave code blocks untouched.
  const body = draft.body
    .split(/(```[\s\S]*?```)/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/«([^»\n]+)»/g, (whole, ref: string) => {
            const slug = resolveRef(ref, draft.slug)
            if (!slug) return whole
            links.add(slug)
            return `[«${ref}»](/grammar/${slug})`
          }),
    )
    .join('')
  return { body, links: [...links] }
}

const linked = drafts.map((d) => ({ d, ...linkReferences(d) }))
const incoming = new Map<string, Set<string>>()
for (const { d, links } of linked) for (const to of links) (incoming.get(to) ?? incoming.set(to, new Set()).get(to)!).add(d.slug)

const categoryOrder = (a: Article, b: Article) => a.category.localeCompare(b.category, 'uk') || a.title.localeCompare(b.title, 'uk')

export const articles: Article[] = linked
  .map(({ d, body, links }) => ({
    ...d,
    body,
    text: toPlainText(body),
    links,
    related: [...new Set([...links, ...(incoming.get(d.slug) ?? [])])],
    terms: extractTerms(d.body),
  }))
  .sort(categoryOrder)

export const bySlug = new Map(articles.map((a) => [a.slug, a]))

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
  text: a.text,
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

// Body search is exact / prefix only: fuzzy matching in long texts produces noise.
const bodyIndex = new MiniSearch<Doc>({
  fields: ['text'],
  processTerm,
  searchOptions: { prefix: true, fuzzy: false, combineWith: 'AND', processTerm },
})
bodyIndex.addAll(docs)

export interface Hit {
  article: Article
  /** Fragment of the body around the match (text matches only). */
  snippet: string
}

export interface SearchResult {
  /** Matches by title / topic, name matches first. */
  primary: Hit[]
  /** Matches only in the article text. */
  text: Hit[]
}

function snippet(article: Article, terms: string[]): string {
  const lower = article.text.toLowerCase()
  // Anchor on the longest matched term: short words like "to" occur everywhere and give useless snippets.
  const longest = [...terms].sort((a, b) => b.length - a.length).find((t) => lower.includes(t.toLowerCase()))
  if (!longest) return article.text.slice(0, 140)
  const at = lower.indexOf(longest.toLowerCase())
  const start = Math.max(0, at - 50)
  return `${start > 0 ? '…' : ''}${article.text.slice(start, start + 160)}${start + 160 < article.text.length ? '…' : ''}`
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

  const text = bodyIndex
    .search(q)
    .filter((r) => !seen.has(r.id as string))
    .slice(0, 20)
    .map((r) => ({ article: bySlug.get(r.id as string)!, snippet: snippet(bySlug.get(r.id as string)!, r.terms) }))

  return {
    primary: primary.map((p) => ({ article: bySlug.get(p.r.id as string)!, snippet: '' })),
    text,
  }
}
