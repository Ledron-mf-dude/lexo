import { normalize } from './text'

export type Question =
  | { id: string; type: 'choice'; q: string; options: string[]; answer: number; why: string }
  | { id: string; type: 'fill'; q: string; answer: string[]; why: string }
  | { id: string; type: 'order'; words: string[]; answer: string[]; why: string }

// Question banks are JSON files in src/content/exercises, one per article slug (bundled, works offline).
const files = import.meta.glob<{ questions: unknown[] }>('../content/exercises/*.json', { eager: true, import: 'default' })

function isQuestion(x: unknown): x is Question {
  const q = x as Partial<Question> & Record<string, unknown>
  if (!q || typeof q.id !== 'string' || typeof q.why !== 'string') return false
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

/** Text answers: case, extra spaces, curly apostrophes and a final full stop do not matter. */
const canon = (s: string) => normalize(s).replace(/[.!]+$/, '').trim()

export function isCorrectText(input: string, accepted: string[]): boolean {
  const a = canon(input)
  return a !== '' && accepted.some((x) => canon(x) === a)
}

/** Human-readable correct answer, shown after a wrong attempt. */
export function correctAnswer(q: Question): string {
  if (q.type === 'choice') return q.options[q.answer]
  return q.answer[0]
}
