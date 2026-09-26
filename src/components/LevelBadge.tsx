import type { Level } from '../lib/grammar'

const tone: Record<string, string> = {
  A: 'bg-good/15 text-good',
  B: 'bg-accent/15 text-accent',
  C: 'bg-accent-alt/15 text-accent-alt',
}

export default function LevelBadge({ level }: { level: Level }) {
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${tone[level[0]]}`}>{level}</span>
}
