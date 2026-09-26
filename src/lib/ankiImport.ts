/** Parser for Anki "Notes in Plain Text" exports (tab-separated, with #-directives). */

export interface ImportedWord {
  term: string
  translation: string
  definition: string
  example: string
  tagNames: string[]
}

export interface ParseResult {
  words: ImportedWord[]
  /** Terms that appeared several times and had their translations merged. */
  merged: string[]
  totalRows: number
}

/** RFC-4180-style parser with a custom separator: quoted fields may contain separators, newlines and "" escapes. */
function parseRows(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"' && field === '') {
      inQuotes = true
    } else if (ch === sep) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function stripHtml(value: string): string {
  const withBreaks = value.replace(/<br\s*\/?>/gi, ' ')
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

const SEPARATORS: Record<string, string> = { tab: '\t', comma: ',', semicolon: ';', space: ' ', pipe: '|' }

/** Parses several exports into one word list; the same term in different files is merged. */
export function parseAnkiExports(texts: string[]): ParseResult {
  const byTerm = new Map<string, ImportedWord>()
  const merged = new Set<string>()
  let totalRows = 0
  for (const text of texts) totalRows += parseInto(text, byTerm, merged)
  return { words: [...byTerm.values()], merged: [...merged], totalRows }
}

/** Returns the number of data rows read. */
function parseInto(text: string, byTerm: Map<string, ImportedWord>, merged: Set<string>): number {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const directives: Record<string, string> = {}
  let bodyStart = 0
  while (bodyStart < lines.length && lines[bodyStart].startsWith('#')) {
    const [key, ...rest] = lines[bodyStart].slice(1).split(':')
    directives[key.trim()] = rest.join(':').trim()
    bodyStart++
  }

  const sep = SEPARATORS[directives['separator'] ?? 'tab'] ?? '\t'
  const meta = (name: string) => {
    const n = Number(directives[`${name} column`])
    return Number.isInteger(n) && n > 0 ? n - 1 : -1
  }
  const tagsCol = meta('tags')
  const skip = new Set([meta('guid'), meta('deck'), meta('notetype'), tagsCol])
  const isHtml = directives['html'] === 'true'
  const clean = (v: string) => (isHtml ? stripHtml(v) : v.trim())

  const rows = parseRows(lines.slice(bodyStart).join('\n'), sep).filter((r) => r.some((c) => c.trim() !== ''))

  for (const row of rows) {
    const fields = row.filter((_, i) => !skip.has(i)).map(clean)
    const [term, translation, definition = '', example = ''] = fields
    if (!term || !translation) continue
    const tagNames = tagsCol >= 0 ? (row[tagsCol] ?? '').split(/\s+/).filter(Boolean) : []

    const key = term.toLowerCase()
    const existing = byTerm.get(key)
    if (!existing) {
      byTerm.set(key, { term, translation, definition, example, tagNames })
      continue
    }
    // Same word listed again (often a different meaning): merge instead of creating a duplicate card.
    const known = existing.translation.split('; ')
    const added = translation.split('; ').filter((part) => !known.includes(part))
    if (added.length > 0) {
      existing.translation += `; ${added.join('; ')}`
      merged.add(existing.term)
    }
    existing.definition ||= definition
    existing.example ||= example
    existing.tagNames = [...new Set([...existing.tagNames, ...tagNames])]
  }

  return rows.length
}
