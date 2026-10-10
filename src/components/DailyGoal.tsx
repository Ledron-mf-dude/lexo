import { useState } from 'react'
import { useReviewLog } from '../lib/reviewLog'
import { CARD, count, DAY, plural } from '../lib/plural'
import { activity, streak } from '../lib/stats'

const GOAL_KEY = 'lexo.goal'
const GOALS = [10, 20, 30, 50]
const DEFAULT_GOAL = 20

function loadGoal(): number {
  try {
    const n = Number(localStorage.getItem(GOAL_KEY))
    return GOALS.includes(n) ? n : DEFAULT_GOAL
  } catch {
    return DEFAULT_GOAL
  }
}

const R = 26
const CIRCUMFERENCE = 2 * Math.PI * R

/** Today's progress towards a daily goal (in answered cards) and the current streak; the goal is stored per browser. */
export default function DailyGoal() {
  const log = useReviewLog()
  const [goal, setGoal] = useState(loadGoal)
  // The goal is changed rarely, so its chips stay hidden until the goal itself is tapped.
  const [editing, setEditing] = useState(false)
  const rows = log.data ?? []
  const today = activity(rows, 1)[0].total
  const days = streak(rows)
  const reached = today >= goal

  function pick(n: number) {
    setGoal(n)
    setEditing(false)
    try {
      localStorage.setItem(GOAL_KEY, String(n))
    } catch {
      // the goal just is not remembered
    }
  }

  return (
    <div className="glass flex items-center gap-4 rounded-2xl p-4">
      <div className="relative size-16 shrink-0">
        <svg viewBox="0 0 64 64" className="size-full -rotate-90" aria-hidden>
          <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" className="stroke-white/10" />
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(1, today / goal))}
            className={`transition-[stroke-dashoffset] duration-700 ${reached ? 'stroke-good' : 'stroke-accent'}`}
          />
        </svg>
        <span className={`absolute inset-0 grid place-items-center text-sm font-medium tabular-nums ${reached ? 'text-good' : ''}`}>{reached ? '✓' : today}</span>
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-medium">{reached ? 'Ціль на сьогодні виконано' : 'Щоденна ціль'}</p>
        <p className="flex flex-wrap gap-x-3 text-sm text-white/60">
          <button onClick={() => setEditing((e) => !e)} aria-expanded={editing} title="Змінити щоденну ціль" className="hover:text-white">
            {today} з <span className="underline decoration-white/25 decoration-dotted underline-offset-4">{goal}</span> {plural(goal, CARD)}
          </button>
          {days > 0 && (
            <>
              <span className="inline-flex items-center gap-1 text-warn">
                <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
                  <path d="M12 2c1 4-2 5-2 8 0 1.5 1 2.5 2 2.5S14 11.500 14 10c2 1.500 4 4 4 7a6 6 0 0 1-12 0c0-3 1.500-5 2.500-6.500C9 12 9.500 8 12 2Z" />
                </svg>
                {count(days, DAY)} поспіль
              </span>
            </>
          )}
        </p>
        {editing && (
          <div className="flex gap-1.5" role="group" aria-label="Щоденна ціль">
            {GOALS.map((n) => (
              <button
                key={n}
                onClick={() => pick(n)}
                aria-pressed={goal === n}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${goal === n ? 'border-accent bg-accent/20 text-accent' : 'border-white/12 text-white/60 hover:text-white'}`}
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
