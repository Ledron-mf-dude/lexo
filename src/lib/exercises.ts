import { articles } from './grammar'
import { normalize } from './text'

/** `hint`: an optional line under the question (the base verb, a translation of the sentence to build, what to change). */
export type Question =
  | { id: string; type: 'choice'; q: string; options: string[]; answer: number; why: string; hint?: string }
  | { id: string; type: 'fill'; q: string; answer: string[]; why: string; hint?: string }
  | { id: string; type: 'order'; words: string[]; answer: string[]; why: string; hint?: string }
  /** «Знайди помилку»: `wrong` is shown (or, with `showRight`, the corrected sentence); `answer` lists accepted corrections. */
  | { id: string; type: 'fix'; wrong: string; answer: string[]; why: string; hint?: string; showRight?: boolean }

/** A question together with the topic it belongs to (mixed practice draws from several topics). */
export interface Item {
  slug: string
  q: Question
}

/** Text answers: case, extra spaces, curly apostrophes and punctuation (commas, full stops, question marks) do not matter. */
const canon = (s: string) => normalize(s.replace(/[.,!?;:]/g, ' '))

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

// «Знайди помилку» is generated from the «Типові помилки» lines of the articles: `- ✗ *wrong* (note) → ✓ *right* (note)`.
const MISTAKE_LINE = /^- ✗ \*([^*]+)\*(.*?)→ ✓ (.+)$/
// One italic span on the right; it may contain **bold** marks, including at its very start or end (`***Do** you…*`).
const RIGHT_SPAN = /^\*((?:[^*]|\*\*[^*]+\*\*)+?)\*(?!\*)/
// A pair that is only wrong in one variety or register is not a clear-cut mistake to spot.
const NOT_CLEAR_CUT = /BrE|AmE|розмовн|формальн|застар/

/** Short, stable id from the wrong sentence, so the answer log keeps pointing at the same pair. */
function fixId(text: string): string {
  let h = 5381
  for (const ch of text) h = ((h << 5) + h + ch.charCodeAt(0)) | 0
  return `fix-${(h >>> 0).toString(36)}`
}

const cleanNote = (s: string) =>
  s
    .replace(/[*`]/g, '')
    .replace(/^[\s(—–-]+|[\s)]+$/g, '')
    .trim()

function mistakeQuestions(body: string): Question[] {
  const out = new Map<string, Question>()
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(MISTAKE_LINE)
    if (!m) continue
    const wrong = m[1].trim()
    const answer: string[] = []
    let rest = m[3].trim()
    for (let span = rest.match(RIGHT_SPAN); span; span = rest.match(RIGHT_SPAN)) {
      answer.push(span[1].replace(/\*\*/g, '').trim())
      rest = rest.slice(span[0].length).trim()
      if (!rest.startsWith('/')) break
      rest = rest.slice(1).trim()
    }
    // Truncated examples («…»), alternatives inside one span and changes that are only punctuation cannot be checked as typed text.
    if (answer.length === 0 || NOT_CLEAR_CUT.test(m[2]) || wrong.split(' ').length < 2) continue
    if ([wrong, ...answer].some((t) => /…|\.\.\.|\//.test(t)) || answer.some((a) => canon(a) === canon(wrong))) continue
    const why = [cleanNote(m[2]), cleanNote(rest)].filter(Boolean).join('; ')
    const id = fixId(wrong)
    if (!out.has(id)) out.set(id, { id, type: 'fix', wrong, answer, why })
  }
  return [...out.values()]
}

for (const a of articles) {
  const fixes = mistakeQuestions(a.body)
  if (fixes.length > 0) exercises.set(a.slug, [...(exercises.get(a.slug) ?? []), ...fixes])
}

export const fixCount = [...exercises.values()].reduce((n, qs) => n + qs.filter((q) => q.type === 'fix').length, 0)

export const questionCount = [...exercises.values()].reduce((n, qs) => n + qs.length, 0)

export const itemsOf = (slug: string): Item[] => (exercises.get(slug) ?? []).map((q) => ({ slug, q }))


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
