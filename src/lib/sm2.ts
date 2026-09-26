/** SM-2-style spaced repetition (Anki-like: again / hard / good / easy). */

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export interface SrsState {
  ease_factor: number
  interval_days: number
  repetitions: number
}

export interface Scheduled extends SrsState {
  due_at: Date
}

export const AGAIN_MINUTES = 10
const MIN_EASE = 1.3
const DAY_MS = 24 * 60 * 60 * 1000

export function schedule(state: SrsState, grade: Grade, now: Date = new Date()): Scheduled {
  if (grade === 'again') {
    return {
      ease_factor: Math.max(MIN_EASE, state.ease_factor - 0.2),
      interval_days: 0,
      repetitions: 0,
      due_at: new Date(now.getTime() + AGAIN_MINUTES * 60_000),
    }
  }

  const repetitions = state.repetitions + 1
  const prev = state.interval_days
  let ease = state.ease_factor
  let days: number

  if (grade === 'hard') {
    ease = Math.max(MIN_EASE, ease - 0.15)
    days = repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.max(prev + 1, Math.round(prev * 1.2))
  } else if (grade === 'good') {
    days = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(prev + 1, Math.round(prev * ease))
  } else {
    ease += 0.15
    days = repetitions === 1 ? 3 : repetitions === 2 ? 8 : Math.max(prev + 2, Math.round(prev * ease * 1.3))
  }

  return {
    ease_factor: ease,
    interval_days: days,
    repetitions,
    due_at: new Date(now.getTime() + days * DAY_MS),
  }
}

/** Short label for the button under a grade, e.g. "10 хв", "6 д", "2 міс". */
export function intervalLabel(state: SrsState, grade: Grade): string {
  if (grade === 'again') return `${AGAIN_MINUTES} хв`
  const days = schedule(state, grade).interval_days
  if (days < 30) return `${days} д`
  if (days < 365) return `${Math.round(days / 30)} міс`
  return `${(days / 365).toFixed(1)} р`
}

const RANK: Record<Grade, number> = { again: 0, hard: 1, good: 2, easy: 3 }

/** The lower of two grades (`undefined` counts as "nothing yet"). */
export const worseGrade = (a: Grade | undefined, b: Grade): Grade => (a === undefined || RANK[b] < RANK[a] ? b : a)

/**
 * The single grade a word gets for a whole complex: the worst of its earlier exercises and the last one,
 * except that a word missed earlier but answered in the last exercise is "hard" rather than a fresh success.
 */
export function complexGrade(earlier: Grade | undefined, last: Grade): Grade {
  if (earlier === undefined) return last
  if (earlier === 'again' && last !== 'again') return 'hard'
  return worseGrade(earlier, last)
}
