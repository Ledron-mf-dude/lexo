import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { bySlug } from '../lib/grammar'
import { checkText, sentenceCards, type Issue } from '../lib/languageTool'
import { count, WORD } from '../lib/plural'
import { useTitle } from '../lib/useTitle'
import { addCards, loadCards, removeCard } from '../lib/writingCards'

// Everyday topics that make a learner use several tenses; the English line is a hint, not a text to copy.
const TOPICS: [string, string][] = [
  ['Розкажіть про свій робочий день', 'What did you do at work today?'],
  ['Опишіть свої останні вихідні', 'How did you spend last weekend?'],
  ['Які у вас плани на наступний місяць?', 'What are you going to do next month?'],
  ['Розкажіть про своє хобі', 'What do you like doing in your free time and why?'],
  ['Опишіть місто, де ви живете', 'What is your city like?'],
  ['Розкажіть про найкращу подорож', 'Where have you travelled and what did you like most?'],
  ['Напишіть лист колезі з проханням про допомогу', 'Ask a colleague to help you with a task.'],
  ['Що б ви змінили у своїй роботі?', 'If you could change one thing at work, what would it be?'],
  ['Опишіть свого друга', 'What is your best friend like?'],
  ['Розкажіть про фільм чи серіал, який нещодавно подивилися', 'What have you watched recently?'],
  ['Як ви вивчаєте англійську?', 'How do you learn English and what is difficult for you?'],
  ['Розкажіть про своє дитинство', 'What did you use to do when you were a child?'],
  ['Опишіть проблему, яку ви нещодавно розв’язали', 'Describe a problem you solved recently.'],
  ['Порівняйте роботу в офісі й удома', 'Is it better to work from home or in an office?'],
  ['Який ваш ідеальний вихідний?', 'Describe your perfect day off.'],
  ['Розкажіть про технологію, без якої не можете жити', 'Which gadget or app could you not live without?'],
]

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

/** Writing coach: `/grammar/writing`. Write a few sentences, get them checked, turn the mistakes into personal cards. */
export default function Writing() {
  useTitle('Тренер письма')
  const [topic, setTopic] = useState(() => Math.floor(Math.random() * TOPICS.length))
  const [text, setText] = useState('')
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [found, setFound] = useState<Issue[]>([])
  const [skip, setSkip] = useState<Set<number>>(new Set())
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<number | null>(null)
  const [cards, setCards] = useState(loadCards)
  const [showCards, setShowCards] = useState(false)

  async function check() {
    setChecking(true)
    setError(null)
    setSaved(null)
    try {
      const result = await checkText(text)
      setIssues(result)
      setFound(result)
      setSkip(new Set())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setChecking(false)
    }
  }

  function edit(value: string) {
    setText(value)
    // Offsets no longer match the text: the list waits for a new check.
    if (issues) setIssues(null)
  }

  /** Applies one suggestion; the other flagged spots keep their places (shifted by the change in length). */
  function apply(issue: Issue, replacement: string) {
    setText((t) => t.slice(0, issue.offset) + replacement + t.slice(issue.offset + issue.length))
    const delta = replacement.length - issue.length
    setIssues((list) => (list ?? []).filter((i) => i !== issue).map((i) => (i.offset > issue.offset ? { ...i, offset: i.offset + delta } : i)))
  }

  function applyAll() {
    // From the end, so earlier offsets stay valid.
    let t = text
    for (const i of [...(issues ?? [])].filter((x) => x.replacements.length > 0).sort((a, b) => b.offset - a.offset))
      t = t.slice(0, i.offset) + i.replacements[0] + t.slice(i.offset + i.length)
    setText(t)
    setIssues((list) => (list ?? []).filter((i) => i.replacements.length === 0))
  }

  const learnable = useMemo(() => sentenceCards(found).map((card, idx) => ({ card, idx })), [found])

  function save() {
    const n = addCards(learnable.filter(({ idx }) => !skip.has(idx)).map(({ card }) => card))
    setSaved(n)
    setCards(loadCards())
  }

  const [uk, en] = TOPICS[topic]
  const n = words(text)
  return (
    <section className="space-y-5">
      <Link to="/grammar" className="text-sm text-white/50 hover:text-white">
        ← До граматики
      </Link>
      <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Тренер письма</h1>

      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white/40">Тема</p>
          <p className="font-medium">{uk}</p>
          <p className="text-sm text-white/45 italic">{en}</p>
        </div>
        <button onClick={() => setTopic((t) => (t + 1 + Math.floor(Math.random() * (TOPICS.length - 1))) % TOPICS.length)} className="btn-ghost text-sm">
          Інша тема
        </button>
      </div>

      <div className="space-y-2">
        <textarea
          rows={8}
          value={text}
          onChange={(e) => edit(e.target.value)}
          placeholder="Write 5–10 sentences in English…"
          spellCheck={false}
          className="field text-base leading-relaxed"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-white/40">{count(n, WORD)}</span>
          <button onClick={check} disabled={n < 3 || checking} className="btn-primary">
            {checking ? 'Перевіряю…' : 'Перевірити'}
          </button>
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>

      {issues && (
        <div className="space-y-3">
          {issues.length === 0 ? (
            <p className="glass rounded-2xl p-4 text-sm">
              <span className="text-good">Помилок не знайдено.</span>{' '}
              <span className="text-white/45">Перевірка не завжди помічає неправильний час у контексті (наприклад, «Yesterday I go»), тож перечитайте дієслова самі.</span>
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm tracking-widest text-white/40 uppercase">Знайдено: {issues.length}</h2>
                {issues.some((i) => i.replacements.length > 0) && (
                  <button onClick={applyAll} className="text-sm text-accent hover:underline">
                    Виправити все
                  </button>
                )}
              </div>
              <ul className="space-y-2">
                {issues.map((issue) => {
                  const article = issue.slug ? bySlug.get(issue.slug) : undefined
                  return (
                    <li key={`${issue.offset}-${issue.ruleId}`} className="glass space-y-2 rounded-2xl p-3 text-sm">
                      <p className="text-white/70">{issue.message}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-bad line-through decoration-bad/50">{issue.original || '␣'}</span>
                        {issue.replacements.length > 0 && <span className="text-white/30">→</span>}
                        {issue.replacements.map((r) => (
                          <button key={r} onClick={() => apply(issue, r)} className="chip text-good" title="Застосувати">
                            {r || '(прибрати)'}
                          </button>
                        ))}
                      </div>
                      {article && (
                        <Link to={`/grammar/${article.slug}`} className="inline-block text-xs text-accent hover:underline">
                          Стаття: {article.title}
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      )}

      {learnable.length > 0 && (
        <div className="glass space-y-3 rounded-2xl p-4">
          <p className="font-medium">Картки з ваших помилок</p>
          <p className="text-sm text-white/45">Речення, як ви його написали, і виправлене. Їх тренує кнопка «Тренувати мої помилки» нижче, у форматі «Знайди помилку».</p>
          <ul className="space-y-1.5 text-sm">
            {learnable.map(({ card, idx }) => (
              <li key={idx}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={!skip.has(idx)}
                    onChange={() => setSkip((s) => (s.has(idx) ? new Set([...s].filter((x) => x !== idx)) : new Set([...s, idx])))}
                    className="mt-1 accent-[var(--color-accent)]"
                  />
                  <span>
                    <span className="text-white/50 line-through decoration-bad/40">{card.wrong}</span>
                    <br />
                    <span className="text-good/90">{card.right}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {saved === null ? (
            <button onClick={save} disabled={learnable.every(({ idx }) => skip.has(idx))} className="btn-primary">
              Зберегти на повторення
            </button>
          ) : (
            <p className="text-sm text-good">{saved > 0 ? `Збережено нових карток: ${saved}.` : 'Ці речення вже є серед карток.'}</p>
          )}
        </div>
      )}

      {cards.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => setShowCards((s) => !s)} className="text-sm text-white/50 hover:text-white">
              Мої картки · {cards.length} {showCards ? '▴' : '▾'}
            </button>
            <Link to="/grammar/practice?type=mine" className="btn-ghost text-sm">
              Тренувати мої помилки
            </Link>
          </div>
          {showCards && (
            <ul className="glass divide-y divide-white/6 rounded-2xl text-sm">
              {cards.map((c) => (
                <li key={c.id} className="flex items-start gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="text-white/50 line-through decoration-bad/40">{c.wrong}</span>
                    <br />
                    <span className="text-good/90">{c.right}</span>
                  </span>
                  <button
                    onClick={() => {
                      removeCard(c.id)
                      setCards(loadCards())
                    }}
                    aria-label="Видалити картку"
                    className="rounded-lg px-2 py-1 text-white/40 hover:bg-bad/10 hover:text-bad"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs text-white/30">
        Перевірка —{' '}
        <a href="https://languagetool.org" target="_blank" rel="noreferrer" className="hover:text-white/60">
          LanguageTool
        </a>
        : текст надсилається на їхній сервер лише для перевірки.
      </p>
    </section>
  )
}
