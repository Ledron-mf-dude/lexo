import { useState, type ChangeEvent } from 'react'
import { ACCEPTED_FILES, parseFiles, parsePasted, type ParseResult } from '../lib/importFormats'
import { useImportWords } from '../lib/queries'
import { loadTopicDictionary, suggestTags } from '../lib/tagTaxonomy'
import { fillFor, loadWordDetails } from '../lib/wordDetails'

interface Props {
  userId: string
  onClose: () => void
}

type Source = 'file' | 'paste'

const FORMATS = [
  ['Anki', '.apkg, .colpkg або «Notes in Plain Text» (.txt)'],
  ['Quizlet', 'експорт «Export» → скопіюйте текст і вставте'],
  ['Google Перекладач', 'збережені фрази, експорт у CSV'],
  ['Excel / Google Таблиці', '.xlsx або .csv: стовпці «слово, переклад, визначення, приклад, теги»'],
  ['Будь-який список', '«cat - кіт» по одному на рядок, TSV, JSON'],
] as const

export default function ImportDialog({ userId, onClose }: Props) {
  const importWords = useImportWords(userId)
  const [source, setSource] = useState<Source>('file')
  const [pasted, setPasted] = useState('')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [swap, setSwap] = useState(false)
  const [fileTags, setFileTags] = useState(true)
  const [autoTags, setAutoTags] = useState(true)
  const [autoDetails, setAutoDetails] = useState(true)
  const [extraTag, setExtraTag] = useState('')
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  function show(result: ParseResult) {
    setSwap(false)
    setParsed(result)
    setParseError(result.words.length === 0 ? 'Не знайдено жодної пари «слово — переклад».' : null)
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setFileName(files.map((f) => f.name).join(', '))
    setParseError(null)
    setReading(true)
    try {
      show(await parseFiles(files))
    } catch (err) {
      setParsed(null)
      setParseError((err as Error).message)
    } finally {
      setReading(false)
    }
  }

  function onPaste() {
    setFileName('Вставлений текст')
    try {
      show(parsePasted(pasted))
    } catch (err) {
      setParsed(null)
      setParseError((err as Error).message)
    }
  }

  const words = parsed ? parsed.words.map((w) => (swap ? { ...w, term: w.translation, translation: w.term } : w)) : []
  const hasFileTags = words.some((w) => w.tagNames.length > 0)

  async function run() {
    if (!parsed) return
    const [dict, details] = await Promise.all([autoTags ? loadTopicDictionary() : null, autoDetails ? loadWordDetails() : null])
    importWords.mutate({
      words: words.map((w) => ({
        ...w,
        ...(details ? fillFor(w, details) : null),
        tagNames: [...new Set([...(fileTags ? w.tagNames : []), ...(dict ? suggestTags(w.term, dict) : [])])],
      })),
      extraTag,
      onProgress: (done, total) => setProgress([done, total]),
    })
  }

  const result = importWords.data

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={importWords.isPending ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass max-h-full w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl bg-[#14161d]/90 p-5 sm:p-6">
        <h2 className="text-xl font-light">Імпорт слів</h2>

        {result ? (
          <>
            <p className="text-good">
              Додано слів: {result.added}
              {result.skipped > 0 && <span className="text-white/60"> · пропущено (вже є): {result.skipped}</span>}
            </p>
            <div className="flex justify-end">
              <button onClick={onClose} className="btn-primary">
                Готово
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="segmented w-full *:flex-1">
              <button onClick={() => setSource('file')} data-on={source === 'file'}>
                Файл
              </button>
              <button onClick={() => setSource('paste')} data-on={source === 'paste'}>
                Вставити текст
              </button>
            </div>

            {source === 'file' ? (
              <div className="space-y-2">
                <input type="file" multiple accept={ACCEPTED_FILES} onChange={onFile} className="field text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-white/80" />
                <details className="text-sm text-white/50">
                  <summary className="cursor-pointer hover:text-white">Які формати підходять</summary>
                  <ul className="mt-2 space-y-1">
                    {FORMATS.map(([name, hint]) => (
                      <li key={name}>
                        <span className="text-white/75">{name}</span> — {hint}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  rows={6}
                  placeholder={'Одне слово на рядок:\ncat - кіт\nlook forward to\tз нетерпінням чекати'}
                  className="field resize-y font-mono text-sm"
                />
                <button onClick={onPaste} disabled={!pasted.trim()} className="btn-ghost w-full text-sm">
                  Розпізнати
                </button>
              </div>
            )}

            {reading && <p className="animate-pulse text-sm text-white/50">Читаю файл…</p>}
            {parseError && <p className="text-sm text-bad">{parseError}</p>}

            {parsed && words.length > 0 && (
              <div className="space-y-3">
                <div className="space-y-3 rounded-2xl bg-white/5 p-4 text-sm">
                  <p>
                    <span className="text-white/50">{fileName}</span>
                    {parsed.formats.length > 0 && <span className="text-white/35"> · {parsed.formats.join(', ')}</span>}
                  </p>
                  <p>
                    Рядків {parsed.totalRows}, слів до імпорту <b>{words.length}</b>
                    {parsed.swapped && <span className="text-white/45"> · стовпці переставлено: англійське слово першим</span>}
                  </p>
                  {parsed.merged.length > 0 && (
                    <p className="text-white/50">
                      Об'єднано дублікати з різними перекладами ({parsed.merged.length}): {parsed.merged.slice(0, 6).join(', ')}
                      {parsed.merged.length > 6 && '…'}
                    </p>
                  )}
                  <table className="w-full table-fixed text-left">
                    <thead className="text-xs text-white/40">
                      <tr>
                        <th className="pb-1 font-normal">Слово</th>
                        <th className="pb-1 font-normal">Переклад</th>
                      </tr>
                    </thead>
                    <tbody className="text-white/80">
                      {words.slice(0, 5).map((w) => (
                        <tr key={w.term} className="border-t border-white/6">
                          <td className="truncate py-1 pr-2">{w.term}</td>
                          <td className="truncate py-1 text-white/55">{w.translation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button onClick={() => setSwap((s) => !s)} className="text-accent hover:underline">
                    ⇄ Поміняти стовпці місцями
                  </button>
                </div>

                <div className="space-y-2 text-sm">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={autoTags} onChange={(e) => setAutoTags(e.target.checked)} className="size-4 accent-[#7c9bff]" />
                    Підібрати теги за темами (почуття, робота, фразові дієслова…)
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={autoDetails} onChange={(e) => setAutoDetails(e.target.checked)} className="size-4 accent-[#7c9bff]" />
                    Додати пояснення англійською і приклад, де слово відоме
                  </label>
                  {hasFileTags && (
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={fileTags} onChange={(e) => setFileTags(e.target.checked)} className="size-4 accent-[#7c9bff]" />
                      Зберегти теги з файлу
                    </label>
                  )}
                </div>
                <input placeholder="Додати свій тег до всіх слів (необов'язково)" value={extraTag} onChange={(e) => setExtraTag(e.target.value)} className="field" />
              </div>
            )}

            {importWords.error && <p className="text-sm text-bad">{(importWords.error as Error).message}</p>}
            {importWords.isPending && progress && (
              <p className="text-sm text-white/60">
                Імпорт: {progress[0]} / {progress[1]}
              </p>
            )}

            <p className="text-xs text-white/35">Слова, що вже є в словнику, буде пропущено.</p>

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="btn-ghost" disabled={importWords.isPending}>
                Скасувати
              </button>
              <button onClick={run} className="btn-primary" disabled={!words.length || importWords.isPending}>
                {importWords.isPending ? 'Імпорт…' : `Імпортувати ${words.length || ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
