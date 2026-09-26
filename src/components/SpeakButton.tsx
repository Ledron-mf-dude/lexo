import { canSpeak, speak } from '../lib/speech'

interface Props {
  text: string
  className?: string
}

/** Small speaker button; renders nothing in browsers without speech synthesis. */
export default function SpeakButton({ text, className = '' }: Props) {
  if (!canSpeak) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        speak(text)
      }}
      aria-label={`Вимовити «${text}»`}
      className={`inline-grid size-9 shrink-0 place-items-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-accent ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
  )
}
