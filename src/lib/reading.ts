import { useSyncExternalStore } from 'react'
import { contents, texts as indexTexts } from 'virtual:lexo/reading'
import type { ReadingLevel, TextContent, TextMeta } from './content/reading'
import { loadPlacement, studyLevelAfter } from './learningPath'

export { READING_LEVELS, type GlossEntry, type ReadingLevel, type ReadingQuestion, type TextContent, type TextMeta } from './content/reading'

// Graded texts are Markdown files in src/content/reading, prepared by the content plugin (vite/lexoContent.ts):
// the list is always here, a text loads when it is opened.
export const texts = indexTexts as TextMeta[]
export const textBySlug = new Map(texts.map((t) => [t.slug, t]))

const cache = new Map<string, Promise<TextContent>>()

export function loadText(slug: string): Promise<TextContent> {
  let p = cache.get(slug)
  if (!p) {
    p = contents[slug] ? (contents[slug]() as Promise<TextContent>) : Promise.resolve({ paragraphs: [], glossary: [], grammar: [], questions: [] })
    p.catch(() => cache.delete(slug))
    cache.set(slug, p)
  }
  return p
}

/** Texts that practise a grammar topic, for the «У текстах» links on an article. */
export const textsForGrammar = (slug: string) => texts.filter((t) => t.grammar.includes(slug))

/** The reading level that matches the grammar route: the study level, with B1+ counted as B1; null before the test. */
export function studyReadingLevel(): ReadingLevel | null {
  const placement = loadPlacement()
  if (!placement) return null
  const level = studyLevelAfter(placement.passed)
  return (level === 'B1+' ? 'B1' : level) as ReadingLevel
}

// ---- What has been read (per device, like the placement result) ----------------------------------------------

export interface ReadResult {
  /** Right answers to the comprehension questions, out of `total`. */
  score: number
  total: number
  at: string
}

const KEY = 'lexo.reading'
const listeners = new Set<() => void>()

let results: Record<string, ReadResult> = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, ReadResult>
  } catch {
    return {}
  }
})()

export function saveReadResult(slug: string, result: ReadResult) {
  // A better earlier score is kept: re-reading for practice should not lower it.
  const prev = results[slug]
  results = { ...results, [slug]: prev && prev.score > result.score ? { ...prev, at: result.at } : result }
  try {
    localStorage.setItem(KEY, JSON.stringify(results))
  } catch {
    // private mode: remembered until the tab is closed
  }
  listeners.forEach((l) => l())
}

export function useReadResults(): Record<string, ReadResult> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => results,
  )
}
