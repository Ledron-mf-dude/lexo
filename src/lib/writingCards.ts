import type { Item } from './exercises'

/**
 * Personal «find the mistake» cards made from the learner's own writing: the sentence as written and as corrected.
 * Kept per browser; answers are logged under the pseudo-topic `my-writing`, like any other exercise.
 */

export const MY_WRITING = 'my-writing'

export interface WritingCard {
  id: string
  wrong: string
  right: string
  why: string
  slug: string | null
  date: string
}

const KEY = 'lexo.writing.cards'

export function loadCards(): WritingCard[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as WritingCard[]
  } catch {
    return []
  }
}

function hash(text: string): string {
  let h = 5381
  for (const ch of text) h = ((h << 5) + h + ch.charCodeAt(0)) | 0
  return (h >>> 0).toString(36)
}

/** Adds cards, skipping sentences already saved. Returns how many were new. */
export function addCards(cards: Omit<WritingCard, 'id' | 'date'>[]): number {
  const saved = loadCards()
  const ids = new Set(saved.map((c) => c.id))
  const fresh = cards
    .map((c) => ({ ...c, id: `w-${hash(c.wrong)}`, date: new Date().toISOString() }))
    .filter((c) => !ids.has(c.id) && ids.add(c.id))
  try {
    localStorage.setItem(KEY, JSON.stringify([...fresh, ...saved].slice(0, 500)))
  } catch {
    return 0
  }
  return fresh.length
}

export function removeCard(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadCards().filter((c) => c.id !== id)))
  } catch {
    // nothing to do
  }
}

/** The cards as quiz items («Знайди помилку» questions). */
export const cardItems = (): Item[] =>
  loadCards().map((c) => ({ slug: MY_WRITING, q: { id: c.id, type: 'fix', wrong: c.wrong, answer: [c.right], why: c.why } }))
