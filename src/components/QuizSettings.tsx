import { autoNextPref, deckSizePref } from '../lib/prefs'

/** Per-device quiz settings, under the result: round length (one topic only) and auto-advance after a right answer. */
export default function QuizSettings({ deckSize }: { deckSize: boolean }) {
  const size = deckSizePref.use()
  const auto = autoNextPref.use()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/50">
      {deckSize && (
        <div className="flex items-center gap-2">
          <span>Запитань у колі</span>
          <div className="segmented" role="group" aria-label="Запитань у колі">
            {(['10', '20', 'all'] as const).map((v) => (
              <button key={v} onClick={() => deckSizePref.set(v)} data-on={size === v}>
                {v === 'all' ? 'уся тема' : v}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={auto === 'on'} onChange={(e) => autoNextPref.set(e.target.checked ? 'on' : 'off')} className="size-4 accent-[#7c9bff]" />
        Далі автоматично після правильної відповіді
      </label>
    </div>
  )
}
