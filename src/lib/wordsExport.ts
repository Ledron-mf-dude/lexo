import type { Tag } from '../types'
import type { WordWithTags } from './queries'

// Same "Notes in Plain Text" layout the importer reads: tab-separated, tags in column 5.
const quote = (s: string) => (/[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** Vocabulary (without learning progress) as a text file the import dialog can read back. */
export function wordsToText(words: WordWithTags[], tags: Tag[]): string {
  const tagName = new Map(tags.map((t) => [t.id, t.name.replace(/\s+/g, '_')]))
  const rows = words.map((w) =>
    [w.term, w.translation, w.definition ?? '', w.example ?? '', w.tagIds.map((id) => tagName.get(id)).filter(Boolean).join(' ')]
      .map(quote)
      .join('\t'),
  )
  return ['#separator:tab', '#html:false', '#tags column:5', ...rows].join('\n') + '\n'
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
