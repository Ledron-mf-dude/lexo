import type { PracticeMode, Progress } from '../types'
import type { WordWithTags } from './queries'
import { canSpeak } from './speech'
import { findInExample, pickGaps, scrambleLetters, type Blank } from './text'

export type Source = 'today' | 'new' | 'hard' | 'all' | 'subset'
export type ModeChoice = 'auto' | 'flashcard' | 'translation' | 'choice' | 'typing' | 'scramble' | 'gaps' | 'cloze' | 'match' | 'matchdef' | 'listen'
export type Exercise = Exclude<ModeChoice, 'auto'>

/** Listed in teaching order (recognise first, recall last); a complex runs its exercises in the order the user picked them. */
export const EXERCISES: { value: Exercise; label: string }[] = [
  { value: 'choice', label: 'Вибір відповіді' },
  { value: 'match', label: 'Підбір пар' },
  { value: 'matchdef', label: 'Слово ↔ пояснення' },
  { value: 'flashcard', label: 'Слово → переклад' },
  { value: 'translation', label: 'Переклад → слово' },
  { value: 'cloze', label: 'Слово в реченні' },
  { value: 'gaps', label: 'Пропущені літери' },
  { value: 'scramble', label: 'Складання з літер' },
  { value: 'listen', label: 'Аудіювання' },
  { value: 'typing', label: 'Введення слова' },
]

/** Exercises where several words share one card. */
export const isGroupExercise = (m: Exercise) => m === 'match' || m === 'matchdef'

export interface SessionConfig {
  source: Source
  /** Set when the session was started from a grammar article: exactly these words are practised. */
  subset?: { ids: string[]; title: string }
  tagIds: string[]
  limit: number
  /** Chosen exercises. Empty = automatic (one adaptive exercise per word); one = that exercise; two or more = a complex. */
  modes: Exercise[]
}

export interface Card {
  word: WordWithTags
  mode: PracticeMode
  /** true: show the translation and ask for the term. */
  reverse: boolean
  /** Multiple choice only: shuffled answers, one of them correct. */
  options?: string[]
  /** Gaps mode: indices (into the term) of the hidden letters. */
  gaps?: number[]
  /** Scramble mode: the term's letters in shuffled order. */
  letters?: string[]
  /** Matching exercises: the words shown together on one card, and what they are matched with. */
  group?: WordWithTags[]
  pairs?: 'translation' | 'definition'
  /** Group card: the words for which this is the last stage, i.e. whose schedule it updates. */
  commitFor?: string[]
  /** Cloze mode: the example sentence split around the word. */
  blank?: Blank
  /** Whether answering this card updates the word's schedule (in a complex only the last stage does). */
  commit: boolean
  /** Complex: this is the word's last stage. */
  final: boolean
  /** Complex: which stage (1-based) of how many. */
  stage?: number
  stages?: number
  /** A repeat of a missed card; it never counts as a stage. */
  retry?: boolean
  /** Complex only: the exercise (round) this card belongs to; a missed word's repeat card has none. */
  round?: Exercise
}

export const HARD_ERRORS = 2

function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const isNew = (p: Progress) => p.last_reviewed === null
const isDue = (p: Progress, now: Date) => !isNew(p) && new Date(p.due_at) <= now

export interface Counts {
  due: number
  fresh: number
  hard: number
  all: number
}

export function countSources(words: WordWithTags[], progress: Map<string, Progress>, tagIds: string[], now = new Date()): Counts {
  const counts: Counts = { due: 0, fresh: 0, hard: 0, all: 0 }
  for (const w of filterByTags(words, tagIds)) {
    const p = progress.get(w.id)
    if (!p) continue
    counts.all++
    if (isNew(p)) counts.fresh++
    else if (isDue(p, now)) counts.due++
    if (p.error_count >= HARD_ERRORS) counts.hard++
  }
  return counts
}

function filterByTags(words: WordWithTags[], tagIds: string[]) {
  return tagIds.length === 0 ? words : words.filter((w) => w.tagIds.some((id) => tagIds.includes(id)))
}

export function pickWords(words: WordWithTags[], progress: Map<string, Progress>, config: SessionConfig, now = new Date()) {
  const inSubset = config.source === 'subset' ? new Set(config.subset?.ids) : null
  const pool = (inSubset ? words.filter((w) => inSubset.has(w.id)) : filterByTags(words, config.tagIds)).filter((w) => progress.has(w.id))
  const p = (w: WordWithTags) => progress.get(w.id)!
  let picked: WordWithTags[]

  if (config.source === 'today') {
    const due = pool.filter((w) => isDue(p(w), now)).sort((a, b) => +new Date(p(a).due_at) - +new Date(p(b).due_at))
    const fresh = shuffle(pool.filter((w) => isNew(p(w))))
    picked = [...due, ...fresh]
  } else if (config.source === 'subset') {
    picked = shuffle(pool)
  } else if (config.source === 'new') {
    picked = shuffle(pool.filter((w) => isNew(p(w))))
  } else if (config.source === 'hard') {
    picked = pool.filter((w) => p(w).error_count >= HARD_ERRORS).sort((a, b) => p(b).error_count - p(a).error_count)
  } else {
    picked = shuffle(pool)
  }
  return picked.slice(0, config.limit)
}

/** Three wrong answers for multiple choice, preferring words that share a tag with the target. */
function distractors(target: WordWithTags, all: WordWithTags[]): string[] {
  // Same kind (word vs. sentence) and similar length, so the right answer does not stand out.
  const isSentence = (w: WordWithTags) => /[.?!]$/.test(w.term) || w.term.split(' ').length > 5
  const kind = isSentence(target)
  const others = all.filter((w) => w.id !== target.id && w.translation !== target.translation)
  const sameKind = others.some((w) => isSentence(w) === kind && others.length > 30) ? others.filter((w) => isSentence(w) === kind) : others
  const score = (w: WordWithTags) =>
    (w.tagIds.some((id) => target.tagIds.includes(id)) ? 0 : 20) +
    Math.abs(w.translation.length - target.translation.length) +
    Math.random() * 12
  return sameKind
    .map((w) => ({ w, s: score(w) }))
    .sort((a, b) => a.s - b.s)
    .slice(0, 3)
    .map((x) => x.w.translation)
}

/** Three other terms for a "fill the gap" question, similar in shape (one word vs. a phrase) and length. */
function termDistractors(target: WordWithTags, all: WordWithTags[]): string[] {
  const words = (t: string) => t.trim().split(/\s+/).length
  const others = all.filter((w) => w.id !== target.id && w.term.toLowerCase() !== target.term.toLowerCase())
  const score = (w: WordWithTags) =>
    (words(w.term) === words(target.term) ? 0 : 25) +
    (w.tagIds.some((id) => target.tagIds.includes(id)) ? 0 : 8) +
    Math.abs(w.term.length - target.term.length) +
    Math.random() * 10
  return others
    .map((w) => ({ w, s: score(w) }))
    .sort((a, b) => a.s - b.s)
    .slice(0, 3)
    .map((x) => x.w.term)
}

type Resolved = Exclude<ModeChoice, 'auto'>

const blankOf = (word: WordWithTags): Blank | null => (word.example ? findInExample(word.term, word.example) : null)

function eligible(mode: Resolved, word: WordWithTags, canChoose: boolean): boolean {
  const term = word.term
  const single = !/\s/.test(term) && term.length >= 4 && term.length <= 14
  switch (mode) {
    case 'choice':
      return canChoose
    case 'typing':
      return term.length <= 40
    case 'scramble':
      return single
    case 'gaps':
      return term.length <= 40 && pickGaps(term) !== null
    case 'cloze':
      return canChoose && blankOf(word) !== null
    case 'matchdef':
      return Boolean(word.definition?.trim())
    case 'listen':
      return canSpeak && term.length <= 40
    default:
      return true
  }
}

export function eligibleFor(mode: Exercise, word: WordWithTags, all: WordWithTags[]): boolean {
  return eligible(mode, word, all.length >= 4)
}

function pickAuto(word: WordWithTags, repetitions: number, canChoose: boolean): Resolved {
  let pool: Resolved[]
  if (repetitions < 2) pool = ['choice', 'choice', 'flashcard']
  else if (repetitions < 4) pool = ['gaps', 'scramble', 'typing', 'translation', 'cloze']
  else pool = ['typing', 'typing', 'translation', 'flashcard', 'cloze', 'listen']
  const ok = pool.filter((m) => eligible(m, word, canChoose))
  return ok.length > 0 ? ok[Math.floor(Math.random() * ok.length)] : 'flashcard'
}

export function makeCard(word: WordWithTags, prog: Progress, all: WordWithTags[], mode: ModeChoice): Card {
  const base = { commit: true, final: true }
  const canChoose = all.length >= 4
  let resolved: Resolved
  if (mode === 'auto') resolved = pickAuto(word, prog.repetitions, canChoose)
  else if (isGroupExercise(mode)) resolved = 'flashcard' // a lone word cannot be matched: it falls back to a plain card
  else if (eligible(mode, word, canChoose)) resolved = mode
  else resolved = mode === 'choice' ? 'flashcard' : eligible('typing', word, canChoose) ? 'typing' : 'flashcard'

  if (resolved === 'choice') {
    return { ...base, word, mode: 'choice', reverse: false, options: shuffle([word.translation, ...distractors(word, all)]) }
  }
  if (resolved === 'cloze') {
    return { ...base, word, mode: 'cloze', reverse: false, blank: blankOf(word)!, options: shuffle([word.term, ...termDistractors(word, all)]) }
  }
  if (resolved === 'listen') return { ...base, word, mode: 'listen', reverse: true }
  if (resolved === 'gaps') return { ...base, word, mode: 'gaps', reverse: true, gaps: pickGaps(word.term) ?? [] }
  if (resolved === 'scramble') return { ...base, word, mode: 'scramble', reverse: true, letters: scrambleLetters(word.term) }
  const plain = resolved === 'translation' || resolved === 'typing' ? resolved : 'flashcard'
  return { ...base, word, mode: plain, reverse: plain === 'translation' || plain === 'typing' }
}

const GROUP_SIZE = 4

/** Groups of four; a leftover of one or two joins the previous group instead of forming a tiny one. */
function chunkGroups(words: WordWithTags[]): WordWithTags[][] {
  const out: WordWithTags[][] = []
  for (let i = 0; i < words.length; i += GROUP_SIZE) out.push(words.slice(i, i + GROUP_SIZE))
  if (out.length > 1 && out[out.length - 1].length < 3) out[out.length - 2].push(...out.pop()!)
  return out
}

/**
 * The card queue of a session.
 * - no exercises chosen: one adaptive card per word;
 * - one exercise: that exercise for every word;
 * - several (a complex): rounds, in the order the exercises were chosen — everyone does the first exercise, then the second,
 *   and so on. An exercise a word cannot do (no example for a sentence, no definition for an explanation, a phrase for
 *   letter scrambling) is skipped for that word only.
 * Matching exercises put several words on one card.
 */
export function buildQueue(words: WordWithTags[], progress: Map<string, Progress>, all: WordWithTags[], modes: Exercise[]): Card[] {
  const prog = (w: WordWithTags) => progress.get(w.id)!
  if (modes.length === 0) return words.map((w) => makeCard(w, prog(w), all, 'auto'))

  const chosen = [...new Set(modes)]
  const single = chosen.length === 1
  // A matching exercise needs at least two words that can take part.
  const ordered = chosen.filter((m) => !isGroupExercise(m) || words.filter((w) => eligibleFor(m, w, all)).length >= 2)
  const plan = new Map(words.map((w) => [w.id, ordered.filter((m) => eligibleFor(m, w, all))]))
  const isLast = (w: WordWithTags, mode: Exercise) => {
    const mine = plan.get(w.id)!
    return mine.indexOf(mode) === mine.length - 1
  }

  const queue: Card[] = []
  for (const mode of ordered) {
    const takers = (single ? words : shuffle(words)).filter((w) => plan.get(w.id)!.includes(mode))
    const round = single ? undefined : mode
    if (isGroupExercise(mode)) {
      for (const group of chunkGroups(takers)) {
        queue.push({
          word: group[0],
          group,
          pairs: mode === 'match' ? 'translation' : 'definition',
          mode: 'match',
          reverse: false,
          commit: false,
          final: false,
          commitFor: group.filter((w) => isLast(w, mode)).map((w) => w.id),
          round,
        })
      }
      continue
    }
    for (const w of takers) {
      const mine = plan.get(w.id)!
      const stage = mine.indexOf(mode)
      const last = stage === mine.length - 1
      queue.push({ ...makeCard(w, prog(w), all, mode), round, stage: stage + 1, stages: mine.length, final: last, commit: last })
    }
  }
  // A word that cannot do any chosen exercise still gets one card.
  for (const w of words) if (plan.get(w.id)!.length === 0) queue.push(makeCard(w, prog(w), all, single ? chosen[0] : 'auto'))
  return queue
}
