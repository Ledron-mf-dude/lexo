import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { shortTitle, type useGrammarReview } from '../lib/grammarReview'

const SHOWN_PAIRS = 3

export type Pairs = ReturnType<typeof useGrammarReview>['pairs']

/** Topic pairs that are easy to confuse; pairs where both topics have current mistakes come first, framed in red. */
export function ContrastPairs({ pairs }: { pairs: Pairs }) {
  const navigate = useNavigate()
  const [all, setAll] = useState(false)
  const shown = all ? pairs : pairs.slice(0, SHOWN_PAIRS)
  return (
    <div className="glass space-y-2 rounded-2xl p-4">
      <p className="text-sm text-white/60">
        Контрастні пари <span className="text-white/35">· теми, які легко сплутати; назва теми під час вправи прихована</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {shown.map(({ pair, both }) => (
          <button
            key={pair.join()}
            onClick={() => navigate(`/grammar/practice?pair=${pair.join(',')}`)}
            className={`chip ${both ? 'border-bad/40! text-white' : ''}`}
            title={both ? 'В обох темах є ваші помилки' : undefined}
          >
            {shortTitle(pair[0])} / {shortTitle(pair[1])}
          </button>
        ))}
        {pairs.length > SHOWN_PAIRS && (
          <button onClick={() => setAll((a) => !a)} className="px-2 text-sm text-accent hover:underline">
            {all ? 'менше' : `усі ${pairs.length}`}
          </button>
        )}
      </div>
    </div>
  )
}
