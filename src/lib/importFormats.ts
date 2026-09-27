/**
 * Word list import from the formats people usually have:
 * - Anki: "Notes in Plain Text" (.txt with #-directives) and deck packages (.apkg / .colpkg);
 * - tables: CSV / TSV / TXT with any common separator (Quizlet, Google Sheets, Excel "Save as CSV"), Excel .xlsx;
 * - Google Translate saved phrases (CSV with language names in the first two columns);
 * - JSON (an array of objects or pairs), and plain text pasted from anywhere ("word - translation" per line).
 */

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
  /** Human-readable formats that were recognised, e.g. «Anki (.apkg)». */
  formats: string[]
  /** Columns were detected as "translation, word" and swapped. */
  swapped: boolean
}

type Row = ImportedWord

// ---- shared helpers ------------------------------------------------------------------------------------

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
    } else if (text.startsWith(sep, i)) {
      row.push(field)
      field = ''
      i += sep.length - 1
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
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function stripHtml(value: string): string {
  const withBreaks = value.replace(/<br\s*\/?>|<\/div>|<\/p>/gi, ' ')
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html')
  return (doc.body.textContent ?? '')
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const HEADERS: Record<keyof Omit<Row, 'tagNames'> | 'tags', string[]> = {
  term: ['word', 'words', 'term', 'english', 'en', 'eng', 'front', 'expression', 'phrase', 'question', 'слово', 'термін', 'англійська', 'вираз'],
  translation: ['translation', 'ukrainian', 'uk', 'ua', 'back', 'meaning', 'answer', 'переклад', 'українська', 'значення'],
  definition: ['definition', 'explanation', 'description', 'визначення', 'пояснення', 'опис'],
  example: ['example', 'examples', 'sentence', 'context', 'usage', 'приклад', 'речення'],
  tags: ['tags', 'tag', 'теги', 'тег', 'category', 'topic', 'категорія'],
}

type Columns = { term: number; translation: number; definition: number; example: number; tags: number }

/** Column roles from a header row, or null when the first row is data. */
function headerColumns(row: string[]): Columns | null {
  const cells = row.map((c) => c.trim().toLowerCase().replace(/[:*]/g, ''))
  const find = (names: string[]) => cells.findIndex((c) => names.includes(c))
  const cols: Columns = { term: find(HEADERS.term), translation: find(HEADERS.translation), definition: find(HEADERS.definition), example: find(HEADERS.example), tags: find(HEADERS.tags) }
  const known = Object.values(cols).filter((i) => i >= 0).length
  if (known < 2 && !(known === 1 && cols.term >= 0)) return null
  if (cols.term < 0) cols.term = [0, 1, 2].find((i) => !Object.values(cols).includes(i)) ?? 0
  if (cols.translation < 0) cols.translation = [0, 1, 2].find((i) => i !== cols.term && !Object.values(cols).includes(i)) ?? 1
  return cols
}

const LANGUAGES = /^(english|ukrainian|russian|polish|german|french|spanish|italian|англійська|українська|російська|польська|німецька|французька|іспанська|італійська|detect language|визначити мову)$/i

/** Turns table rows (from CSV, Excel or JSON pairs) into words, guessing which column is which. */
function tableToRows(table: string[][], clean: (v: string) => string = (v) => v.trim()): { rows: Row[]; format?: string } {
  if (table.length === 0) return { rows: [] }
  // Google Translate phrasebook: "English","Ukrainian","hello","привіт".
  if (table[0].length >= 4 && LANGUAGES.test(table[0][0].trim()) && LANGUAGES.test(table[0][1].trim())) {
    const rows = table.map((r) => {
      const englishFirst = /english|англійськ/i.test(r[0])
      return { term: clean(englishFirst ? r[2] : r[3]), translation: clean(englishFirst ? r[3] : r[2]), definition: '', example: '', tagNames: [] }
    })
    return { rows, format: 'Google Перекладач' }
  }
  const header = headerColumns(table[0])
  const cols = header ?? { term: 0, translation: 1, definition: 2, example: 3, tags: -1 }
  const body = header ? table.slice(1) : table
  const cell = (r: string[], i: number) => (i >= 0 ? clean(r[i] ?? '') : '')
  return {
    rows: body.map((r) => ({
      term: cell(r, cols.term),
      translation: cell(r, cols.translation),
      definition: cell(r, cols.definition),
      example: cell(r, cols.example),
      tagNames: cell(r, cols.tags).split(/[\s,;]+/).filter(Boolean),
    })),
  }
}

// ---- plain text: Anki notes, CSV / TSV, "word - translation" lists -------------------------------------------

const ANKI_SEPARATORS: Record<string, string> = { tab: '\t', comma: ',', semicolon: ';', space: ' ', pipe: '|' }

function parseAnkiText(lines: string[]): Row[] {
  const directives: Record<string, string> = {}
  let bodyStart = 0
  while (bodyStart < lines.length && lines[bodyStart].startsWith('#')) {
    const [key, ...rest] = lines[bodyStart].slice(1).split(':')
    directives[key.trim()] = rest.join(':').trim()
    bodyStart++
  }
  const sep = ANKI_SEPARATORS[directives['separator'] ?? 'tab'] ?? '\t'
  const meta = (name: string) => {
    const n = Number(directives[`${name} column`])
    return Number.isInteger(n) && n > 0 ? n - 1 : -1
  }
  const tagsCol = meta('tags')
  const skip = new Set([meta('guid'), meta('deck'), meta('notetype'), tagsCol])
  const clean = (v: string) => (directives['html'] === 'true' ? stripHtml(v) : v.trim())
  return parseRows(lines.slice(bodyStart).join('\n'), sep).map((row) => {
    const [term = '', translation = '', definition = '', example = ''] = row.filter((_, i) => !skip.has(i)).map(clean)
    return { term, translation, definition, example, tagNames: tagsCol >= 0 ? (row[tagsCol] ?? '').split(/\s+/).filter(Boolean) : [] }
  })
}

/** The separator used on most lines: tab, semicolon, comma, pipe, or a dash between word and translation. */
function detectSeparator(lines: string[]): string | null {
  const sample = lines.slice(0, 30)
  // Comma goes after the dashes: "cat - кіт, котик" lists have commas inside translations.
  for (const sep of ['\t', ';', '|', ' — ', ' – ', ' - ', ' = ', ',', ': ']) {
    const hits = sample.filter((l) => l.includes(sep)).length
    if (hits >= Math.max(1, sample.length * 0.7)) return sep
  }
  return null
}

export function parseText(text: string): { rows: Row[]; format: string } {
  const clean = text.replace(/^﻿/, '')
  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines[0]?.startsWith('#separator') || lines[0]?.startsWith('#html')) return { rows: parseAnkiText(lines), format: 'Anki (.txt)' }
  const sep = detectSeparator(lines)
  if (!sep) throw new Error('Не вдалося розпізнати, де слово, а де переклад. Потрібні два стовпці через табуляцію, «;», «,» або « - ».')
  // Word lists like "cat - кіт" split only at the first dash: translations may contain dashes too.
  const table = /^[\t;|,]$/.test(sep) ? parseRows(clean, sep) : lines.map((l) => [l.slice(0, l.indexOf(sep)), l.slice(l.indexOf(sep) + sep.length)])
  const { rows, format } = tableToRows(table)
  return { rows, format: format ?? (sep === '\t' ? 'TSV / Quizlet' : /^[;,]$/.test(sep) ? 'CSV' : 'Текстовий список') }
}

// ---- JSON --------------------------------------------------------------------------------------------------

export function parseJson(text: string): Row[] {
  let data = JSON.parse(text) as unknown
  if (data && !Array.isArray(data) && typeof data === 'object') data = Object.values(data as object).find(Array.isArray) ?? []
  if (!Array.isArray(data)) throw new Error('У JSON немає списку слів.')
  const items = data as unknown[]
  if (items.every(Array.isArray)) return tableToRows((items as unknown[][]).map((r) => r.map((c) => String(c ?? '')))).rows
  // Objects are read one by one: different entries may name the same field differently ("translation" / "meaning").
  const str = (v: unknown) => (Array.isArray(v) ? v.join(' ') : v == null ? '' : String(v)).trim()
  const pick = (o: Record<string, unknown>, names: string[]) => {
    const key = Object.keys(o).find((k) => names.includes(k.toLowerCase()) && str(o[k]) !== '')
    return key ? str(o[key]) : ''
  }
  return items
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
    .map((o) => ({
      term: pick(o, HEADERS.term),
      translation: pick(o, HEADERS.translation),
      definition: pick(o, HEADERS.definition),
      example: pick(o, HEADERS.example),
      tagNames: pick(o, HEADERS.tags).split(/[\s,;]+/).filter(Boolean),
    }))
}

// ---- Excel .xlsx: the first sheet ---------------------------------------------------------------------------

export async function parseXlsx(buffer: ArrayBuffer): Promise<Row[]> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const files = unzipSync(new Uint8Array(buffer))
  const xml = (path: string) => (files[path] ? new DOMParser().parseFromString(strFromU8(files[path]), 'application/xml') : null)
  const shared = [...(xml('xl/sharedStrings.xml')?.getElementsByTagName('si') ?? [])].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''))
  const sheetPath = Object.keys(files)
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))[0]
  const sheet = sheetPath ? xml(sheetPath) : null
  if (!sheet) throw new Error('У файлі Excel не знайдено аркуша.')
  const colIndex = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
  const table = [...sheet.getElementsByTagName('row')].map((row) => {
    const out: string[] = []
    for (const c of row.getElementsByTagName('c')) {
      const type = c.getAttribute('t')
      const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
      const text = type === 's' ? (shared[Number(v)] ?? '') : type === 'inlineStr' ? (c.getElementsByTagName('t')[0]?.textContent ?? '') : v
      out[colIndex(c.getAttribute('r') ?? 'A')] = text
    }
    return Array.from(out, (x) => x ?? '')
  })
  return tableToRows(table.filter((r) => r.some((c) => c.trim() !== ''))).rows
}

// ---- Anki deck package .apkg / .colpkg ------------------------------------------------------------------------

export async function parseApkg(buffer: ArrayBuffer): Promise<Row[]> {
  const [{ unzipSync }, { default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('fflate'),
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
  ])
  const files = unzipSync(new Uint8Array(buffer))
  let bytes: Uint8Array | undefined
  // Anki 23.10+ stores the collection zstd-compressed; the legacy file next to it only says "please update Anki".
  if (files['collection.anki21b']) {
    const { decompress } = await import('fzstd')
    bytes = decompress(files['collection.anki21b'])
  } else bytes = files['collection.anki21'] ?? files['collection.anki2']
  if (!bytes) throw new Error('Це не колода Anki: у файлі немає колекції.')

  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const db = new SQL.Database(bytes)
  try {
    const result = db.exec('SELECT flds, tags FROM notes')
    const values = result[0]?.values ?? []
    return values.map(([flds, tags]) => {
      const fields = String(flds ?? '')
        .split('\x1f')
        .map(stripHtml)
        .filter((f) => f !== '')
      return { term: fields[0] ?? '', translation: fields[1] ?? '', definition: '', example: fields[2] && /[a-z]/i.test(fields[2]) && fields[2].includes(' ') ? fields[2] : '', tagNames: String(tags ?? '').split(/\s+/).filter(Boolean) }
    })
  } finally {
    db.close()
  }
}

// ---- everything together ----------------------------------------------------------------------------------------

const hasCyrillic = (s: string) => /[Ѐ-ӿ]/.test(s)
const hasLatin = (s: string) => /[a-z]/i.test(s)

/** Merges rows from all files: the same term twice becomes one word with both translations. */
function collect(groups: Row[][], formats: string[]): ParseResult {
  let rows = groups.flat().filter((r) => r.term && r.translation)
  // Columns in the order "переклад, word": swap, so the English side is always the word being learned.
  const reversed = rows.filter((r) => hasCyrillic(r.term) && !hasCyrillic(r.translation) && hasLatin(r.translation)).length
  const swapped = rows.length > 0 && reversed / rows.length > 0.6
  if (swapped) rows = rows.map((r) => ({ ...r, term: r.translation, translation: r.term }))

  const byTerm = new Map<string, ImportedWord>()
  const merged = new Set<string>()
  for (const r of rows) {
    const key = r.term.toLowerCase()
    const existing = byTerm.get(key)
    if (!existing) {
      byTerm.set(key, { ...r })
      continue
    }
    const known = existing.translation.split('; ')
    const added = r.translation.split('; ').filter((part) => !known.includes(part))
    if (added.length > 0) {
      existing.translation += `; ${added.join('; ')}`
      merged.add(existing.term)
    }
    existing.definition ||= r.definition
    existing.example ||= r.example
    existing.tagNames = [...new Set([...existing.tagNames, ...r.tagNames])]
  }
  return { words: [...byTerm.values()], merged: [...merged], totalRows: groups.reduce((n, g) => n + g.length, 0), formats: [...new Set(formats)], swapped }
}

export const ACCEPTED_FILES = '.txt,.tsv,.csv,.json,.xlsx,.apkg,.colpkg,text/plain,text/csv,application/json'

export async function parseFiles(files: File[]): Promise<ParseResult> {
  const groups: Row[][] = []
  const formats: string[] = []
  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (ext === 'apkg' || ext === 'colpkg') {
      groups.push(await parseApkg(await file.arrayBuffer()))
      formats.push('Anki (.apkg)')
    } else if (ext === 'xlsx') {
      groups.push(await parseXlsx(await file.arrayBuffer()))
      formats.push('Excel')
    } else if (ext === 'xls') {
      throw new Error('Старий формат .xls не підтримується: збережіть файл як .xlsx або CSV.')
    } else if (ext === 'json') {
      groups.push(parseJson(await file.text()))
      formats.push('JSON')
    } else {
      const { rows, format } = parseText(await file.text())
      groups.push(rows)
      formats.push(format)
    }
  }
  return collect(groups, formats)
}

export function parsePasted(text: string): ParseResult {
  const { rows, format } = parseText(text)
  return collect([rows], [format])
}
