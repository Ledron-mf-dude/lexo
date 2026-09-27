import { useEffect, useMemo, useRef, useState } from 'react'
import { count, WORD, WORD_GEN } from '../lib/plural'
import { useImportWords, type WordInput, type WordWithTags } from '../lib/queries'
import { playRecording, speak } from '../lib/speech'
import { loadTopicDictionary, suggestTags, type TopicDictionary } from '../lib/tagTaxonomy'
import { baseForms, findPhrases, lemma, sentenceAt, STOPWORDS, tokenize } from '../lib/textWords'
import { draftTranslations } from '../lib/translate'
import { lookupOnline } from '../lib/wiktionary'
import { loadWordDetails, type DetailsDictionary } from '../lib/wordDetails'

interface Props {
  userId: string
  words: WordWithTags[]
  onClose: () => void
}

const MAX_TEXT = 6000
// A sentence longer than this is a poor example card; the dictionary example is used instead.
const MAX_EXAMPLE = 220

interface Item {
  id: number
  /** Token indices of the first and last word of the selection. */
  from: number
  to: number
  term: string
  translation: string
  drafts: string[]
  definition: string
  example: string
  ipa: string
  pos: string
  audio: string
}

const clean = (term: string) => term.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * «Слова з тексту»: paste a paragraph, see which words are already in the dictionary, tap the new ones and add them
 * with a draft translation, the sentence as the example, and pronunciation. Only the chosen words go to online services.
 */
export default function AddFromTextDialog({ userId, words, onClose }: Props) {
  const [text, setText] = useState('')
  const [picking, setPicking] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [details, setDetails] = useState<DetailsDictionary | null>(null)
  const [topics, setTopics] = useState<TopicDictionary | null>(null)
  const nextId = useRef(1)
  const started = useRef(new Set<string>())
  const importWords = useImportWords(userId)

  useEffect(() => {
    loadWordDetails().then(setDetails, () => {})
    loadTopicDictionary().then(setTopics, () => {})
  }, [])

  const mine = useMemo(() => new Map(words.map((w) => [clean(w.term), w])), [words])
  const phrases = useMemo(() => words.map((w) => w.term).filter((t) => clean(t).includes(' ')), [words])
  const tokens = useMemo(() => tokenize(text), [text])

  // What each word token is: already in the dictionary (single word or part of a known phrase) or new.
  const knownAt = useMemo(() => {
    const known = new Map<number, string>()
    if (!picking) return known
    const spans = findPhrases(text, phrases)
    tokens.forEach((t, i) => {
      if (!t.word) return
      const span = spans.find((s) => t.start >= s.start && t.start < s.end)
      if (span) return known.set(i, span.term)
      const base = baseForms(t.text).find((f) => mine.has(f))
      if (base) known.set(i, mine.get(base)!.term)
    })
    return known
  }, [picking, text, tokens, phrases, mine])

  const inVocabulary = (term: string) => mine.has(term) || Boolean(details?.[term]) || Boolean(topics?.[term])

  const stats = useMemo(() => {
    const fresh = new Set<string>()
    const known = new Set<string>()
    tokens.forEach((t, i) => {
      if (!t.word) return
      if (knownAt.has(i)) known.add(knownAt.get(i)!.toLowerCase())
      else if (!STOPWORDS.has(t.text.toLowerCase())) fresh.add(t.text.toLowerCase())
    })
    return { fresh: fresh.size, known: known.size }
  }, [tokens, knownAt])

  /** The term for a selection: one word in its base form, or a phrase with its first word in the base form. */
  function termFor(from: number, to: number): string {
    const parts = tokens.slice(from, to + 1).filter((t) => t.word).map((t) => t.text.toLowerCase())
    parts[0] = lemma(parts[0], inVocabulary)
    return parts.join(' ')
  }

  function exampleFor(from: number): string {
    const sentence = sentenceAt(text, tokens[from].start)
    return sentence.length <= MAX_EXAMPLE ? sentence : ''
  }

  function toggle(i: number) {
    const hit = items.find((it) => i >= it.from && i <= it.to)
    if (hit) return setItems((list) => list.filter((it) => it !== hit))
    const term = termFor(i, i)
    const item: Item = { id: nextId.current++, from: i, to: i, term, translation: '', drafts: [], definition: '', example: exampleFor(i), ipa: '', pos: '', audio: '' }
    setItems((list) => [...list, item].sort((a, b) => a.from - b.from))
  }

  /** Grows a selection by the neighbouring word: "look" + "forward" + "to" makes the phrase. */
  function extend(item: Item, side: -1 | 1) {
    let j = side < 0 ? item.from - 1 : item.to + 1
    while (tokens[j] && !tokens[j].word) j += side
    if (!tokens[j] || items.some((it) => it !== item && j >= it.from && j <= it.to)) return
    const from = side < 0 ? j : item.from
    const to = side > 0 ? j : item.to
    update(item.id, { from, to, term: termFor(from, to), translation: '', drafts: [], ipa: '', pos: '', audio: '', definition: '' })
  }

  function update(id: number, patch: Partial<Item>) {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  // Each chosen term is looked up once: a draft translation (MyMemory) and pronunciation plus, for words the built-in
  // dictionary does not know, a definition (Wiktionary). Results are applied only if the item still has that term.
  useEffect(() => {
    for (const it of items) {
      const term = it.term.trim()
      const key = `${it.id}:${term}`
      if (term.length < 2 || started.current.has(key)) continue
      started.current.add(key)
      const apply = (patch: (cur: Item) => Partial<Item>) =>
        setItems((list) => list.map((x) => (x.id === it.id && x.term.trim() === term ? { ...x, ...patch(x) } : x)))
      draftTranslations(term).then(
        (drafts) => apply((cur) => ({ drafts, translation: cur.translation || drafts[0] || '' })),
        () => {},
      )
      const local = details?.[term.toLowerCase()]
      if (local) apply((cur) => ({ definition: cur.definition || local[0], example: cur.example || local[1] }))
      lookupOnline(term, !local).then(
        (entry) =>
          entry &&
          apply((cur) => ({
            ipa: entry.ipa ?? '',
            pos: entry.pos ?? '',
            audio: entry.audio ?? '',
            definition: cur.definition || entry.definition || '',
            example: cur.example || entry.example || '',
          })),
        () => {},
      )
    }
  }, [items, details])

  const already = items.filter((it) => mine.has(clean(it.term)))
  const missingTranslation = items.filter((it) => !it.translation.trim())

  function save() {
    const list: WordInput[] = items.map((it) => ({
      term: it.term.trim(),
      translation: it.translation.trim(),
      definition: it.definition.trim(),
      example: it.example.trim(),
      tagNames: suggestTags(it.term, topics),
      ipa: it.ipa,
      pos: it.pos,
      audio_url: it.audio,
    }))
    importWords.mutate({ words: list, extraTag: '' })
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={importWords.isPending ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass max-h-full w-full max-w-2xl space-y-4 overflow-y-auto rounded-3xl bg-[#14161d]/80 p-5 sm:p-6">
        <h2 className="text-xl font-light">Слова з тексту</h2>

        {importWords.isSuccess ? (
          <div className="space-y-4">
            <p className="text-good">
              Додано {count(importWords.data.added, WORD)}.
              {importWords.data.skipped > 0 && <span className="text-white/50"> Пропущено {count(importWords.data.skipped, WORD_GEN)}: вони вже були у словнику.</span>}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  importWords.reset()
                  setItems([])
                  setText('')
                  setPicking(false)
                }}
                className="btn-ghost"
              >
                Ще текст
              </button>
              <button onClick={onClose} className="btn-primary">
                Готово
              </button>
            </div>
          </div>
        ) : !picking ? (
          <div className="space-y-3">
            <p className="text-sm text-white/50">
              Вставте абзац англійською: з документації, статті чи листа. Далі побачите, які слова вже є у словнику, і торкнетеся нових, щоб їх додати.
            </p>
            <textarea
              rows={8}
              maxLength={MAX_TEXT}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste an English text here…"
              className="field"
            />
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="btn-ghost">
                Скасувати
              </button>
              <button onClick={() => setPicking(true)} disabled={!tokens.some((t) => t.word)} className="btn-primary">
                Далі
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-white/45">
              <span>
                Нових слів: {stats.fresh} · у словнику: <span className="text-good/80">{stats.known}</span>
              </span>
              <button
                onClick={() => {
                  setPicking(false)
                  setItems([])
                }}
                className="text-accent hover:underline"
              >
                Змінити текст
              </button>
            </div>

            <p className="glass max-h-[40vh] overflow-y-auto rounded-2xl p-4 text-lg leading-9 whitespace-pre-wrap">
              {tokens.map((t, i) => {
                if (!t.word) return <span key={i}>{t.text}</span>
                const known = knownAt.get(i)
                if (known)
                  return (
                    <span key={i} title={`У словнику: ${known}`} className="text-good/80 underline decoration-good/30 decoration-dotted underline-offset-4">
                      {t.text}
                    </span>
                  )
                const selected = items.some((it) => i >= it.from && i <= it.to)
                const stop = STOPWORDS.has(t.text.toLowerCase())
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggle(i)}
                    className={`rounded-md px-0.5 transition-colors ${selected ? 'bg-accent/25 text-accent' : stop ? 'text-white/35 hover:bg-white/10' : 'hover:bg-white/10'}`}
                  >
                    {t.text}
                  </button>
                )
              })}
            </p>
            <p className="text-xs text-white/35">
              Торкніться нового слова, щоб додати; ще раз — щоб прибрати. Фразу зберете кнопками ‹+ і +› біля слова. Зелені слова вже є у словнику.
            </p>

            {items.length > 0 && (
              <ul className="space-y-2">
                {items.map((it) => (
                  <li key={it.id} className="glass space-y-2 rounded-2xl p-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        value={it.term}
                        onChange={(e) => update(it.id, { term: e.target.value, drafts: [], ipa: '', pos: '', audio: '' })}
                        aria-label="Слово"
                        className="field min-w-0 flex-1 py-1.5 font-medium"
                      />
                      <button type="button" onClick={() => extend(it, -1)} title="Додати слово ліворуч" className="rounded-lg px-2 py-1 text-sm text-white/50 hover:bg-white/10 hover:text-white">
                        ‹+
                      </button>
                      <button type="button" onClick={() => extend(it, 1)} title="Додати слово праворуч" className="rounded-lg px-2 py-1 text-sm text-white/50 hover:bg-white/10 hover:text-white">
                        +›
                      </button>
                      <button type="button" onClick={() => setItems((list) => list.filter((x) => x !== it))} aria-label="Прибрати" className="rounded-lg px-2 py-1 text-white/40 hover:bg-bad/10 hover:text-bad">
                        ✕
                      </button>
                    </div>
                    {(it.ipa || it.audio) && (
                      <p className="flex items-center gap-2 text-sm text-white/45">
                        {it.ipa && <span className="font-mono">{it.ipa}</span>}
                        <button type="button" onClick={() => (it.audio ? playRecording(it.audio, it.term) : speak(it.term))} className="text-accent hover:underline">
                          ▶
                        </button>
                      </p>
                    )}
                    {mine.has(clean(it.term)) && <p className="text-xs text-white/40">Уже є у словнику — буде пропущено.</p>}
                    <input
                      value={it.translation}
                      onChange={(e) => update(it.id, { translation: e.target.value })}
                      placeholder="Переклад"
                      className="field py-1.5"
                    />
                    {it.drafts.length > 1 && (
                      <div className="flex flex-wrap gap-1.5">
                        {it.drafts.map((d) => (
                          <button key={d} type="button" onClick={() => update(it.id, { translation: d })} data-on={it.translation === d} className="chip text-xs">
                            {d}
                          </button>
                        ))}
                      </div>
                    )}
                    {it.example && <p className="text-sm text-white/45 italic">{it.example}</p>}
                  </li>
                ))}
              </ul>
            )}

            {importWords.error && <p className="text-sm text-bad">{(importWords.error as Error).message}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <p className="mr-auto text-xs text-white/30">Переклад-чернетка — MyMemory, вимова — Wiktionary. Надсилаються лише вибрані слова, не весь текст.</p>
              <button onClick={onClose} className="btn-ghost" disabled={importWords.isPending}>
                Скасувати
              </button>
              <button onClick={save} disabled={items.length === 0 || missingTranslation.length > 0 || importWords.isPending} className="btn-primary">
                {importWords.isPending
                  ? 'Зберігаю…'
                  : missingTranslation.length > 0 && items.length > 0
                    ? `Немає перекладу: ${missingTranslation.length}`
                    : `Додати ${count(items.length - already.length, WORD)}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
