import type { Progress } from '../types'
import type { LogRow } from './exerciseLog'
import type { WordWithTags } from './queries'
import type { ReviewRow } from './stats'

// Synthetic data for previewing the statistics page (`#/stats?demo=1`). Nothing here is ever written to the database.

function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY = 86_400_000

export function demoProgress(words: WordWithTags[]): Progress[] {
  const r = rng(7)
  const intervals = [1, 1, 2, 4, 6, 9, 14, 25, 40, 80]
  const now = Date.now()
  return words.map((w) => {
    const fresh = r() < 0.3
    const interval = intervals[Math.floor(r() * intervals.length)]
    return {
      id: `demo-${w.id}`,
      word_id: w.id,
      user_id: 'demo',
      ease_factor: 2.5,
      interval_days: fresh ? 0 : interval,
      repetitions: fresh ? 0 : 1 + Math.floor(r() * 6),
      due_at: new Date(now + (r() * 1.4 - 0.3) * interval * DAY).toISOString(),
      last_reviewed: fresh ? null : new Date(now - r() * interval * DAY).toISOString(),
      error_count: r() < 0.12 ? 2 + Math.floor(r() * 5) : r() < 0.25 ? 1 : 0,
    }
  })
}

export function demoReviewLog(): ReviewRow[] {
  const r = rng(11)
  const modes = ['choice', 'choice', 'flashcard', 'flashcard', 'translation', 'typing', 'gaps', 'scramble']
  const accuracy: Record<string, number> = { choice: 0.92, flashcard: 0.85, translation: 0.78, typing: 0.66, gaps: 0.72, scramble: 0.7 }
  const rows: ReviewRow[] = []
  for (let back = 0; back < 60; back++) {
    if (back > 0 && r() < 0.25) continue // days off
    const count = back === 0 ? 14 : Math.floor(8 + r() * 45)
    for (let i = 0; i < count; i++) {
      const mode = modes[Math.floor(r() * modes.length)]
      rows.push({ reviewed_at: new Date(Date.now() - back * DAY - r() * 8 * 3_600_000).toISOString(), mode, correct: r() < accuracy[mode] })
    }
  }
  return rows
}

/** `banks`: article slug -> its question ids. Roughly half of the topics get answers. */
export function demoExerciseLog(banks: Map<string, string[]>): LogRow[] {
  const r = rng(23)
  const rows: LogRow[] = []
  for (const [slug, ids] of banks) {
    if (r() < 0.5) continue
    const skill = 0.35 + r() * 0.6
    const tried = Math.ceil(ids.length * (0.4 + r() * 0.6))
    for (const id of ids.slice(0, tried)) {
      rows.push({ article_slug: slug, question_id: id, correct: r() < skill, answered_at: new Date(Date.now() - r() * 10 * DAY).toISOString() })
    }
  }
  return rows
}
