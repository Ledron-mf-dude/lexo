import { useMemo } from 'react'
import { topicStats, type LogRow } from './exerciseLog'
import { exerciseIds } from './exercises'
import { bySlug } from './grammar'
import { loadCards, MY_WRITING } from './writingCards'

/**
 * Spaced repetition for grammar, computed from the answer log (no extra table): a question answered wrongly comes back
 * after 1, 3, 7 and 14 days; each right answer given on time moves it one step on, a wrong one starts it over.
 * After the last step it is considered learned and stops coming back.
 */

const DAY = 86_400_000
export const REVIEW_STEPS = [1, 3, 7, 14]
// A right answer counts as a step only if enough time has passed: the same question repeated in one sitting does not.
const MIN_SHARE = 0.8

export interface ReviewEntry {
  slug: string
  id: string
  due: number
}

/** Questions (known to `valid`) that are in the review cycle, with the time each comes due. */
export function reviewSchedule(log: LogRow[] | undefined, valid: (slug: string, id: string) => boolean): ReviewEntry[] {
  const byKey = new Map<string, LogRow[]>()
  for (const row of log ?? []) {
    const key = `${row.article_slug}/${row.question_id}`
    byKey.set(key, [...(byKey.get(key) ?? []), row])
  }
  const out: ReviewEntry[] = []
  for (const rows of byKey.values()) {
    const { article_slug: slug, question_id: id } = rows[0]
    if (!valid(slug, id)) continue
    // The log is newest first; walk it oldest first from the last wrong answer.
    const chrono = [...rows].reverse()
    const lastWrong = chrono.map((r) => r.correct).lastIndexOf(false)
    if (lastWrong < 0) continue
    let step = 0
    let at = Date.parse(chrono[lastWrong].answered_at)
    for (const r of chrono.slice(lastWrong + 1)) {
      const t = Date.parse(r.answered_at)
      if (step < REVIEW_STEPS.length && t - at >= REVIEW_STEPS[step] * DAY * MIN_SHARE) {
        step++
        at = t
      }
    }
    if (step >= REVIEW_STEPS.length) continue
    out.push({ slug, id, due: at + REVIEW_STEPS[step] * DAY })
  }
  return out.sort((a, b) => a.due - b.due)
}

/** What is due now and when the next batch comes (days from now, how many questions then). */
export function reviewSummary(schedule: ReviewEntry[], now = Date.now()) {
  const due = schedule.filter((e) => e.due <= now)
  const upcoming = schedule.find((e) => e.due > now)
  const next = upcoming && {
    days: Math.max(1, Math.ceil((upcoming.due - now) / DAY)),
    count: schedule.filter((e) => e.due > now && e.due <= upcoming.due + DAY / 2).length,
  }
  return { due, next }
}

// Topics learners often mix up. A session on a pair hides the topic name, so each question needs the rule recognised.
const PAIRS: [string, string][] = [
  ['present-perfect', 'past-tenses'],
  ['present-simple-vs-continuous', 'stative-verbs'],
  ['future-forms', 'future-simple-shall-will'],
  ['gerund-or-infinitive', 'gerund-after-verbs'],
  ['modals-obligation', 'modals-speculation'],
  ['may-might', 'modals-speculation'],
  ['conditionals', 'unreal-past'],
  ['wish-if-only', 'unreal-past'],
  ['countable-uncountable', 'quantifiers'],
  ['articles', 'countable-uncountable'],
  ['during-for-while-since', 'present-perfect'],
  ['so-such', 'too-enough'],
  ['comparatives-superlatives', 'as-as'],
  ['prepositions-time', 'prepositions-place'],
  ['passive-voice', 'passive-reporting-have-something-done'],
  ['relative-clauses', 'participle-clauses'],
  ['reported-speech', 'indirect-questions'],
  ['can-could-be-able-to', 'past-modals'],
  ['there-is-are', 'there-vs-it'],
  ['pronouns', 'reflexive-pronouns'],
  ['adjectives-adverbs', 'ed-ing-adjectives'],
  ['used-to', 'past-tenses'],
]

export const CONTRAST_PAIRS = PAIRS.filter(([a, b]) => bySlug.has(a) && bySlug.has(b))

/** Short topic name for chips: the title up to its first colon, bracket or dash. */
export const shortTitle = (slug: string) => (bySlug.get(slug)?.title ?? slug).split(/[:(—]/)[0].trim()

/** «A / B» for a contrast pair; two topics with the same short name are told apart by what follows the colon. */
export function pairTitle([a, b]: readonly string[]): string {
  if (shortTitle(a) !== shortTitle(b)) return `${shortTitle(a)} / ${shortTitle(b)}`
  const detail = (slug: string) => (bySlug.get(slug)?.title.split(':')[1] ?? slug).split('(')[0].trim()
  return `${shortTitle(a)}: ${detail(a)} / ${detail(b)}`
}

/**
 * Pairs ordered by the learner's current mistakes in both topics (latest answer wrong); pairs where both topics
 * have mistakes come first. Without any mistakes the list keeps its default order.
 */
export function personalPairs(mistakesBySlug: Map<string, number>): { pair: [string, string]; mistakes: number; both: boolean }[] {
  return CONTRAST_PAIRS.map((pair) => {
    const [a, b] = pair.map((s) => mistakesBySlug.get(s) ?? 0)
    return { pair, mistakes: a + b, both: a > 0 && b > 0 }
  }).sort((x, y) => Number(y.both) - Number(x.both) || y.mistakes - x.mistakes)
}

/** Grammar spaced repetition from the answer log: how many questions are due now, when the next ones come, and the contrast pairs. */
export function useGrammarReview(log: LogRow[] | undefined) {
  return useMemo(() => {
    const cards = new Set(loadCards().map((c) => c.id))
    const valid = (slug: string, id: string) => (slug === MY_WRITING ? cards.has(id) : Boolean(exerciseIds.get(slug)?.includes(id)))
    const { due, next } = reviewSummary(reviewSchedule(log, valid))
    const mistakes = new Map([...exerciseIds].map(([slug, ids]) => [slug, topicStats(log, slug, new Set(ids)).mistakes.length]))
    return { due: due.length, next, pairs: personalPairs(mistakes) }
  }, [log])
}
