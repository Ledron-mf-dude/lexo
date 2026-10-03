import { useState, type ReactNode } from 'react'

// Chart conventions: thin marks with a rounded data end, one hue per chart, recessive grid,
// text in ink colours (never the series colour), a hover tooltip on every mark and a hidden table for screen readers.

export interface Bar {
  key: string
  /** Short axis label, shown for the first / middle / last bar. */
  label: string
  value: number
  /** Full description for the tooltip. */
  detail: string
}

interface BarChartProps {
  data: Bar[]
  /** Tailwind background class of the bars. */
  color?: string
  height?: number
  ariaLabel: string
  unit: string
}

export function BarChart({ data, color = 'bg-accent', height = 132, ariaLabel, unit }: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const last = data.length - 1

  return (
    <figure className="space-y-2 pt-3" aria-label={ariaLabel}>
      <div className="relative" style={{ height }}>
        {/* one recessive gridline at the maximum, plus the baseline */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-white/8" />
        <span className="absolute -top-4 right-0 text-[10px] text-white/50 tabular-nums">{max}</span>
        <div className="absolute inset-x-0 bottom-0 border-t border-white/15" />

        <div className="absolute inset-0 flex items-end gap-[3px]" onMouseLeave={() => setHover(null)}>
          {data.map((d, i) => (
            <button
              key={d.key}
              type="button"
              aria-label={d.detail}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="group relative flex h-full flex-1 items-end outline-none"
            >
              <span
                className={`w-full rounded-t-[4px] transition-opacity ${d.value > 0 ? color : 'bg-white/10'} ${hover !== null && hover !== i ? 'opacity-40' : ''}`}
                style={{ height: d.value > 0 ? `${Math.max(3, (d.value / max) * 100)}%` : 2 }}
              />
            </button>
          ))}
        </div>

        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-white/15 bg-[#14161d] px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
            style={{
              left: `${Math.min(88, Math.max(12, ((hover + 0.5) / data.length) * 100))}%`,
              top: `${100 - Math.max(8, (data[hover].value / max) * 100)}%`,
            }}
          >
            {data[hover].detail}
          </div>
        )}
      </div>

      <div className="flex justify-between text-[11px] whitespace-nowrap text-white/55" aria-hidden>
        {[0, Math.floor(last / 2), last].map((i) => (
          <span key={i}>{data[i].label}</span>
        ))}
      </div>

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th>{d.label}</th>
              <td>
                {d.value} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

export interface Segment {
  key: string
  label: string
  value: number
  /** Tailwind background class. */
  color: string
}

/** Part-to-whole bar: segments separated by a 2px gap, legend with counts below (>= 2 series always get a legend). */
export function StackedBar({ segments, ariaLabel }: { segments: Segment[]; ariaLabel: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  return (
    <figure className="space-y-3" aria-label={ariaLabel}>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div key={s.key} className={s.color} style={{ width: `${(s.value / Math.max(1, total)) * 100}%` }} title={`${s.label}: ${s.value}`} />
          ))}
        {total === 0 && <div className="w-full bg-white/10" />}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className={`size-2.5 rounded-sm ${s.color}`} aria-hidden />
            <span className="text-white/60">{s.label}</span>
            <span className="ml-auto tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

/** One horizontal progress row: label, track, value text. */
export function Meter({ label, value, max, right, color = 'bg-accent', children }: { label: ReactNode; value: number; max: number; right?: ReactNode; color?: string; children?: ReactNode }) {
  const width = max === 0 ? 0 : Math.min(100, (value / max) * 100)
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 text-white/50 tabular-nums">{right}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
      {children}
    </div>
  )
}

export function Card({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="glass space-y-4 rounded-3xl p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-light">{title}</h2>
        {note && <span className="text-sm text-white/55">{note}</span>}
      </div>
      {children}
    </section>
  )
}

export function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs tracking-widest text-white/55 uppercase">{label}</p>
      <p className="mt-1 text-3xl font-light tabular-nums">{value}</p>
      {hint && <p className="text-xs text-white/55">{hint}</p>}
    </div>
  )
}
