import { useEffect, useMemo, useState } from 'react'
import { count, WORD_GEN } from '../lib/plural'
import { useFillDetails, type WordWithTags } from '../lib/queries'
import { fillFor, loadWordDetails, type DetailsDictionary } from '../lib/wordDetails'

/**
 * Offers to fill empty definitions and examples from the built-in dictionary. Hidden when there is nothing to fill,
 * so it appears once for an imported "word — translation" list and then stays out of the way.
 */
export default function FillDetailsCard({ words }: { words: WordWithTags[] }) {
  const [dict, setDict] = useState<DetailsDictionary | null>(null)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const fill = useFillDetails()

  useEffect(() => {
    loadWordDetails().then(setDict, () => {})
  }, [])

  const fills = useMemo(() => {
    if (!dict) return []
    return words.flatMap((w) => {
      const f = fillFor(w, dict)
      return f ? [{ id: w.id, ...f }] : []
    })
  }, [dict, words])

  if (fill.isSuccess) {
    return <p className="glass rounded-2xl p-4 text-sm text-good">Готово: пояснення й приклади додано до {count(fill.data, WORD_GEN)}.</p>
  }
  if (fills.length === 0) return null

  const withoutBoth = words.filter((w) => !w.definition?.trim() && !w.example?.trim()).length
  return (
    <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium">Доповнити пояснення й приклади</p>
        <p className="text-sm text-white/60">
          {withoutBoth > 0 ? `У ${count(withoutBoth, WORD_GEN)} немає ні пояснення, ні прикладу. ` : ''}Для {count(fills.length, WORD_GEN)} є пояснення простою англійською і приклад. Заповнюються тільки порожні поля. Після цього запрацюють вправи «Слово в реченні» і «Слово ↔ пояснення».
        </p>
        {fill.error && <p className="mt-1 text-sm text-bad">{(fill.error as Error).message}</p>}
      </div>
      <button
        onClick={() => fill.mutate({ fills, onProgress: (done, total) => setProgress([done, total]) })}
        disabled={fill.isPending}
        className="btn-primary w-full sm:w-auto"
      >
        {fill.isPending ? (progress ? `${progress[0]} / ${progress[1]}` : 'Зберігаю…') : 'Доповнити'}
      </button>
    </div>
  )
}
