import type { Progress } from '../types'
import { activity, dayKey, streak, type ReviewRow } from './stats'

/** A goal with tiers: the value only grows, and each tier is an achievement once reached. */
export interface Track {
  id: string
  title: string
  hint: string
  value: number
  tiers: number[]
}

export interface AchievementInput {
  wordCount: number
  progress: Progress[]
  log: ReviewRow[]
  topicsStarted: number
  topicsMastered: number
}

/** The longest run of consecutive days with a review inside the log. */
export function longestStreak(log: ReviewRow[]): number {
  const days = [...new Set(log.map((r) => dayKey(new Date(r.reviewed_at))))].sort()
  let best = 0
  let run = 0
  let prev: Date | null = null
  for (const key of days) {
    const [y, m, d] = key.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    run = prev && Math.round((date.getTime() - prev.getTime()) / 86_400_000) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = date
  }
  return best
}

export function tracks({ wordCount, progress, log, topicsStarted, topicsMastered }: AchievementInput): Track[] {
  const mature = progress.filter((p) => p.interval_days >= 21).length
  const days = activity(log, 90)
  const bestDay = Math.max(0, ...days.map((d) => d.total))
  const perfectDays = days.filter((d) => d.total >= 20 && d.correct === d.total).length
  const bestStreak = Math.max(streak(log), longestStreak(log))
  return [
    { id: 'streak', title: 'Серія днів', hint: 'днів поспіль з повтореннями', value: bestStreak, tiers: [3, 7, 14, 30, 60] },
    { id: 'dictionary', title: 'Словник', hint: 'слів у словнику', value: wordCount, tiers: [50, 100, 250, 500, 1000] },
    { id: 'mature', title: 'Міцна пам\'ять', hint: 'слів, які ви пам\'ятаєте 3+ тижні', value: mature, tiers: [10, 50, 100, 250, 500] },
    { id: 'marathon', title: 'Марафон', hint: 'карток за один день', value: bestDay, tiers: [25, 50, 100, 200] },
    { id: 'perfect', title: 'Без єдиної помилки', hint: 'днів, коли ви відповіли на 20+ карток без помилок', value: perfectDays, tiers: [1, 3, 7, 14] },
    { id: 'grammar-started', title: 'Дослідник граматики', hint: 'тем граматики розпочато', value: topicsStarted, tiers: [1, 5, 15, 30, 60] },
    { id: 'grammar-mastered', title: 'Знавець граматики', hint: 'тем граматики опановано повністю', value: topicsMastered, tiers: [1, 3, 10, 25] },
  ]
}

export const unlocked = (t: Track) => t.tiers.filter((n) => t.value >= n).length
