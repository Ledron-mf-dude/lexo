import { banks, fixes, ids } from 'virtual:lexo/exercises'
import { canon, type Question } from './content/questions'

export type { Question } from './content/questions'

/** A question together with the topic it belongs to (mixed practice draws from several topics). */
export interface Item {
  slug: string
  q: Question
}

// Question banks are JSON files in src/content/exercises, one per article slug, plus the «Знайди помилку» pairs of
// each article. The content plugin (vite/lexoContent.ts) validates them at build time. The ids of every topic are
// always here (progress and statuses need only them); the questions of a topic load when it is practised.

/** Question ids per topic. */
export const exerciseIds = new Map(Object.entries(ids))

export const fixCount = Object.values(fixes).reduce((n, k) => n + k, 0)

export const questionCount = [...exerciseIds.values()].reduce((n, qs) => n + qs.length, 0)

/** Banks loaded so far. `itemsOf` reads from here, so a page loads its topics first: `use(loadQuestions(slugs))`. */
const loaded = new Map<string, Question[]>()
const pending = new Map<string, Promise<void>>()

function loadBank(slug: string): Promise<void> {
  let p = pending.get(slug)
  if (!p) {
    p = banks[slug]
      ? banks[slug]().then(
          (qs) => void loaded.set(slug, qs as Question[]),
          (e: unknown) => {
            // Offline before the chunk was cached: try again on the next visit.
            pending.delete(slug)
            throw e
          },
        )
      : Promise.resolve()
    pending.set(slug, p)
  }
  return p
}

const groupCache = new Map<string, Promise<void>>()

/** Loads the banks of these topics; every topic a page draws questions from must be listed. */
export function loadQuestions(slugs: string[]): Promise<void> {
  const key = [...new Set(slugs)].sort().join(',')
  let p = groupCache.get(key)
  if (!p) {
    p = Promise.all(slugs.map(loadBank)).then(() => undefined)
    p.catch(() => groupCache.delete(key))
    groupCache.set(key, p)
  }
  return p
}

/** The loaded questions of a topic; empty if the bank has not been loaded. */
export const bankOf = (slug: string): Question[] => {
  const qs = loaded.get(slug)
  if (!qs && import.meta.env.DEV && exerciseIds.has(slug)) console.warn(`Bank ${slug} used before it was loaded`)
  return qs ?? []
}

export const itemsOf = (slug: string): Item[] => bankOf(slug).map((q) => ({ slug, q }))

export function isCorrectText(input: string, accepted: string[]): boolean {
  const a = canon(input)
  return a !== '' && accepted.some((x) => canon(x) === a)
}

/** The line that stands for the question in the review of mistakes. */
export function promptOf(q: Question): string {
  if (q.type === 'order') return q.hint ?? q.words.join(' / ')
  if (q.type === 'fix') return q.showRight ? q.answer[0] : q.wrong
  return q.q
}

/** Human-readable correct answer, shown after a wrong attempt. */
export function correctAnswer(q: Question): string {
  if (q.type === 'choice') return q.options[q.answer]
  if (q.type === 'fix' && q.showRight) return 'Речення правильне'
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
const RHYTHM: Question['type'][] = ['choice', 'fill', 'fix', 'choice', 'order', 'fill']

/** The latest answer per `slug/id` (see `answerHistory`); a question absent from it was never shown. */
export type History = Map<string, { at: number; correct: boolean }>

export const isUnseen = (item: Item, history: History) => !history.has(`${item.slug}/${item.q.id}`)

/**
 * The pool in the order questions should be offered: never shown first (in random order), then those whose latest
 * answer was wrong, then the rest, longest unseen first. A topic is thus covered in full before anything repeats,
 * instead of a random draw that keeps missing the last unanswered question.
 */
export function prioritize(pool: Item[], history: History): Item[] {
  const tier = (i: Item) => {
    const last = history.get(`${i.slug}/${i.q.id}`)
    return last === undefined ? 0 : last.correct ? 2 : 1
  }
  const at = (i: Item) => history.get(`${i.slug}/${i.q.id}`)?.at ?? 0
  return shuffle(pool).sort((a, b) => tier(a) - tier(b) || (tier(a) === 2 ? at(a) - at(b) : 0))
}

/** The same questions with the exercise types interleaved rather than clumped. */
function interleave(items: Item[]): Item[] {
  const buckets = new Map<Question['type'], Item[]>()
  for (const item of shuffle(items)) buckets.set(item.q.type, [...(buckets.get(item.q.type) ?? []), item])
  const deck: Item[] = []
  for (let i = 0; deck.length < items.length; i++) {
    const wanted = buckets.get(RHYTHM[i % RHYTHM.length])
    const from = wanted?.length ? wanted : [...buckets.values()].find((b) => b.length > 0)!
    deck.push(from.shift()!)
  }
  return deck
}

/** A deck of `size` questions: chosen by `prioritize` (unseen first), then with the types interleaved. */
export function drawDeck(pool: Item[], size: number, history: History = new Map()): Item[] {
  return interleave(prioritize(pool, history).slice(0, size))
}

// «Знайди помилку» sometimes shows the corrected sentence, so «there is a mistake» is not always the answer.
const SHOW_RIGHT_SHARE = 0.3

/**
 * Per-draw variation: authors put answers in any order, so choice options are shuffled and the position of the right one never gives it away;
 * a «find the mistake» pair is shown either as the wrong or as the corrected sentence.
 */
export function withVariant(item: Item): Item {
  const { q } = item
  if (q.type === 'fix') return { ...item, q: { ...q, showRight: Math.random() < SHOW_RIGHT_SHARE } }
  if (q.type !== 'choice') return item
  const correct = q.options[q.answer]
  const options = shuffle(q.options)
  return { ...item, q: { ...q, options, answer: options.indexOf(correct) } }
}
