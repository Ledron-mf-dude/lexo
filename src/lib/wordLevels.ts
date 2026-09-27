import { useEffect, useState } from 'react'

/**
 * CEFR level of built-in words (src/content/wordLevels.json, keyed by the lowercased term). The levels are this
 * project's own estimate, not Cambridge's English Vocabulary Profile. Personal sentences, names and narrow jargon
 * have no level; neither have words added later that are not in the built-in list.
 */

export const WORD_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export type WordLevel = (typeof WORD_LEVELS)[number]
/** Filter value for words the dictionary gives no level. */
export const NO_LEVEL = 'none'
export type LevelFilter = WordLevel | typeof NO_LEVEL

export type LevelDictionary = Record<string, WordLevel>

let dictionary: Promise<LevelDictionary> | null = null

export function loadWordLevels(): Promise<LevelDictionary> {
  dictionary ??= import('../content/wordLevels.json').then((m) => m.default as unknown as LevelDictionary)
  return dictionary
}

/** The level dictionary, or null while it loads (then levels are simply not shown yet). */
export function useWordLevels(): LevelDictionary | null {
  const [levels, setLevels] = useState<LevelDictionary | null>(null)
  useEffect(() => {
    let live = true
    loadWordLevels().then((d) => live && setLevels(d), () => {})
    return () => {
      live = false
    }
  }, [])
  return levels
}

export const levelOf = (term: string, levels: LevelDictionary | null): WordLevel | undefined => levels?.[term.trim().toLowerCase()]

export const matchesLevel = (term: string, levels: LevelDictionary | null, filter: LevelFilter[]): boolean =>
  filter.length === 0 || filter.includes(levelOf(term, levels) ?? NO_LEVEL)
