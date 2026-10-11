import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { createOcr, type Ocr, type OcrLanguages, type OcrProgress } from '../lib/ocr'
import { count, WORD, WORD_GEN } from '../lib/plural'
import { useImportWords, type WordInput, type WordWithTags } from '../lib/queries'
import { loadTopicDictionary, suggestTags, type TopicDictionary } from '../lib/tagTaxonomy'
import { baseForms } from '../lib/textWords'
import { draftTranslations } from '../lib/translate'
import { fillFor, loadWordDetails, type DetailsDictionary } from '../lib/wordDetails'
import { parseWordLines, type Candidate } from '../lib/wordList'

interface Props {
  userId: string
  words: WordWithTags[]
  onClose: () => void
}

/** MyMemory is asked for a few words at a time: a hundred requests at once would be refused. */
const DRAFT_PARALLEL = 3

/**
 * Always English and Ukrainian together: with the English model alone the Cyrillic text of a list is read as Latin
 * gibberish, which is hard to tell from words. The Ukrainian model also reads Russian letters well enough to skip them.
 */
const LANGUAGES: OcrLanguages = 'eng+ukr'

/** «call sb back» is asked as «call someone back»: MyMemory does not know the dictionary's placeholders. */
const forTranslation = (term: string) =>
  term
    .trim()
    .replace(/\bsb\b/g, 'someone')
    .replace(/\bsth\b/g, 'something')
    .replace(/\bone's\b/g, 'your')

type Phase = 'pick' | 'reading' | 'review'

interface Row {
  id: number
  term: string
  translation: string
  example: string
  drafts: string[]
  /** The translation is a draft from MyMemory that the user has not touched. */
  auto: boolean
  /** none: nothing to look up; wait: a draft is on its way; done: asked (it may have found nothing). */
  draft: 'none' | 'wait' | 'done'
  uncertain: boolean
  include: boolean
}

const clean = (term: string) => term.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()

interface Preview {
  name: string
  url: string
}

/**
 * «Слова з картинки»: a photo or a screenshot of a word list (from a teacher, a textbook) is read in the browser,
 * the words are checked against the dictionary, and the new ones are added with a translation: the one printed next
 * to the word, or a draft from MyMemory. Only the words are sent to online services, never the picture.
 */
export default function AddFromImageDialog({ userId, words, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('pick')
  // Pictures often come with translations (a teacher's list): by default they are ignored and MyMemory is asked.
  const [pictureTranslations, setPictureTranslations] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [previews, setPreviews] = useState<Preview[]>([])
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [position, setPosition] = useState<[number, number]>([0, 0])
  const [error, setError] = useState('')
  const [extraTag, setExtraTag] = useState('')
  const [dragging, setDragging] = useState(false)
  const [details, setDetails] = useState<DetailsDictionary | null>(null)
  const [topics, setTopics] = useState<TopicDictionary | null>(null)
  const nextId = useRef(1)
  const ocrRef = useRef<Promise<Ocr> | null>(null)
  const urls = useRef<string[]>([])
  /** Rows whose draft translation is being fetched right now. */
  const asking = useRef(new Set<number>())
  const importWords = useImportWords(userId)

  useEffect(() => {
    loadWordDetails().then(setDetails, () => {})
    loadTopicDictionary().then(setTopics, () => {})
    return () => {
      ocrRef.current?.then((o) => o.terminate(), () => {})
      urls.current.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  const mine = useMemo(() => new Map(words.map((w) => [clean(w.term), w])), [words])
  const isKnown = (term: string) => mine.has(clean(term))
  /** A dictionary word this one is a form of ("dogs" for "dog"): shown as a hint, the word is not skipped for it. */
  const similarTo = (term: string) => (term.includes(' ') ? undefined : baseForms(term).slice(1).map((f) => mine.get(f)?.term).find(Boolean))

  function getOcr(): Promise<Ocr> {
    if (!ocrRef.current) {
      const ocr = createOcr(LANGUAGES, setProgress)
      ocr.catch(() => {
        if (ocrRef.current === ocr) ocrRef.current = null
      })
      ocrRef.current = ocr
    }
    return ocrRef.current
  }

  async function readFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return setError('Це не картинка: оберіть фото чи скріншот (JPG, PNG).')
    setError('')
    setProgress(null)
    setPhase('reading')
    try {
      const ocr = await getOcr()
      const options = { translations: pictureTranslations }
      const found: Candidate[] = []
      for (const [i, image] of images.entries()) {
        setPosition([i + 1, images.length])
        let list = parseWordLines(await ocr.read(image), options)
        // With the whole page as one block almost nothing was found: let Tesseract find the columns itself.
        if (list.length < 2) {
          const again = parseWordLines(await ocr.read(image, 'auto'), options)
          if (again.length > list.length) list = again
        }
        found.push(...list)
        const url = URL.createObjectURL(image)
        urls.current.push(url)
        setPreviews((p) => [...p, { name: image.name || 'Картинка', url }])
      }
      const taken = new Set(rows.map((r) => clean(r.term)))
      const fresh = found.filter((c, i) => !taken.has(clean(c.term)) && found.findIndex((x) => clean(x.term) === clean(c.term)) === i)
      if (fresh.length === 0 && rows.length === 0) {
        setError('Слів на картинці не знайдено. Спробуйте чіткіше фото або інший режим розпізнавання.')
        return setPhase('pick')
      }
      setRows((list) => [
        ...list,
        ...fresh.map((c): Row => {
          const known = isKnown(c.term)
          return {
            id: nextId.current++,
            term: c.term,
            translation: c.translation,
            example: c.example,
            drafts: [],
            auto: false,
            draft: c.translation || known ? 'none' : 'wait',
            uncertain: c.uncertain,
            include: !known,
          }
        }),
      ])
      setPhase('review')
    } catch (e) {
      setError((e as Error).message)
      setPhase(rows.length > 0 ? 'review' : 'pick')
    }
  }

  // The paste handler needs the latest readFiles (the options and rows change), so it goes through a ref.
  const readRef = useRef(readFiles)
  useEffect(() => {
    readRef.current = readFiles
  })
  useEffect(() => {
    if (phase === 'reading') return
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (files.length === 0) return
      e.preventDefault()
      void readRef.current(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [phase])

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // the same picture can be chosen again
    if (files.length > 0) void readFiles(files)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void readFiles(Array.from(e.dataTransfer.files))
  }

  function patch(id: number, change: Partial<Row> | ((row: Row) => Partial<Row>)) {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...(typeof change === 'function' ? change(r) : change) } : r)))
  }

  function setTerm(id: number, term: string) {
    // A typed or printed translation stays; a draft belongs to the old word and is asked for again.
    patch(id, (r) => (r.translation.trim() && !r.auto ? { term } : { term, translation: '', drafts: [], auto: false, draft: 'wait' }))
  }

  // Draft translations for the words the picture gave without one, a few at a time.
  useEffect(() => {
    const queue = rows.filter((r) => r.draft === 'wait' && r.include && r.term.trim().length >= 2 && !mine.has(clean(r.term)) && !asking.current.has(r.id))
    for (const r of queue.slice(0, Math.max(0, DRAFT_PARALLEL - asking.current.size))) {
      const term = r.term.trim()
      asking.current.add(r.id)
      draftTranslations(forTranslation(term))
        .catch(() => [] as string[])
        .then((drafts) => {
          asking.current.delete(r.id)
          // Applied only if the word is still the same one; otherwise the row is asked again with its new word.
          setRows((list) =>
            list.map((x) =>
              x.id === r.id && x.term.trim() === term
                ? { ...x, drafts, draft: 'done', ...(!x.translation.trim() && drafts[0] ? { translation: drafts[0], auto: true } : null) }
                : x,
            ),
          )
        })
    }
  }, [rows, mine])

  const pending = rows.filter((r) => r.include && r.draft === 'wait' && r.term.trim().length >= 2 && !isKnown(r.term))
  const chosen = rows.filter((r) => r.include && !isKnown(r.term))
  const ready = chosen.filter((r) => r.translation.trim() && r.term.trim().length >= 2)
  const withoutTranslation = chosen.length - ready.length - pending.length
  const knownCount = rows.filter((r) => isKnown(r.term)).length
  const uncertainCount = ready.filter((r) => r.uncertain).length

  function save() {
    const seen = new Set<string>()
    const list: WordInput[] = []
    for (const r of ready) {
      const term = r.term.trim()
      if (seen.has(term.toLowerCase())) continue
      seen.add(term.toLowerCase())
      const fill = details ? fillFor({ term, definition: null, example: r.example || null }, details) : null
      list.push({
        term,
        translation: r.translation.trim(),
        definition: fill?.definition ?? '',
        example: (r.example || fill?.example || '').trim(),
        tagNames: suggestTags(term, topics),
      })
    }
    importWords.mutate({ words: list, extraTag: extraTag.trim() })
  }

  function reset() {
    importWords.reset()
    setRows([])
    setPreviews([])
    urls.current.forEach((u) => URL.revokeObjectURL(u))
    urls.current = []
    setExtraTag('')
    setError('')
    setPhase('pick')
  }

  const busy = phase === 'reading' || importWords.isPending

  const picker = (
    <label className="btn-ghost cursor-pointer text-center text-sm">
      {phase === 'review' ? 'Додати ще картинку' : 'Обрати картинку'}
      <input type="file" accept="image/*" multiple onChange={onFiles} className="sr-only" />
    </label>
  )

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={busy ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass max-h-full w-full max-w-2xl space-y-4 overflow-y-auto rounded-3xl bg-panel/80 p-5 sm:p-6">
        <h2 className="text-xl font-light">Слова з картинки</h2>

        {importWords.isSuccess ? (
          <div className="space-y-4">
            <p className="text-good">
              Додано {count(importWords.data.added, WORD)}.
              {importWords.data.skipped > 0 && <span className="text-white/50"> Пропущено {count(importWords.data.skipped, WORD_GEN)}: вони вже були у словнику.</span>}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={reset} className="btn-ghost">
                Ще картинка
              </button>
              <button onClick={onClose} className="btn-primary">
                Готово
              </button>
            </div>
          </div>
        ) : phase === 'pick' ? (
          <div className="space-y-3">
            <p className="text-sm text-white/50">
              Додайте фото чи скріншот зі списком слів: від вчителя, з підручника. Текст читається прямо в браузері, сама картинка нікуди не надсилається. Далі ви перевірите слова й переклади, а додасться лише те, чого ще немає у словнику.
            </p>

            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" checked={pictureTranslations} onChange={(e) => setPictureTranslations(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-accent" />
              <span>
                Взяти переклади з картинки
                <span className="block text-xs text-white/55">
                  {pictureTranslations
                    ? 'Переклади з картинки підуть у словник як є. Підходить, коли вони українською.'
                    : 'Усе кирилицею на картинці буде проігноровано, а переклади знайде MyMemory: це чернетки, їх варто переглянути.'}
                </span>
              </span>
            </label>

            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed p-6 text-center text-sm text-white/60 ${dragging ? 'border-accent bg-accent/10' : 'border-white/20'}`}
            >
              <p>Перетягніть картинку сюди або вставте з буфера (Ctrl+V).</p>
              {picker}
            </div>
            <p className="text-xs text-white/55">Вперше завантажується модуль розпізнавання (5–10 МБ), далі він зберігається в браузері.</p>

            {error && <p className="text-sm text-bad">{error}</p>}
            <div className="flex justify-end">
              <button onClick={onClose} className="btn-ghost">
                Скасувати
              </button>
            </div>
          </div>
        ) : phase === 'reading' ? (
          <div className="space-y-3 py-4">
            <p className="animate-pulse text-white/70">
              {progress?.stage === 'read'
                ? `Розпізнаю${position[1] > 1 ? ` картинку ${position[0]} з ${position[1]}` : ''}… ${Math.round(progress.fraction * 100)}%`
                : 'Завантажую модуль розпізнавання…'}
            </p>
            <p className="text-xs text-white/55">Перший запуск довший: модуль і мовні дані завантажуються один раз.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-white/60">
              <span>
                Знайдено: {rows.length} · нових: {rows.length - knownCount}
                {knownCount > 0 && (
                  <>
                    {' '}
                    · у словнику: <span className="text-good/80">{knownCount}</span>
                  </>
                )}
              </span>
              <span className="flex gap-3">
                <button onClick={() => setRows((l) => l.map((r) => ({ ...r, include: !isKnown(r.term) })))} className="text-accent hover:underline">
                  Позначити всі
                </button>
                <button onClick={() => setRows((l) => l.map((r) => ({ ...r, include: false })))} className="text-accent hover:underline">
                  Зняти позначки
                </button>
              </span>
            </div>

            {previews.length > 0 && (
              <details className="text-sm text-white/50">
                <summary className="cursor-pointer hover:text-white">Показати картинку</summary>
                <div className="mt-2 space-y-2">
                  {previews.map((p) => (
                    <img key={p.url} src={p.url} alt={p.name} className="max-h-72 w-full rounded-xl object-contain" />
                  ))}
                </div>
              </details>
            )}

            <ul className="space-y-2">
              {rows.map((r) => {
                const known = isKnown(r.term)
                const similar = known ? undefined : similarTo(r.term)
                return (
                  <li key={r.id} className={`glass space-y-2 rounded-2xl p-3 ${known ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={r.include && !known}
                        disabled={known}
                        onChange={(e) => patch(r.id, { include: e.target.checked })}
                        aria-label={`Додати «${r.term}»`}
                        className="size-5 shrink-0 accent-accent"
                      />
                      <input value={r.term} onChange={(e) => setTerm(r.id, e.target.value)} aria-label="Слово" className="field min-w-0 flex-1 py-1.5 font-medium" />
                      {r.uncertain && !known && (
                        <span title="Розпізнано не зовсім упевнено: порівняйте з картинкою" className="shrink-0 text-xs text-warn">
                          перевірте
                        </span>
                      )}
                    </div>
                    {known ? (
                      <p className="text-xs text-white/55">Уже є у словнику — буде пропущено.</p>
                    ) : (
                      <>
                        <input
                          value={r.translation}
                          onChange={(e) => patch(r.id, { translation: e.target.value, auto: false })}
                          placeholder={r.draft === 'wait' ? 'Шукаю переклад…' : 'Переклад'}
                          aria-label="Переклад"
                          className="field py-1.5"
                        />
                        {r.drafts.length > 1 && (
                          <div className="flex flex-wrap gap-1.5">
                            {r.drafts.map((d) => (
                              <button key={d} type="button" onClick={() => patch(r.id, { translation: d, auto: true })} data-on={r.translation === d} className="chip text-xs">
                                {d}
                              </button>
                            ))}
                          </div>
                        )}
                        {similar && <p className="text-xs text-white/55">У словнику є схоже слово: {similar}</p>}
                        {r.example && <p className="text-sm text-white/60 italic">{r.example}</p>}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>

            <input placeholder="Тег для цих слів, наприклад «Урок 12» (необов'язково)" value={extraTag} onChange={(e) => setExtraTag(e.target.value)} className="field" />

            {error && <p className="text-sm text-bad">{error}</p>}
            {importWords.error && <p className="text-sm text-bad">{(importWords.error as Error).message}</p>}
            {pending.length > 0 && (
              <p className="animate-pulse text-sm text-white/60">
                Шукаю переклади: лишилось {pending.length}
              </p>
            )}
            {pending.length === 0 && withoutTranslation > 0 && (
              <p className="text-sm text-warn">
                Без перекладу: {withoutTranslation}. Впишіть переклад, інакше {withoutTranslation === 1 ? 'це слово' : 'ці слова'} не додадуться.
              </p>
            )}
            {pending.length === 0 && uncertainCount > 0 && (
              <p className="text-xs text-white/55">Слова з позначкою «перевірте» порівняйте з картинкою: розпізнавання могло помилитися.</p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <p className="mr-auto text-xs text-white/50">Переклад-чернетка — MyMemory. Надсилаються лише слова, не картинка.</p>
              {picker}
              <button onClick={onClose} className="btn-ghost" disabled={importWords.isPending}>
                Скасувати
              </button>
              <button onClick={save} disabled={ready.length === 0 || pending.length > 0 || importWords.isPending} className="btn-primary">
                {importWords.isPending ? 'Зберігаю…' : `Додати ${count(ready.length, WORD)}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
