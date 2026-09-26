import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

// Sign-up is off by default (accounts are created by the owner in Supabase); set VITE_ALLOW_SIGNUP=true to show it.
const ALLOW_SIGNUP = import.meta.env.VITE_ALLOW_SIGNUP === 'true'

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [sent, setSent] = useState(false) // the message is a confirmation, not an error

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    setSent(false)
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) setMessage(error.message)
      else if (!data.session) setMessage('Перевірте пошту: надіслано лист для підтвердження.')
    }
    setBusy(false)
  }

  async function forgotPassword() {
    if (!email) return setMessage('Спершу введіть email.')
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + import.meta.env.BASE_URL })
    setBusy(false)
    setSent(!error)
    setMessage(error ? error.message : 'Якщо такий акаунт існує, на пошту надіслано посилання для нового пароля.')
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="glass w-full max-w-sm space-y-4 rounded-3xl p-8">
        <h1 className="bg-gradient-to-r from-accent to-accent-alt bg-clip-text text-4xl font-light tracking-tight text-transparent">
          Lexo
        </h1>
        <p className="text-sm text-white/50">{mode === 'signin' ? 'Увійдіть у свій акаунт' : 'Створіть акаунт'}</p>
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
        />
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
        />
        {message && <p className={`text-sm ${sent ? 'text-good' : 'text-bad'}`}>{message}</p>}
        <button disabled={busy} className="btn-primary w-full">
          {mode === 'signin' ? 'Увійти' : 'Зареєструватись'}
        </button>
        {mode === 'signin' && (
          <button type="button" onClick={forgotPassword} className="w-full text-center text-sm text-white/40 hover:text-white">
            Забули пароль?
          </button>
        )}
        {ALLOW_SIGNUP && (
        <button
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="w-full text-center text-sm text-white/50 hover:text-white"
        >
          {mode === 'signin' ? 'Немає акаунта? Реєстрація' : 'Вже є акаунт? Вхід'}
        </button>
        )}
      </form>
    </div>
  )
}
