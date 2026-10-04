// Exercise questions: types, validation, answer comparison and the «Знайди помилку» generator. Pure functions:
// the content plugin (vite/lexoContent.ts) validates the banks and generates the fix questions at build time.

import { normalize } from '../text.ts'

/** `hint`: an optional line under the question (the base verb, a translation of the sentence to build, what to change). */
export type Question =
  | { id: string; type: 'choice'; q: string; options: string[]; answer: number; why: string; hint?: string }
  | { id: string; type: 'fill'; q: string; answer: string[]; why: string; hint?: string }
  | { id: string; type: 'order'; words: string[]; answer: string[]; why: string; hint?: string }
  /** «Знайди помилку»: `wrong` is shown (or, with `showRight`, the corrected sentence); `answer` lists accepted corrections. */
  | { id: string; type: 'fix'; wrong: string; answer: string[]; why: string; hint?: string; showRight?: boolean }

// Contractions are spelled out on both sides, so «It is raining» matches «It's raining» and «do not» matches «don't».
// `'s` is expanded only after pronouns (elsewhere it is usually a possessive); `'d` is taken as «would».
const CONTRACTIONS: [RegExp, string][] = [
  [/\bwon't\b/g, 'will not'],
  [/\bshan't\b/g, 'shall not'],
  [/\bcan't\b|\bcannot\b/g, 'can not'],
  [/n't\b/g, ' not'],
  [/'re\b/g, ' are'],
  [/'m\b/g, ' am'],
  [/'ll\b/g, ' will'],
  [/'ve\b/g, ' have'],
  [/'d\b/g, ' would'],
  [/\b(it|he|she|that|there|here|what|who|where|how)'s\b/g, '$1 is'],
]

/** Text answers: case, extra spaces, curly apostrophes, punctuation (commas, full stops, question marks) and contractions do not matter. */
export const canon = (s: string) =>
  CONTRACTIONS.reduce((t, [re, full]) => t.replace(re, full), normalize(s.replace(/[.,!?;:]/g, ' ')))
    .replace(/\s+/g, ' ')
    .trim()

function isQuestion(x: unknown): x is Question {
  const q = x as Partial<Question> & Record<string, unknown>
  if (!q || typeof q.id !== 'string' || typeof q.why !== 'string') return false
  if (q.hint !== undefined && typeof q.hint !== 'string') return false
  if (q.type === 'choice') return typeof q.q === 'string' && Array.isArray(q.options) && typeof q.answer === 'number' && q.answer < q.options.length
  if (q.type === 'fill') return typeof q.q === 'string' && Array.isArray(q.answer) && q.answer.length > 0
  if (q.type === 'order') return Array.isArray(q.words) && Array.isArray(q.answer) && q.answer.length > 0
  return false
}

/** The valid questions of a bank file; invalid ones are reported through `warn` and skipped. */
export function validQuestions(data: { questions?: unknown[] }, warn: (q: unknown) => void): Question[] {
  return (data.questions ?? []).filter((q) => {
    const ok = isQuestion(q)
    if (!ok) warn(q)
    return ok
  }) as Question[]
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

/** «Знайди помилку» questions from an article body. */
export function mistakeQuestions(body: string): Question[] {
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
