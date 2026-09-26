import type { Progress } from '../types'

export interface ReviewRow {
  reviewed_at: string
  mode: string
  correct: boolean
}

const DAY_MS = 86_400_000

export const startOfDay = (d: Date = new Date()) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Local calendar day, so "today" matches what the user sees on the clock. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export interface DayStat {
  date: Date
  key: string
  total: number
  correct: number
}

/** Reviews per calendar day for the last `days` days (oldest first, zero-filled). */
export function activity(log: ReviewRow[], days: number, now: Date = new Date()): DayStat[] {
  const start = startOfDay(now)
  const out: DayStat[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start)
    d.setDate(d.getDate() - i)
    out.push({ date: d, key: dayKey(d), total: 0, correct: 0 })
  }
  const index = new Map(out.map((s, i) => [s.key, i]))
  for (const r of log) {
    const i = index.get(dayKey(new Date(r.reviewed_at)))
    if (i === undefined) continue
    out[i].total++
    if (r.correct) out[i].correct++
  }
  return out
}

/** Consecutive days with at least one review, counting back from today (or from yesterday if today is still empty). */
export function streak(log: ReviewRow[], now: Date = new Date()): number {
  const days = new Set(log.map((r) => dayKey(new Date(r.reviewed_at))))
  const cursor = startOfDay(now)
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let n = 0
  while (days.has(dayKey(cursor))) {
    n++
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}

export interface Maturity {
  fresh: number
  learning: number
  young: number
  mature: number
}

/** Anki-style bands by current interval: new, learning (< 1 week), young (< 3 weeks), mature (3+ weeks). */
export function maturity(progress: Progress[]): Maturity {
  const m: Maturity = { fresh: 0, learning: 0, young: 0, mature: 0 }
  for (const p of progress) {
    if (p.last_reviewed === null) m.fresh++
    else if (p.interval_days < 7) m.learning++
    else if (p.interval_days < 21) m.young++
    else m.mature++
  }
  return m
}

/** Words that come due on each of the next `days` days; today also includes everything already overdue. */
export function forecast(progress: Progress[], days: number, now: Date = new Date()): { date: Date; due: number }[] {
  const start = startOfDay(now)
  const out = Array.from({ length: days }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return { date: d, due: 0 }
  })
  for (const p of progress) {
    if (p.last_reviewed === null) continue
    const offset = Math.floor((startOfDay(new Date(p.due_at)).getTime() - start.getTime()) / DAY_MS)
    if (offset < days) out[Math.max(0, offset)].due++
  }
  return out
}

export interface ModeStat {
  mode: string
  total: number
  correct: number
}

export function modeStats(log: ReviewRow[]): ModeStat[] {
  const map = new Map<string, ModeStat>()
  for (const r of log) {
    const s = map.get(r.mode) ?? { mode: r.mode, total: 0, correct: 0 }
    s.total++
    if (r.correct) s.correct++
    map.set(r.mode, s)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export const MODE_LABELS: Record<string, string> = {
  flashcard: 'Слово → переклад',
  translation: 'Переклад → слово',
  choice: 'Вибір відповіді',
  typing: 'Введення слова',
  scramble: 'Складання з літер',
  gaps: 'Пропущені літери',
  cloze: 'Речення з пропуском',
  definition: 'За визначенням',
  speed: 'Швидкий раунд',
}

export const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100))
