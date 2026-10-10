import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { parseArticles, type ArticleContent } from '../src/lib/content/articles.ts'
import { mistakeQuestions, validQuestions, type Question } from '../src/lib/content/questions.ts'
import { parseTexts, type TextContent } from '../src/lib/content/reading.ts'

/**
 * Grammar articles and exercise banks as virtual modules, prepared at build time.
 *
 *  - `virtual:lexo/grammar`   article metadata (always loaded) and a loader per article (body and terms) and for full-text search;
 *  - `virtual:lexo/exercises` question ids per topic (enough for progress everywhere) and a loader per topic bank;
 *  - `virtual:lexo/reading`   reading-text metadata and a loader per text;
 *  - `virtual:lexo/article/<slug>`, `virtual:lexo/bank/<slug>`, `virtual:lexo/text/<slug>`, `virtual:lexo/search`: the lazily loaded parts.
 *
 * So the Grammar page loads a small index instead of every article and question, and a topic loads only its own text.
 */

const PREFIX = 'virtual:lexo/'
const RESOLVED = '\0' + PREFIX

interface Content {
  grammar: string
  exercises: string
  articles: Map<string, ArticleContent>
  banks: Map<string, Question[]>
  search: string
  reading: string
  texts: Map<string, TextContent>
}

/** A glossary term or one of its listed forms appears in the text (the first word may carry an ending). */
function appearsIn(text: string, term: string, forms: string[]): boolean {
  return [term, ...forms].some((t) => {
    const words = t.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/\s+/).filter((w) => w && !/^(sth|sb|one's)$/.test(w))
    if (words.length === 0) return false
    const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = words.map((w, i) => (i === 0 && w.length > 3 ? `${esc(w.replace(/[ey]$/, ''))}\\w*` : esc(w))).join(String.raw`[\s\w'’-]*?\s`)
    return new RegExp(String.raw`\b` + re, 'i').test(text)
  })
}

export function lexoContent(root = process.cwd()): Plugin {
  const grammarDir = resolve(root, 'src/content/grammar')
  const exercisesDir = resolve(root, 'src/content/exercises')
  const readingDir = resolve(root, 'src/content/reading')
  let cache: Content | null = null

  function build(warn: (msg: string) => void): Content {
    const files = readdirSync(grammarDir)
      .filter((f) => f.endsWith('.md'))
      .map((f): [string, string] => [f.replace(/\.md$/, ''), readFileSync(join(grammarDir, f), 'utf8')])
    const { articles, contents, texts: searchTexts } = parseArticles(files)

    const banks = new Map<string, Question[]>()
    for (const f of readdirSync(exercisesDir).filter((f) => f.endsWith('.json'))) {
      const slug = f.replace(/\.json$/, '')
      const data = JSON.parse(readFileSync(join(exercisesDir, f), 'utf8')) as { questions?: unknown[] }
      const valid = validQuestions(data, (q) => warn(`Invalid exercise skipped in ${slug}: ${JSON.stringify(q).slice(0, 200)}`))
      if (valid.length > 0) banks.set(slug, valid)
    }
    // «Знайди помилку» comes from the «Типові помилки» lines of each article.
    for (const [slug, { body }] of contents) {
      const fixes = mistakeQuestions(body)
      if (fixes.length > 0) banks.set(slug, [...(banks.get(slug) ?? []), ...fixes])
    }

    const readingFiles = readdirSync(readingDir)
      .filter((f) => f.endsWith('.md'))
      .map((f): [string, string] => [f.replace(/\.md$/, ''), readFileSync(join(readingDir, f), 'utf8')])
    const { metas, contents: texts } = parseTexts(readingFiles, warn)
    const slugs = new Set(articles.map((a) => a.slug))
    for (const [slug, t] of texts) {
      const full = t.paragraphs.join(' ')
      for (const g of t.grammar) if (!slugs.has(g.slug)) warn(`reading/${slug}: no grammar article «${g.slug}»`)
      for (const g of t.glossary) if (!appearsIn(full, g.term, g.forms)) warn(`reading/${slug}: glossary term not in the text: ${g.term}`)
    }

    const loader = (kind: string, slug: string) => `${JSON.stringify(slug)}: () => import(${JSON.stringify(`${PREFIX}${kind}/${slug}`)}).then((m) => m.default)`
    const ids = Object.fromEntries([...banks].map(([slug, qs]) => [slug, qs.map((q) => q.id)]))
    const types = Object.fromEntries([...banks].map(([slug, qs]) => [slug, qs.filter((q) => q.type === 'fix').length]))
    return {
      grammar: [
        `export const articles = ${JSON.stringify(articles)}`,
        `export const contents = {${[...contents.keys()].map((s) => loader('article', s)).join(',\n')}}`,
        `export const loadSearch = () => import(${JSON.stringify(`${PREFIX}search`)}).then((m) => m.default)`,
      ].join('\n'),
      exercises: [
        `export const ids = ${JSON.stringify(ids)}`,
        `export const fixes = ${JSON.stringify(types)}`,
        `export const banks = {${[...banks.keys()].map((s) => loader('bank', s)).join(',\n')}}`,
      ].join('\n'),
      articles: contents,
      banks,
      search: `export default ${JSON.stringify([...searchTexts])}`,
      reading: [
        `export const texts = ${JSON.stringify(metas)}`,
        `export const contents = {${metas.map((m) => loader('text', m.slug)).join(',\n')}}`,
      ].join('\n'),
      texts,
    }
  }

  return {
    name: 'lexo-content',
    resolveId(id) {
      if (id.startsWith(PREFIX)) return '\0' + id
    },
    load(id) {
      if (!id.startsWith(RESOLVED)) return
      cache ??= build((msg) => this.warn(msg))
      const path = id.slice(RESOLVED.length)
      if (path === 'grammar') return cache.grammar
      if (path === 'exercises') return cache.exercises
      if (path === 'search') return cache.search
      if (path === 'reading') return cache.reading
      if (path.startsWith('text/')) return `export default ${JSON.stringify(cache.texts.get(path.slice(5)) ?? { paragraphs: [], glossary: [], grammar: [], questions: [] })}`
      if (path.startsWith('article/')) return `export default ${JSON.stringify(cache.articles.get(path.slice(8)) ?? { body: '', terms: [] })}`
      if (path.startsWith('bank/')) return `export default ${JSON.stringify(cache.banks.get(path.slice(5)) ?? [])}`
    },
    // Editing an article, a bank or a reading text in dev rebuilds the content and reloads the page.
    handleHotUpdate({ file, server }) {
      const f = file.replace(/\\/g, '/')
      if (!['grammar', 'exercises', 'reading'].some((dir) => f.includes(`/src/content/${dir}/`))) return
      cache = null
      for (const mod of server.moduleGraph.idToModuleMap.values()) if (mod.id?.startsWith(RESOLVED)) server.moduleGraph.invalidateModule(mod)
      server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}
