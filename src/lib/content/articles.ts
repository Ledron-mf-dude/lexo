// Parsing of grammar articles. Pure functions with no browser or Vite APIs: the content plugin
// (vite/lexoContent.ts) runs them at build time, so the app ships ready metadata and loads bodies lazily.

export const LEVELS = ['A1', 'A2', 'B1', 'B1+', 'B2', 'C1'] as const
export type Level = (typeof LEVELS)[number]

/** Article metadata, always in the bundle. The body is loaded on demand (`loadArticleBody` in lib/grammar.ts). */
export interface Article {
  slug: string
  title: string
  category: string
  tags: string[]
  /** CEFR levels the topic is taught at (a topic often spans several). */
  levels: Level[]
  /** Other names the topic can be referred to by, used to resolve «Title» references. */
  aliases: string[]
  /** Slugs of the articles this one links to. */
  links: string[]
  /** Linked in either direction, for the "related" list. */
  related: string[]
  /** Vocabulary tags that belong to the topic (front matter `wordTags`). */
  wordTags: string[]
}

/** The part of an article that loads with it. */
export interface ArticleContent {
  /** Markdown without the front matter; «Title» references to other articles are turned into links. */
  body: string
  /** Expressions the article teaches (bold / code / table cells), used to find matching words in the user's vocabulary. */
  terms: string[]
}

export interface ParsedArticles {
  articles: Article[]
  contents: Map<string, ArticleContent>
  /** Plain text for full-text search and snippets. */
  texts: Map<string, string>
}

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
  return [title, title.replace(/\s*\([^)]*\)/g, ''), title.split(':')[0], title.split(' — ')[0], inBrackets ?? '']
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

const categoryOrder = (a: Article, b: Article) => a.category.localeCompare(b.category, 'uk') || a.title.localeCompare(b.title, 'uk')

/** Parses all articles (`slug` -> raw Markdown with front matter) and links their «Title» references. */
export function parseArticles(files: [slug: string, raw: string][]): ParsedArticles {
  const drafts: Draft[] = files.map(([slug, raw]) => {
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
  for (const d of drafts) for (const v of titleVariants(d.title)) (derived.get(v) ?? derived.set(v, new Set()).get(v)!).add(d.slug)
  for (const [name, slugs] of derived) if (slugs.size === 1) refTargets.set(name, [...slugs][0])
  for (const d of drafts) {
    refTargets.set(normalizeRef(d.title), d.slug)
    for (const a of d.aliases) refTargets.set(normalizeRef(a), d.slug)
  }

  const resolveRef = (ref: string, self: string): string | null => {
    if (ref.length > 80 || /[*_]/.test(ref)) return null
    const slug = refTargets.get(normalizeRef(ref))
    return slug && slug !== self ? slug : null
  }

  const linked = drafts.map((d) => {
    const links = new Set<string>()
    // Leave code blocks untouched.
    const body = d.body
      .split(/(```[\s\S]*?```)/)
      .map((part, i) =>
        i % 2 === 1
          ? part
          : part.replace(/«([^»\n]+)»/g, (whole, ref: string) => {
              const slug = resolveRef(ref, d.slug)
              if (!slug) return whole
              links.add(slug)
              return `[«${ref}»](/grammar/${slug})`
            }),
      )
      .join('')
    return { d, body, links: [...links] }
  })
  const incoming = new Map<string, Set<string>>()
  for (const { d, links } of linked) for (const to of links) (incoming.get(to) ?? incoming.set(to, new Set()).get(to)!).add(d.slug)

  const contents = new Map<string, ArticleContent>()
  const texts = new Map<string, string>()
  const articles: Article[] = linked
    .map(({ d, body, links }) => {
      contents.set(d.slug, { body, terms: extractTerms(d.body) })
      texts.set(d.slug, toPlainText(body))
      const { body: _raw, ...meta } = d
      void _raw
      return { ...meta, links, related: [...new Set([...links, ...(incoming.get(d.slug) ?? [])])] }
    })
    .sort(categoryOrder)
  return { articles, contents, texts }
}
