import { use, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import { useLogAnswer } from '../lib/exerciseLog'
import { loadQuestions, withVariant, type Item } from '../lib/exercises'
import { useFocusMode } from '../lib/focusMode'
import { bySlug, type Level } from '../lib/grammar'
import { BLOCK_SIZE, drawBlock, PASS_MARK, passedLevel, PLACEMENT_LEVELS, placementSlugs, savePlacement, studyLevelAfter, type Placement as Result } from '../lib/learningPath'
import { useTitle } from '../lib/useTitle'
import { Feedback, QuestionView, type Outcome } from './ExerciseQuiz'


/**
 * Placement test: `/grammar/placement`. Blocks of questions from A1 up; a failed block does not end the test,
 * it just moves on. The test ends itself only on a complete miss (a whole block wrong) or the last level,
 * and the learner can end it early with ✕.
 */
export default function Placement() {
  // The questions of the test's topics load first (the route shows «Завантаження…» meanwhile).
  use(loadQuestions(placementSlugs))
  useTitle('Тест рівня')
  const { session } = useAuth()
  const navigate = useNavigate()
  const { mutate: logAnswer } = useLogAnswer(session!.user.id)
  const [started, setStarted] = useState(false)
  const [levelIndex, setLevelIndex] = useState(0)
  const [block, setBlock] = useState<Item[]>(() => drawBlock(PLACEMENT_LEVELS[0]).map(withVariant))
  const [index, setIndex] = useState(0)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [scores, setScores] = useState<Partial<Record<Level, number>>>({})
  const [weak, setWeak] = useState<string[]>([])
  const [result, setResult] = useState<Result | null>(null)

  const level = PLACEMENT_LEVELS[levelIndex]
  const item = block[index]
  useFocusMode(started && !result)

  // Answers go to the exercise log like any other: mistakes from the test show up in «Робота над помилками».
  function answer(o: Outcome) {
    if (outcome) return
    setOutcome(o)
    logAnswer({ slug: item.slug, questionId: item.q.id, correct: o.correct })
    if (o.correct) setScores((s) => ({ ...s, [level]: (s[level] ?? 0) + 1 }))
    else setWeak((w) => (w.includes(item.slug) ? w : [...w, item.slug]))
  }

  function finish(finalScores: Partial<Record<Level, number>>) {
    const r: Result = { passed: passedLevel(finalScores), scores: finalScores, weak, date: new Date().toISOString() }
    savePlacement(r)
    setResult(r)
  }

  function next() {
    setOutcome(null)
    if (index + 1 < block.length) return setIndex(index + 1)
    // End of a block: a complete miss means the level is too high to be worth continuing.
    const score = scores[level] ?? 0
    const last = levelIndex + 1 >= PLACEMENT_LEVELS.length
    if (score === 0 || last) return finish(scores)
    setLevelIndex(levelIndex + 1)
    setBlock(drawBlock(PLACEMENT_LEVELS[levelIndex + 1]).map(withVariant))
    setIndex(0)
  }

  if (result) {
    const study = studyLevelAfter(result.passed)
    const allPassed = result.passed === PLACEMENT_LEVELS.at(-1)
    return (
      <section className="space-y-5">
        <div className="glass space-y-3 rounded-[2rem] p-8 text-center">
          <p className="text-xs tracking-widest text-white/55 uppercase">Ваш рівень граматики</p>
          <p className="text-5xl font-light">{result.passed ?? 'A1'}{allPassed ? '+' : ''}</p>
          <p className="text-white/55">
            {result.passed === null
              ? 'Почнімо з основ: маршрут відкриється з тем A1.'
              : allPassed
                ? 'Усі рівні тесту пройдено. У маршруті — теми C1, щоб закріпити.'
                : `Далі — теми рівня ${study}.`}
          </p>
        </div>
        <div className="glass space-y-2 rounded-2xl p-4">
          {PLACEMENT_LEVELS.slice(0, levelIndex + 1).map((l) => {
            const s = result.scores[l] ?? 0
            return (
              <div key={l} className="flex items-center gap-3 text-sm">
                <span className="w-10 text-white/60">{l}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full ${s >= PASS_MARK ? 'bg-good' : 'bg-bad/70'}`} style={{ width: `${(s / BLOCK_SIZE) * 100}%` }} />
                </div>
                <span className="w-10 text-right text-white/60 tabular-nums">
                  {s} / {BLOCK_SIZE}
                </span>
              </div>
            )
          })}
        </div>
        {result.weak.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm tracking-widest text-white/55 uppercase">Теми з помилками</h2>
            <ul className="glass divide-y divide-white/6 overflow-hidden rounded-2xl text-sm">
              {result.weak.map((slug) => (
                <li key={slug}>
                  <Link to={`/grammar/${slug}`} className="block px-4 py-2.5 hover:bg-white/5">
                    {bySlug.get(slug)?.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/grammar')} className="btn-primary">
            До маршруту
          </button>
          <button
            onClick={() => {
              setResult(null)
              setStarted(false)
              setLevelIndex(0)
              setBlock(drawBlock(PLACEMENT_LEVELS[0]).map(withVariant))
              setIndex(0)
              setScores({})
              setWeak([])
            }}
            className="btn-ghost"
          >
            Пройти ще раз
          </button>
        </div>
      </section>
    )
  }

  if (!started) {
    return (
      <section className="space-y-5">
        <Link to="/grammar" className="text-sm text-white/50 hover:text-white">
          ← До граматики
        </Link>
        <div className="glass space-y-4 rounded-[2rem] p-6 sm:p-8">
          <h1 className="text-2xl font-light tracking-tight">Тест рівня граматики</h1>
          <ul className="list-disc space-y-1.5 pl-5 text-white/60">
            <li>
              Запитання йдуть блоками по {BLOCK_SIZE} від A1 до C1, до {BLOCK_SIZE * PLACEMENT_LEVELS.length} запитань, 10–15 хвилин.
            </li>
            <li>
              Одна помилка не зупиняє тест: він іде далі до наступного рівня, а тема з помилкою просто потрапить у маршрут. Тест зупиниться сам, лише якщо цілий блок вийде невірним — це знак, що рівень явно зарано. Натиснувши «✕», можна завершити раніше й подивитись результат.
            </li>
            <li>Після тесту на сторінці «Граматика» з'явиться маршрут: теми вашого рівня по порядку, першими — ті, де були помилки.</li>
            <li>Відповіді записуються, як у звичайних вправах, тож помилки потраплять у «Роботу над помилками».</li>
          </ul>
          <button onClick={() => setStarted(true)} className="btn-primary w-full sm:w-auto">
            Почати тест
          </button>
        </div>
      </section>
    )
  }

  const done = PLACEMENT_LEVELS.slice(0, levelIndex).length * BLOCK_SIZE + index
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3 text-sm text-white/50">
        <button onClick={() => finish(scores)} aria-label="Завершити тест" className="hover:text-white">
          ✕
        </button>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-accent transition-all" style={{ width: `${(done / (BLOCK_SIZE * PLACEMENT_LEVELS.length)) * 100}%` }} />
        </div>
        <span className="tabular-nums">
          {level} · {index + 1} / {block.length}
        </span>
      </div>
      {/* No topic name above the question: in a test it would be a hint. */}
      <div key={`${level}-${index}`}>
        <QuestionView q={item.q} outcome={outcome} onAnswer={answer} />
      </div>
      {outcome && <Feedback q={item.q} outcome={outcome} last={false} onNext={next} />}
    </section>
  )
}
