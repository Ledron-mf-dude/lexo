import { shuffle, itemsOf, type Item } from './exercises'
import { articles, LEVELS, startLevel, type Article, type Level } from './grammar'

/**
 * Placement test and learning path. The test walks up the levels in blocks of a few questions.
 * A single failed block no longer ends the test: it keeps going so a careless slip on an easy level
 * does not hide what the learner actually knows higher up. It stops only when a block is a complete
 * miss (too high a level to be worth continuing) or the learner ends it themselves.
 * The path then offers the topics of the first level not yet passed, with weak topics first regardless
 * of which level they belong to.
 * The result is kept per browser (no database table needed).
 */

// C1 has a single topic, so the test ends at B2: passing it means «B2 and higher».
export const PLACEMENT_LEVELS: Level[] = ['A1', 'A2', 'B1', 'B1+', 'B2']
export const BLOCK_SIZE = 4
/** Correct answers out of BLOCK_SIZE needed to pass a level. */
export const PASS_MARK = 3

export interface Placement {
  /** Highest level whose score met PASS_MARK; null if none did. Earlier levels may have failed silently. */
  passed: Level | null
  /** Correct answers per level tried. */
  scores: Partial<Record<Level, number>>
  /** Topics answered wrongly during the test: they come first on the path. */
  weak: string[]
  date: string
}

/** The highest level with a passing score, scanning from A1 up. A weaker level in between does not cap it. */
export function passedLevel(scores: Partial<Record<Level, number>>): Level | null {
  let passed: Level | null = null
  for (const l of PLACEMENT_LEVELS) if ((scores[l] ?? 0) >= PASS_MARK) passed = l
  return passed
}

const KEY = 'lexo.placement'

export function loadPlacement(): Placement | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Placement | null
  } catch {
    return null
  }
}

export function savePlacement(p: Placement) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // private mode: the result is shown but not remembered
  }
}

/** The level to study after the test: the first one not passed (B2 once everything is passed). */
export function studyLevelAfter(passed: Level | null): Level {
  if (passed === null) return PLACEMENT_LEVELS[0]
  const i = PLACEMENT_LEVELS.indexOf(passed)
  return PLACEMENT_LEVELS[Math.min(i + 1, PLACEMENT_LEVELS.length - 1)]
}

/** Questions for one level: from different topics that start at that level, quick types only (choice and fill). */
export function drawBlock(level: Level): Item[] {
  const topics = shuffle(articles.filter((a) => startLevel(a) === level && itemsOf(a.slug).length > 0))
  const block: Item[] = []
  for (const a of topics) {
    const quick = itemsOf(a.slug).filter((i) => i.q.type === 'choice' || i.q.type === 'fill')
    if (quick.length > 0) block.push(shuffle(quick)[0])
    if (block.length === BLOCK_SIZE) break
  }
  return block
}

export type TopicStatus = 'new' | 'progress' | 'done'

export interface TopicProgress {
  mastered: number
  total: number
  attempted: number
}

/** A topic counts as learned once enough of it was answered and most of the latest answers are right. */
export function topicStatus(p: TopicProgress | undefined): TopicStatus {
  if (!p || p.attempted === 0) return 'new'
  return p.attempted >= 8 && p.mastered / p.attempted >= 0.8 ? 'done' : 'progress'
}

export interface Route {
  level: Level
  /** Topics to work on, in order: weak ones from the test, then started, then new. */
  todo: { article: Article; status: TopicStatus; weak: boolean }[]
  done: Article[]
  total: number
}

const levelRank = (l: Level) => LEVELS.indexOf(l)

/**
 * The path for a placement result. The study level moves up by itself once 80% of its topics are learned,
 * so the path keeps going after the test without retaking it.
 */
export function buildRoute(placement: Placement, progress: Map<string, TopicProgress>): Route {
  const withBank = articles.filter((a) => progress.has(a.slug))
  let level = studyLevelAfter(placement.passed)
  for (;;) {
    const topics = withBank.filter((a) => startLevel(a) === level)
    const learned = topics.filter((a) => topicStatus(progress.get(a.slug)) === 'done').length
    const next = PLACEMENT_LEVELS[PLACEMENT_LEVELS.indexOf(level) + 1]
    if (!next || topics.length === 0 || learned / topics.length < 0.8) break
    level = next
  }
  // Weak topics from the test count only up to the study level (a harder one will come with its own level).
  const weak = new Set(placement.weak)
  const inRoute = withBank.filter((a) => startLevel(a) === level || (weak.has(a.slug) && levelRank(startLevel(a)) <= levelRank(level)))
  const rank = (a: Article) => {
    const st = topicStatus(progress.get(a.slug))
    return (weak.has(a.slug) ? 0 : 3) + (st === 'progress' ? 0 : 1)
  }
  const todo = inRoute
    .filter((a) => topicStatus(progress.get(a.slug)) !== 'done')
    .sort((a, b) => rank(a) - rank(b))
    .map((article) => ({ article, status: topicStatus(progress.get(article.slug)), weak: weak.has(article.slug) }))
  const done = inRoute.filter((a) => topicStatus(progress.get(a.slug)) === 'done')
  return { level, todo, done, total: inRoute.length }
}
