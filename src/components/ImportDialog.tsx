import { useState, type ChangeEvent } from 'react'
import { parseAnkiExports, type ParseResult } from '../lib/ankiImport'
import { useImportWords } from '../lib/queries'

interface Props {
  userId: string
  onClose: () => void
}

export default function ImportDialog({ userId, onClose }: Props) {
  const importWords = useImportWords(userId)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [extraTag, setExtraTag] = useState('')
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setFileName(files.map((f) => f.name).join(", "))
    setParseError(null)
    try {
      const result = parseAnkiExports(await Promise.all(files.map((f) => f.text())))
      if (result.words.length === 0) setParseError('У файлі не знайдено слів (потрібні щонайменше два поля).')
      setParsed(result)
    } catch (err) {
      setParsed(null)
      setParseError((err as Error).message)
    }
  }

  function run() {
    if (!parsed) return
    importWords.mutate({
      words: parsed.words,
      extraTag,
      onProgress: (done, total) => setProgress([done, total]),
    })
  }

  const result = importWords.data

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass max-h-full w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl bg-[#14161d]/80 p-6"
      >
        <h2 className="text-xl font-light">Імпорт з Anki</h2>

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
            <p className="text-sm text-white/50">
              Один або кілька файлів «Notes in Plain Text (.txt)» з Anki; однакові слова з різних файлів об'єднуються. Слова, що вже є в словнику, буде пропущено.
            </p>
            <input type="file" multiple accept=".txt,.tsv,text/plain" onChange={onFile} className="field" />

            {parseError && <p className="text-sm text-bad">{parseError}</p>}

            {parsed && parsed.words.length > 0 && (
              <div className="space-y-3">
                <div className="rounded-2xl bg-white/5 p-4 text-sm">
                  <p>
                    <span className="text-white/50">{fileName}:</span> рядків {parsed.totalRows}, слів до імпорту{' '}
                    <b>{parsed.words.length}</b>
                  </p>
                  {parsed.merged.length > 0 && (
                    <p className="mt-1 text-white/50">
                      Об'єднано дублікати з різними перекладами ({parsed.merged.length}): {parsed.merged.slice(0, 8).join(', ')}
                      {parsed.merged.length > 8 && '…'}
                    </p>
                  )}
                  <ul className="mt-3 space-y-0.5 text-white/70">
                    {parsed.words.slice(0, 5).map((w) => (
                      <li key={w.term}>
                        {w.term} <span className="text-white/40">— {w.translation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <input
                  placeholder="Додати тег до всіх слів (необов'язково)"
                  value={extraTag}
                  onChange={(e) => setExtraTag(e.target.value)}
                  className="field"
                />
              </div>
            )}

            {importWords.error && <p className="text-sm text-bad">{(importWords.error as Error).message}</p>}
            {importWords.isPending && progress && (
              <p className="text-sm text-white/60">
                Імпорт: {progress[0]} / {progress[1]}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="btn-ghost" disabled={importWords.isPending}>
                Скасувати
              </button>
              <button onClick={run} className="btn-primary" disabled={!parsed?.words.length || importWords.isPending}>
                {importWords.isPending ? 'Імпорт…' : `Імпортувати ${parsed?.words.length ?? ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
