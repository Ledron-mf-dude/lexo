/** Splitting a pasted English text into words, finding the ones already in the dictionary, guessing base forms. */

export interface Token {
  text: string
  /** False for spaces and punctuation between words. */
  word: boolean
  start: number
}

const WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*/g

export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let last = 0
  for (const m of text.matchAll(WORD)) {
    if (m.index > last) tokens.push({ text: text.slice(last, m.index), word: false, start: last })
    tokens.push({ text: m[0], word: true, start: m.index })
    last = m.index + m[0].length
  }
  if (last < text.length) tokens.push({ text: text.slice(last), word: false, start: last })
  return tokens
}

// Function words: shown dimmed, since nobody learns "the" from a text.
export const STOPWORDS = new Set(
  (
    "a an the and or but if so as of to in on at by for from with about into over under up down out off than then " +
    "is am are was were be been being do does did done have has had having will would shall should can could may might must " +
    "i you he she it we they me him her us them my your his its our their mine yours this that these those there here " +
    "what which who whom whose when where why how not no yes all any some each every both either neither one two " +
    "very too also just only even more most much many such own same other another s t don't i'm it's that's"
  ).split(' '),
)

/** Possible dictionary forms of an inflected word, most likely first: "studies" -> studies, study; "stopped" -> stop. */
export function baseForms(word: string): string[] {
  const w = word.toLowerCase().replace(/’/g, "'")
  const out = [w]
  const add = (s: string) => s.length >= 2 && out.push(s)
  if (w.endsWith("'s")) add(w.slice(0, -2))
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y')
  if (w.endsWith('es')) add(w.slice(0, -2))
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1))
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y')
  if (w.endsWith('ed')) {
    add(w.slice(0, -2))
    add(w.slice(0, -1))
    if (/(.)\1ed$/.test(w)) add(w.slice(0, -3))
  }
  if (w.endsWith('ing')) {
    add(w.slice(0, -3))
    add(w.slice(0, -3) + 'e')
    if (/(.)\1ing$/.test(w)) add(w.slice(0, -4))
  }
  for (const [suffix, repl] of [['ier', 'y'], ['iest', 'y'], ['er', ''], ['est', ''], ['ly', ''], ['ily', 'y']] as const)
    if (w.endsWith(suffix) && w.length > suffix.length + 2) add(w.slice(0, -suffix.length) + repl)
  return [...new Set(out)]
}

/** The base form found in any of the known vocabularies, or the word itself (lowercased). */
export function lemma(word: string, known: (term: string) => boolean): string {
  const forms = baseForms(word)
  return forms.find(known) ?? forms[0]
}

/** A dictionary term without notes and placeholders: "take sth into account (formal)" -> ["take", "*", "into", "account"]. */
function termWords(term: string): string[] {
  return term
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/[\s/]+/)
    .filter(Boolean)
    .map((w) => (/^(sth|sb|something|someone|somebody|one's|smb)$/.test(w) ? '*' : w))
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Multi-word dictionary terms found in the text, as character ranges: "gave up" is not found (irregular),
 * "looking forward to" and "took the risk into account" are.
 */
export function findPhrases(text: string, terms: string[]): { start: number; end: number; term: string }[] {
  const found: { start: number; end: number; term: string }[] = []
  for (const term of terms) {
    const words = termWords(term)
    // A placeholder at either end ("tell sb") matches nothing useful: only the fixed words count there.
    while (words[0] === '*') words.shift()
    while (words.at(-1) === '*') words.pop()
    if (words.filter((w) => w !== '*').length < 2) continue
    const parts = words.map((w, i) => {
      if (w === '*') return "(?:[\\w'’-]+\\s+){1,3}?"
      // The first word may be inflected: a prefix plus any ending.
      const body = i === 0 && w.length > 3 ? `${escapeRe(w.replace(/e$/, ''))}\\w*` : escapeRe(w)
      return i < words.length - 1 ? `${body}\\s+` : body
    })
    const re = new RegExp(`\\b${parts.join('')}\\b`, 'gi')
    for (const m of text.matchAll(re)) found.push({ start: m.index, end: m.index + m[0].length, term })
  }
  return found
}

/** The sentence around a position: the example a word gets from the text it was found in. */
export function sentenceAt(text: string, pos: number): string {
  const before = text.slice(0, pos)
  const start = Math.max(before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '), before.lastIndexOf('\n')) + 1
  const rest = text.slice(pos)
  const m = rest.match(/[.!?](?=\s|$)|\n/)
  const end = m ? pos + m.index! + (m[0] === '\n' ? 0 : 1) : text.length
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}
