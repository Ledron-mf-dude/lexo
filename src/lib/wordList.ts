/**
 * Turning the text read from a picture of a word list into words: "1. apple — яблуко", a table with columns,
 * transcriptions and example sentences. Pure functions with no browser APIs, so they can be run in Node.
 */

/** One cell of a line: a column of a table, or the whole line when it has no columns. */
export interface Cell {
  text: string
  /** Recognition confidence 0–100 (100 for text that was not recognised from a picture). */
  conf: number
}

export type OcrLine = Cell[]

export interface Candidate {
  term: string
  /** Read from the picture next to the word; empty when the picture has only English. */
  translation: string
  /** A sentence from an «example» column, when the picture has one. */
  example: string
  /** The recognition was unsure about this word: the user should check it. */
  uncertain: boolean
}

/** Below this the word is marked «перевірте». */
export const LOW_CONFIDENCE = 65

const MAX_TERM_WORDS = 7
const CYRILLIC = /[Ѐ-ӿ]/g
const LATIN = /[A-Za-z]/g

const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0

// With English and Ukrainian models together, letters that look the same are often read in the wrong script.
const TO_LATIN: Record<string, string> = { а: 'a', с: 'c', е: 'e', і: 'i', о: 'o', р: 'p', х: 'x', у: 'y', А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', І: 'I', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X' }
const TO_CYRILLIC = Object.fromEntries(Object.entries(TO_LATIN).map(([cyr, lat]) => [lat, cyr]))

function fixScript(word: string, kind: 'lat' | 'cyr'): string {
  const map = kind === 'lat' ? TO_LATIN : TO_CYRILLIC
  return word.replace(kind === 'lat' ? /[Ѐ-ӿ]/g : /[A-Za-z]/g, (ch) => map[ch] ?? ch)
}

type Kind = 'lat' | 'cyr' | 'other'

function kindOf(word: string): Kind {
  const cyr = count(word, CYRILLIC)
  const lat = count(word, LATIN)
  if (cyr === 0 && lat === 0) return 'other'
  return cyr > lat ? 'cyr' : 'lat'
}

// International phonetic alphabet letters: a bracketed or slashed group that has one is a transcription.
const IPA = /[ˈˌːəɪɛæʃʒŋθðʊɔɑʌɒɜɡ]/
const POS = /\(\s*(?:v|n|adj|adv|prep|conj|pron|phr\.? ?v|noun|verb|adjective|adverb|preposition|conjunction|pronoun)\.?\s*\)/gi

/** Removes what is not part of the word: transcription, part-of-speech marks, a leading number or bullet. */
function strip(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\/[^/]{1,40}\//g, (m) => (IPA.test(m) ? ' ' : m))
    .replace(POS, ' ')
    .replace(/^\s*(?:\(?\d{1,3}[.):]|\d{1,3}\s+(?=\S)|[•·*▪●○■□►▶→]|[-–—]\s)\s*/, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// A spaced dash, an equals sign, a bar or a colon followed by a space separates the word from its translation.
const SEPARATOR = /\s+[-–—−]+\s+|\s*[–—−]\s*|\s*[|=]\s*|:\s+/

interface Run {
  kind: 'lat' | 'cyr'
  text: string
  conf: number
}

/** The runs of one script in a piece of text: "apple яблуко" -> [apple][яблуко]. Digits and punctuation stay with the run before. */
function runsOf(piece: string, conf: number): Run[] {
  const runs: Run[] = []
  const words = piece.split(' ').filter(Boolean)
  words.forEach((word, i) => {
    let kind = kindOf(word)
    const last = runs.at(-1)
    // A lone letter inside Ukrainian text is a Ukrainian letter read as a Latin one ("брати участь y"), and a lone "3"
    // before a Ukrainian word is «з».
    if (kind === 'lat' && last?.kind === 'cyr' && word.length === 1 && TO_CYRILLIC[word]) kind = 'cyr'
    // The same the other way round: "It is а big challenge" has a Cyrillic «а» between English words.
    if (kind === 'cyr' && last?.kind === 'lat' && word.length === 1 && TO_LATIN[word] && words[i + 1] && kindOf(words[i + 1]) === 'lat') kind = 'lat'
    if (kind === 'other' && word === '3' && !last && words[i + 1] && kindOf(words[i + 1]) === 'cyr') {
      runs.push({ kind: 'cyr', text: 'з', conf })
      return
    }
    if (kind === 'other') {
      if (last) last.text += ' ' + word
      return
    }
    const fixed = fixScript(word, kind)
    if (last && last.kind === kind) last.text += ' ' + fixed
    else runs.push({ kind, text: fixed, conf })
  })
  return runs
}

function tidyEdges(s: string): string {
  const t = s.replace(/^[\s"'“”«».,;:!?\-–—]+/, '').replace(/[\s"'“”«».,;:!?\-–—]+$/, '').trim()
  // A bracket cut off by the edge of the cell ("(formal") is noise; a balanced pair is a note and stays.
  return count(t, /\(/g) === count(t, /\)/g) ? t : t.replace(/[()]/g, '').trim()
}

/** Lower case, except for abbreviations (UK, TV). */
const normalizeTerm = (s: string) => (/^[A-Z]{2,}$/.test(s) ? s : s.toLowerCase())

/**
 * An English run that is a whole sentence. After a word it is the «example» column; at the start of a line a short
 * sentence ("How are you?") is a phrase to learn, and only a long one is dropped.
 */
function isSentence(text: string, afterWord: boolean): boolean {
  const words = text.split(' ').length
  if (!afterWord) return words >= 7
  return words >= 5 || (words >= 3 && /[.!?]$/.test(text))
}

/**
 * A transcription column. A well-read one is removed by `strip`; a misread one ("[o'tfizv/") has lost its phonetic
 * letters, but it still starts or ends with a slash or a bracket, which a word never does.
 */
const isTranscription = (text: string) => /^[/[]/.test(text.trim()) || /[/\]]$/.test(text.trim())

function parseLine(line: OcrLine): Candidate[] {
  // A cell that holds only a number, a bullet or a dash is layout, not content.
  const cells = line.filter((c) => /[\p{L}]/u.test(c.text) && !isTranscription(c.text))
  const runs: Run[] = []
  for (const cell of cells) {
    const text = strip(cell.text)
    for (const piece of text.split(SEPARATOR)) {
      const p = piece.trim()
      if (p) runs.push(...runsOf(p, cell.conf))
    }
  }

  const out: Candidate[] = []
  let waiting = '' // Ukrainian text that came before the English word it belongs to ("яблуко — apple")
  for (const run of runs) {
    if (run.kind === 'cyr') {
      const text = tidyEdges(run.text)
      const last = out.at(-1)
      if (last && !last.translation) last.translation = text
      else if (!last) waiting = waiting ? `${waiting} ${text}` : text
      continue
    }
    if (isSentence(run.text, out.length > 0)) {
      const last = out.at(-1)
      if (last && !last.example) last.example = run.text.replace(/^[\s"'“”«»]+|[\s"'“”«»]+$/g, '').replace(/\s+([.,;!?])/g, '$1')
      continue
    }
    const text = tidyEdges(run.text)
    // Stray marks from the recognition ("apple|", "ap~ple") are dropped and the word is flagged.
    const marks = text.replace(/[|~^_{}<>\\@#$%*=¢©®™]/g, '')
    // A digit between letters is a letter misread: "c0w" is "cow".
    const term = marks.replace(/(?<=[A-Za-z])[015](?=[A-Za-z])/g, (d) => ({ '0': 'o', '1': 'l', '5': 's' })[d]!)
    // An apostrophe that is not a contraction (e'baendan) is usually a transcription whose brackets were lost.
    const odd = /'/.test(term) && !/(n't|'s|'re|'ve|'ll|'d|'m)\b/i.test(term)
    out.push({ term: normalizeTerm(term), translation: waiting, example: '', uncertain: run.conf < LOW_CONFIDENCE || term !== text || odd })
    waiting = ''
  }
  return out.filter(valid)
}

function valid(c: Candidate): boolean {
  const letters = count(c.term, LATIN)
  return letters >= 2 && c.term.split(' ').length <= MAX_TERM_WORDS && !/\d/.test(c.term)
}

/** Words and translations from the lines of a picture, without repeats (the first translation wins). */
export function parseWordLines(lines: OcrLine[]): Candidate[] {
  const byTerm = new Map<string, Candidate>()
  for (const line of lines) {
    for (const c of parseLine(line)) {
      const old = byTerm.get(c.term)
      if (!old) byTerm.set(c.term, c)
      else {
        old.translation ||= c.translation
        old.example ||= c.example
        old.uncertain &&= c.uncertain
      }
    }
  }
  return [...byTerm.values()]
}

/** The same for plain text: one line per row, tabs between columns. */
export function parseWordText(text: string): Candidate[] {
  return parseWordLines(text.split(/\r?\n/).map((line) => line.split('\t').map((t) => ({ text: t, conf: 100 }))))
}
