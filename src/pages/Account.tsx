import QuizSettings from '../components/QuizSettings'
import PasswordForm from '../components/PasswordForm'
import { useAuth } from '../lib/authContext'
import { useTags, useWords } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { downloadText, wordsToText } from '../lib/wordsExport'
import { canSpeak, setAutoSpeak, speak, useAutoSpeak } from '../lib/speech'
import { useTitle } from '../lib/useTitle'
import { setAccent, useAccent } from '../lib/accent'

export default function Account() {
  useTitle('Акаунт')
  const { session } = useAuth()
  const words = useWords()
  const tags = useTags()
  const ready = words.data !== undefined && tags.data !== undefined
  const autoSpeak = useAutoSpeak()
  const accent = useAccent()

  function exportWords() {
    if (!words.data || !tags.data) return
    const date = new Date().toISOString().slice(0, 10)
    downloadText(`lexo-words-${date}.txt`, wordsToText(words.data, tags.data))
  }

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Акаунт</h1>

      <div className="glass space-y-1 rounded-3xl p-6">
        <p className="text-xs tracking-widest text-white/55 uppercase">Email</p>
        <p>{session?.user.email}</p>
      </div>

      {canSpeak && (
        <div className="glass space-y-3 rounded-3xl p-6">
          <h2 className="text-lg font-light">Озвучування</h2>
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm text-white/70">
              Вимовляти слово автоматично під час практики
              <span className="block text-xs text-white/55">Кнопка 🔊 біля слова працює завжди. Налаштування діє на цьому пристрої.</span>
            </span>
            <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} className="size-5 shrink-0 accent-[#7c9bff]" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-white/70">
              Вимова
              <span className="block text-xs text-white/55">Голос, транскрипція й запис для нових слів, правопис у «Тренері письма». Уже збережені записи не змінюються.</span>
            </span>
            <div className="segmented">
              <button onClick={() => setAccent('GB')} data-on={accent === 'GB'}>
                Британська
              </button>
              <button onClick={() => setAccent('US')} data-on={accent === 'US'}>
                Американська
              </button>
            </div>
          </div>
          <button onClick={() => speak(accent === 'US' ? 'Hello! This is how words will sound. Color, center, schedule.' : 'Hello! This is how words will sound. Colour, centre, schedule.')} className="btn-ghost text-sm">
            Перевірити звук
          </button>
        </div>
      )}

      <div className="glass space-y-3 rounded-3xl p-6">
        <h2 className="text-lg font-light">Граматичні вправи</h2>
        <p className="text-sm text-white/50">Скільки запитань давати за одне коло теми і чи переходити далі самому після правильної відповіді. Налаштування діє на цьому пристрої.</p>
        <QuizSettings deckSize />
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
