import PasswordForm from '../components/PasswordForm'
import { useAuth } from '../lib/authContext'

/** Shown once after a password-reset or invite link. */
export default function SetPassword() {
  const { passwordSet } = useAuth()
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="glass w-full max-w-sm space-y-4 rounded-3xl p-8">
        <h1 className="bg-gradient-to-r from-accent to-accent-alt bg-clip-text text-4xl font-light tracking-tight text-transparent">Lexo</h1>
        <p className="text-sm text-white/50">Задайте новий пароль, щоб продовжити.</p>
        <PasswordForm onDone={passwordSet} submitLabel="Продовжити" />
      </div>
    </div>
  )
}
