import { useState, type KeyboardEvent } from 'react'

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions: string[]
}

/** Hashtag-style input: Enter or comma adds a tag, existing tags autocomplete via datalist. */
export default function TagInput({ value, onChange, suggestions }: Props) {
  const [draft, setDraft] = useState('')

  function commit() {
    const name = draft.trim().replace(/^#/, '')
    if (name && !value.includes(name)) onChange([...value, name])
    setDraft('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="field flex flex-wrap items-center gap-1.5">
      {value.map((tag) => (
        <span key={tag} className="flex items-center gap-1 rounded-full bg-accent/20 px-2.5 py-0.5 text-sm text-accent">
          {tag}
          <button
            type="button"
            aria-label={`Прибрати тег ${tag}`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="text-accent/70 hover:text-accent"
          >
            ×
          </button>
        </span>
      ))}
      <input
        list="tag-suggestions"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={value.length === 0 ? 'Теги (Enter, щоб додати)' : ''}
        className="min-w-24 flex-1 bg-transparent outline-none placeholder:text-white/35"
      />
      <datalist id="tag-suggestions">
        {suggestions
          .filter((s) => !value.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  )
}
