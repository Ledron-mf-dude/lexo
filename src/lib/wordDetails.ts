/**
 * A plain-English definition and an example sentence for known words (src/content/wordDetails.json, keyed by the
 * lowercased term). Used to fill empty fields: what the user wrote is never replaced.
 */

export type DetailsDictionary = Record<string, [definition: string, example: string]>

let dictionary: Promise<DetailsDictionary> | null = null

/** ≈110 KB of text: a separate chunk, loaded only where details are offered. */
export function loadWordDetails(): Promise<DetailsDictionary> {
  dictionary ??= import('../content/wordDetails.json').then((m) => m.default as unknown as DetailsDictionary)
  return dictionary
}

export interface Fill {
  definition?: string
  example?: string
}

/** The fields a word would get: only the empty ones, only when the dictionary has something for them. */
export function fillFor(word: { term: string; definition: string | null; example: string | null }, dict: DetailsDictionary): Fill | null {
  const entry = dict[word.term.trim().toLowerCase()]
  if (!entry) return null
  const fill: Fill = {}
  if (!word.definition?.trim() && entry[0]) fill.definition = entry[0]
  if (!word.example?.trim() && entry[1]) fill.example = entry[1]
  return fill.definition || fill.example ? fill : null
}
