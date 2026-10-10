import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  /** Button content; `open` lets it show an arrow state. */
  label: (open: boolean) => ReactNode
  /** Highlights the button when a non-default value is chosen. */
  active?: boolean
  children: (close: () => void) => ReactNode
  /** Panel width from the `sm` breakpoint up (on a phone the panel is the screen width minus the margins). */
  width?: string
  ariaLabel?: string
}

/** A button that opens a floating panel; closes on an outside click or Escape. */
export default function Dropdown({ label, active, children, width = 'sm:w-80', ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={ariaLabel}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
          active ? 'border-accent/60 bg-accent/10 text-accent' : 'border-white/12 text-white/70 hover:bg-white/5 hover:text-white'
        }`}
      >
        {label(open)}
        <svg viewBox="0 0 12 12" className={`size-3 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className={`absolute top-full left-0 z-30 mt-2 w-[calc(100vw-2rem)] rounded-2xl border border-white/12 bg-panel/97 p-2 shadow-[0_16px_50px_rgb(0_0_0/0.6)] backdrop-blur-xl ${width}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
