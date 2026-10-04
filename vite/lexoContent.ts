import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { parseArticles, type ArticleContent } from '../src/lib/content/articles.ts'
import { mistakeQuestions, validQuestions, type Question } from '../src/lib/content/questions.ts'

/**
 * Grammar articles and exercise banks as virtual modules, prepared at build time.
 *
 *  - `virtual:lexo/grammar`   article metadata (always loaded) and a loader per article (body and terms) and for full-text search;
 *  - `virtual:lexo/exercises` question ids per topic (enough for progress everywhere) and a loader per topic bank;
 *  - `virtual:lexo/article/<slug>`, `virtual:lexo/bank/<slug>`, `virtual:lexo/search`: the lazily loaded parts.
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
}

export function lexoContent(root = process.cwd()): Plugin {
  const grammarDir = resolve(root, 'src/content/grammar')
  const exercisesDir = resolve(root, 'src/content/exercises')
  let cache: Content | null = null

  function build(warn: (msg: string) => void): Content {
    const files = readdirSync(grammarDir)
      .filter((f) => f.endsWith('.md'))
      .map((f): [string, string] => [f.replace(/\.md$/, ''), readFileSync(join(grammarDir, f), 'utf8')])
    const { articles, contents, texts } = parseArticles(files)

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
      search: `export default ${JSON.stringify([...texts])}`,
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
      if (path.startsWith('article/')) return `export default ${JSON.stringify(cache.articles.get(path.slice(8)) ?? { body: '', terms: [] })}`
      if (path.startsWith('bank/')) return `export default ${JSON.stringify(cache.banks.get(path.slice(5)) ?? [])}`
    },
    // Editing an article or a bank in dev rebuilds the content and reloads the page.
    handleHotUpdate({ file, server }) {
      const f = file.replace(/\\/g, '/')
      if (!f.includes('/src/content/grammar/') && !f.includes('/src/content/exercises/')) return
      cache = null
      for (const mod of server.moduleGraph.idToModuleMap.values()) if (mod.id?.startsWith(RESOLVED)) server.moduleGraph.invalidateModule(mod)
      server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}
