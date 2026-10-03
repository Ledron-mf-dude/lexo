import { useOnline, usePendingAnswers } from '../lib/offline'
import { ANSWER, count } from '../lib/plural'

/** A quiet line at the top while there is no connection, or while answers given offline are still being sent. */
export default function OfflineBanner() {
  const online = useOnline()
  const pending = usePendingAnswers()
  if (online && pending === 0) return null
  return (
    <p role="status" className="mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
      {online
        ? `Надсилаємо збережені відповіді: ${pending}…`
        : `Немає мережі: показано збережені дані.${pending > 0 ? ` Ще не надіслано: ${count(pending, ANSWER)}.` : ' Відповіді збережуться й надішлються пізніше.'}`}
    </p>
  )
}
