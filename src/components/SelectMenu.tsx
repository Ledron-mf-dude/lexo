import type { ReactNode } from 'react'
import Dropdown from './Dropdown'

export interface Option<T extends string> {
  value: T | null
  label: string
  count?: number
}

interface Props<T extends string> {
  /** Shown before the value: «Тема: Усі». */
  label: string
  value: T | null
  options: Option<T>[]
  onChange: (value: T | null) => void
  width?: string
  footer?: ReactNode
}

/** A single-choice dropdown for a filter with many options (a long row of pills does not scale). */
export default function SelectMenu<T extends string>({ label, value, options, onChange, width, footer }: Props<T>) {
  const current = options.find((o) => o.value === value) ?? options[0]
  return (
    <Dropdown
      active={value !== null}
      width={width}
      label={() => (
        <>
          <span className="text-white/45">{label}:</span>
          <span className="max-w-[12rem] truncate">{current.label}</span>
        </>
      )}
    >
      {(close) => (
        <div className="max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain">
          {options.map((o) => (
            <button
              key={o.value ?? '__all'}
              type="button"
              onClick={() => {
                onChange(o.value)
                close()
              }}
              aria-pressed={o.value === value}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${o.value === value ? 'bg-accent/15 text-accent' : 'text-white/75 hover:bg-white/8'}`}
            >
              <span className="min-w-0">{o.label}</span>
              {o.count !== undefined && <span className="shrink-0 text-xs text-white/35 tabular-nums">{o.count}</span>}
            </button>
          ))}
          {footer}
        </div>
      )}
    </Dropdown>
  )
}
