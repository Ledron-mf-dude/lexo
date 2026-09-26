import PasswordForm from '../components/PasswordForm'
import { useAuth } from '../lib/auth'
import { useTags, useWords } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { downloadText, wordsToText } from '../lib/wordsExport'

export default function Account() {
  const { session } = useAuth()
  const words = useWords()
  const tags = useTags()
  const ready = words.data !== undefined && tags.data !== undefined

  function exportWords() {
    if (!words.data || !tags.data) return
    const date = new Date().toISOString().slice(0, 10)
    downloadText(`lexo-words-${date}.txt`, wordsToText(words.data, tags.data))
  }

  return (
    <section className="space-y-5">
      <h1 className="text-3xl font-light tracking-tight">Акаунт</h1>

      <div className="glass space-y-1 rounded-3xl p-6">
        <p className="text-xs tracking-widest text-white/40 uppercase">Email</p>
        <p>{session?.user.email}</p>
      </div>

      <div className="glass space-y-3 rounded-3xl p-6">
        <h2 className="text-lg font-light">Змінити пароль</h2>
        <PasswordForm />
      </div>

      <div className="glass space-y-3 rounded-3xl p-6">
        <h2 className="text-lg font-light">Резервна копія словника</h2>
        <p className="text-sm text-white/50">
          Завантажує слова, переклади й теги (без прогресу вивчення) у текстовий файл. Його можна імпортувати назад на сторінці «Слова» або
          передати іншій людині.
        </p>
        <button onClick={exportWords} disabled={!ready} className="btn-ghost">
          {ready ? `Експортувати слова (${words.data!.length})` : 'Завантаження…'}
        </button>
      </div>

      <button onClick={() => supabase.auth.signOut()} className="btn-ghost w-full">
        Вийти
      </button>
    </section>
  )
}
