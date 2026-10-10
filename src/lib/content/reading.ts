// Parsing of graded reading texts (src/content/reading/<slug>.md). Pure functions with no browser or Vite APIs:
// the content plugin (vite/lexoContent.ts) runs them at build time.
//
// A text file:
//
//   ---
//   title: A New Flat
//   level: A2
//   topic: Дім
//   summary: One line in Ukrainian for the list.
//   ---
//   Paragraphs of the text, separated by blank lines.
//
//   ## Слова
//   - move in — переїхати, заселитися
//   - bring [brought] — принести          (forms in brackets: how the word appears in the text)
//
//   ## Граматика
//   - past-simple — *We moved in last Saturday.* — why this sentence uses the form (Ukrainian)
//
//   ## Запитання
//   ? Why did they move?
//   - wrong option
//   + right option
//   - wrong option
//   = Explanation in Ukrainian: where the text says so, why the other options fail.

export const READING_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export type ReadingLevel = (typeof READING_LEVELS)[number]

/** What the list needs, always in the bundle. */
export interface TextMeta {
  slug: string
  title: string
  level: ReadingLevel
  topic: string
  summary: string
  /** Number of words in the text. */
  words: number
  /** Reading time for a learner, at about 100 words a minute. */
  minutes: number
  /** Grammar articles the text practises (slugs from «Граматика»). */
  grammar: string[]
  questions: number
}

export interface GlossEntry {
  term: string
  /** Forms in which the term appears in the text, when they are not simple endings (brought, went). */
  forms: string[]
  uk: string
}

export interface GrammarNote {
  slug: string
  /** The sentence from the text, with the grammar in *italics* like the articles write examples. */
  example: string
  note: string
}

export interface ReadingQuestion {
  q: string
  options: string[]
  answer: number
  why: string
}

/** The part of a text that loads when it is opened. */
export interface TextContent {
  paragraphs: string[]
  glossary: GlossEntry[]
  grammar: GrammarNote[]
  questions: ReadingQuestion[]
}

const DASH = /\s+[—–]\s+/

function frontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: raw }
  const meta: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return { meta, body: match[2].replace(/\r\n/g, '\n').trim() }
}

const countWords = (text: string) => (text.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) ?? []).length

function sections(body: string): { text: string; parts: Map<string, string[]> } {
  const [text, ...rest] = body.split(/^## /m)
  const parts = new Map<string, string[]>()
  for (const part of rest) {
    const [heading, ...lines] = part.split('\n')
    parts.set(heading.trim(), lines.map((l) => l.trim()).filter(Boolean))
  }
  return { text: text.trim(), parts }
}

function glossary(lines: string[], warn: (msg: string) => void): GlossEntry[] {
  const out: GlossEntry[] = []
  for (const line of lines) {
    const m = line.match(/^- (.+)$/)
    const [left, ...right] = m ? m[1].split(DASH) : []
    if (!left || right.length === 0) {
      warn(`glossary line skipped: ${line}`)
      continue
    }
    const forms = left.match(/\[([^\]]+)\]/)?.[1].split(',').map((s) => s.trim()).filter(Boolean) ?? []
    out.push({ term: left.replace(/\[[^\]]*\]/, '').replace(/\s+/g, ' ').trim(), forms, uk: right.join(' — ').trim() })
  }
  return out
}

function grammarNotes(lines: string[], warn: (msg: string) => void): GrammarNote[] {
  const out: GrammarNote[] = []
  for (const line of lines) {
    const parts = line.replace(/^- /, '').split(DASH)
    if (!line.startsWith('- ') || parts.length < 3) {
      warn(`grammar line skipped: ${line}`)
      continue
    }
    out.push({ slug: parts[0].trim(), example: parts[1].trim(), note: parts.slice(2).join(' — ').trim() })
  }
  return out
}

function questions(lines: string[], warn: (msg: string) => void): ReadingQuestion[] {
  const out: ReadingQuestion[] = []
  let cur: { q: string; options: string[]; answers: number[]; why: string } | null = null
  const flush = () => {
    if (!cur) return
    if (cur.answers.length !== 1 || cur.options.length < 2 || !cur.why) warn(`question skipped (needs one «+», 2+ options and «=»): ${cur.q}`)
    else out.push({ q: cur.q, options: cur.options, answer: cur.answers[0], why: cur.why })
    cur = null
  }
  for (const line of lines) {
    const mark = line[0]
    const value = line.slice(1).trim()
    if (mark === '?') {
      flush()
      cur = { q: value, options: [], answers: [], why: '' }
    } else if (!cur) {
      warn(`line outside a question: ${line}`)
    } else if (mark === '-' || mark === '+') {
      if (mark === '+') cur.answers.push(cur.options.length)
      cur.options.push(value)
    } else if (mark === '=') {
      cur.why = cur.why ? `${cur.why} ${value}` : value
    } else {
      warn(`unknown question line: ${line}`)
    }
  }
  flush()
  return out
}

/** Parses every text; problems are reported through `warn` and the faulty part is left out, not the whole text. */
export function parseTexts(files: [slug: string, raw: string][], warn: (msg: string) => void): { metas: TextMeta[]; contents: Map<string, TextContent> } {
  const metas: TextMeta[] = []
  const contents = new Map<string, TextContent>()
  for (const [slug, raw] of files) {
    const w = (msg: string) => warn(`reading/${slug}: ${msg}`)
    const { meta, body } = frontMatter(raw)
    const level = meta.level as ReadingLevel
    if (!meta.title || !READING_LEVELS.includes(level)) {
      w('skipped: needs a title and a level (A1–C2)')
      continue
    }
    const { text, parts } = sections(body)
    const content: TextContent = {
      paragraphs: text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean),
      glossary: glossary(parts.get('Слова') ?? [], w),
      grammar: grammarNotes(parts.get('Граматика') ?? [], w),
      questions: questions(parts.get('Запитання') ?? [], w),
    }
    const words = countWords(text)
    contents.set(slug, content)
    metas.push({
      slug,
      title: meta.title,
      level,
      topic: meta.topic ?? '',
      summary: meta.summary ?? '',
      words,
      minutes: Math.max(1, Math.round(words / 100)),
      grammar: content.grammar.map((g) => g.slug),
      questions: content.questions.length,
    })
  }
  // Easier first: by level, then shorter texts first within a level.
  metas.sort((a, b) => READING_LEVELS.indexOf(a.level) - READING_LEVELS.indexOf(b.level) || a.words - b.words || a.title.localeCompare(b.title))
  return { metas, contents }
}
