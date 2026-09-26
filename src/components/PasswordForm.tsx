import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

const MIN_LENGTH = 8

/** Sets a new password for the signed-in user (used after a reset link and from the account page). */
export default function PasswordForm({ onDone, submitLabel = 'Зберегти пароль' }: { onDone?: () => void; submitLabel?: string }) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < MIN_LENGTH) return setMessage({ ok: false, text: `Пароль має містити щонайменше ${MIN_LENGTH} символів.` })
    if (password !== repeat) return setMessage({ ok: false, text: 'Паролі не збігаються.' })
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setMessage({ ok: false, text: error.message })
    setPassword('')
    setRepeat('')
    setMessage({ ok: true, text: 'Пароль змінено.' })
    onDone?.()
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Новий пароль"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="field"
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Повторіть пароль"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        className="field"
      />
      {message && <p className={`text-sm ${message.ok ? 'text-good' : 'text-bad'}`}>{message.text}</p>}
      <button disabled={busy} className="btn-primary">
        {submitLabel}
      </button>
    </form>
  )
}
