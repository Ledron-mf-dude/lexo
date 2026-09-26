import { normalize } from './text'

/** `hint`: an optional line under the question (the base verb, a translation of the sentence to build, what to change). */
export type Question =
  | { id: string; type: 'choice'; q: string; options: string[]; answer: number; why: string; hint?: string }
  | { id: string; type: 'fill'; q: string; answer: string[]; why: string; hint?: string }
  | { id: string; type: 'order'; words: string[]; answer: string[]; why: string; hint?: string }

/** A question together with the topic it belongs to (mixed practice draws from several topics). */
export interface Item {
  slug: string
  q: Question
}

// Question banks are JSON files in src/content/exercises, one per article slug (bundled, works offline).
const files = import.meta.glob<{ questions: unknown[] }>('../content/exercises/*.json', { eager: true, import: 'default' })

function isQuestion(x: unknown): x is Question {
  const q = x as Partial<Question> & Record<string, unknown>
  if (!q || typeof q.id !== 'string' || typeof q.why !== 'string') return false
  if (q.hint !== undefined && typeof q.hint !== 'string') return false
  if (q.type === 'choice') return typeof q.q === 'string' && Array.isArray(q.options) && typeof q.answer === 'number' && q.answer < q.options.length
  if (q.type === 'fill') return typeof q.q === 'string' && Array.isArray(q.answer) && q.answer.length > 0
  if (q.type === 'order') return Array.isArray(q.words) && Array.isArray(q.answer) && q.answer.length > 0
  return false
}

export const exercises = new Map<string, Question[]>()
for (const [path, data] of Object.entries(files)) {
  const slug = path.split('/').pop()!.replace(/\.json$/, '')
  const valid = (data.questions ?? []).filter((q) => {
    const ok = isQuestion(q)
    if (!ok) console.warn(`Invalid exercise skipped in ${slug}:`, q)
    return ok
  }) as Question[]
  if (valid.length > 0) exercises.set(slug, valid)
}

export const questionCount = [...exercises.values()].reduce((n, qs) => n + qs.length, 0)

export const itemsOf = (slug: string): Item[] => (exercises.get(slug) ?? []).map((q) => ({ slug, q }))

/** Text answers: case, extra spaces, curly apostrophes and punctuation (commas, full stops, question marks) do not matter. */
const canon = (s: string) => normalize(s.replace(/[.,!?;:]/g, ' '))

export function isCorrectText(input: string, accepted: string[]): boolean {
  const a = canon(input)
  return a !== '' && accepted.some((x) => canon(x) === a)
}

/** Human-readable correct answer, shown after a wrong attempt. */
export function correctAnswer(q: Question): string {
  if (q.type === 'choice') return q.options[q.answer]
  return q.answer[0]
}

export function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Choice questions are the most numerous; this rhythm mixes in typing and sentence building whenever the pool has them.
const RHYTHM: Question['type'][] = ['choice', 'fill', 'choice', 'order', 'fill']

/** A deck of `size` questions with the exercise types interleaved rather than clumped. */
export function drawDeck(pool: Item[], size: number): Item[] {
  const buckets = new Map<Question['type'], Item[]>()
  for (const item of shuffle(pool)) buckets.set(item.q.type, [...(buckets.get(item.q.type) ?? []), item])
  const deck: Item[] = []
  for (let i = 0; deck.length < Math.min(size, pool.length); i++) {
    const wanted = buckets.get(RHYTHM[i % RHYTHM.length])
    const from = wanted?.length ? wanted : [...buckets.values()].find((b) => b.length > 0)!
    deck.push(from.shift()!)
  }
  return deck
}
