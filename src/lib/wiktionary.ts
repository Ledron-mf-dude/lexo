import { getAccent } from './accent'

/**
 * Online dictionary data for words the built-in dictionary does not know, from English Wiktionary
 * (free, no key, CORS-enabled; text under CC BY-SA, recordings from Wikimedia Commons).
 * Gives the transcription, a pronunciation recording, parts of speech and, when asked, a definition and an example.
 */

const WIKI = 'https://en.wiktionary.org'

export interface OnlineEntry {
  ipa: string | null
  /** Wikimedia Commons recording (usually Ogg Vorbis; Safari falls back to the browser voice). */
  audio: string | null
  /** English part-of-speech names, comma-separated: "noun, verb". */
  pos: string | null
  definition: string | null
  example: string | null
  /** The Wiktionary page, for attribution. */
  page: string
}

const POS_HEADINGS =
  'Noun|Verb|Adjective|Adverb|Phrase|Idiom|Proverb|Prepositional phrase|Preposition|Conjunction|Interjection|Pronoun|Determiner|Numeral|Particle|Contraction'

const POS_LABELS: Record<string, string> = {
  noun: 'ім.',
  verb: 'дієсл.',
  adjective: 'прикм.',
  adverb: 'присл.',
  phrase: 'фраза',
  idiom: 'ідіома',
  proverb: 'прислів’я',
  'prepositional phrase': 'фраза',
  preposition: 'прийм.',
  conjunction: 'спол.',
  interjection: 'виг.',
  pronoun: 'займ.',
  determiner: 'означ.',
  numeral: 'числ.',
  particle: 'част.',
  contraction: 'скор.',
}

/** "noun, verb" -> "ім., дієсл." */
export const posLabel = (pos: string) =>
  pos
    .split(',')
    .map((p) => POS_LABELS[p.trim()] ?? p.trim())
    .join(', ')

/** "get sth done (informal)" -> "get something done": the form Wiktionary uses for page titles. */
function pageTitle(term: string): string {
  return term
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bsth\b/gi, 'something')
    .replace(/\bsb\b/gi, 'someone')
    .replace(/\s+/g, ' ')
    .trim()
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Does the text contain the word (or an inflected form of its first word)? Definitions must not; examples must. */
function mentions(text: string, term: string): boolean {
  const first = term.toLowerCase().split(' ')[0]
  // A prefix catches other forms: "achievement" -> "achiev" (achieve, achieving), "happy" -> "happ" (happily).
  const stem = first.length <= 4 ? first : first.slice(0, Math.max(4, Math.floor(first.length * 0.55)))
  return new RegExp(`\\b${escapeRe(stem)}`, 'i').test(text)
}

const htmlText = (html: string) =>
  (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([;,.])/g, '$1')
    .trim()

async function fetchWikitext(title: string): Promise<string | null> {
  const url = `${WIKI}/w/api.php?action=parse&format=json&formatversion=2&origin=*&prop=wikitext&redirects=1&page=${encodeURIComponent(title)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Wiktionary: ${res.status}`)
  const json = (await res.json()) as { parse?: { wikitext?: string }; error?: { code: string } }
  if (json.error) return null // missingtitle and the like
  return json.parse?.wikitext ?? null
}

function englishSection(wikitext: string): string | null {
  const m = wikitext.match(/(?:^|\n)==\s*English\s*==[ \t]*\n([\s\S]*?)(?=\n==[^=]|$)/)
  return m ? m[1] : null
}

// The chosen variety first (British by default, as taught in Ukrainian schools), then the other, then whatever there is.
const UK = /\b(RP|UK|SSB|Received|Southern England|British)\b|en-(uk|gb)-/i
const US = /\b(GA|US|General American|American)\b|en-us-/i

function pick<T>(items: T[], describe: (x: T) => string): T | undefined {
  const [first, second] = getAccent() === 'US' ? [US, UK] : [UK, US]
  return items.find((x) => first.test(describe(x))) ?? items.find((x) => second.test(describe(x))) ?? items[0]
}

function parsePronunciation(section: string) {
  const ipas = [...section.matchAll(/\{\{IPA\|en\|([^}]+)\}\}/g)].flatMap((m) => {
    const parts = m[1].split('|')
    const accent = parts.find((p) => p.startsWith('a=')) ?? ''
    const ipa = parts.find((p) => /^[/[]/.test(p))
    return ipa ? [{ ipa, accent }] : []
  })
  const audios = [...section.matchAll(/\{\{audio\|en\|([^|}]+)([^}]*)\}\}/g)].map((m) => ({ file: m[1].trim(), rest: m[2] }))
  const ipa = pick(ipas, (x) => x.accent)?.ipa ?? null
  const file = pick(audios, (x) => `${x.file} ${x.rest}`)?.file
  const audio = file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}` : null
  const pos = [...new Set([...section.matchAll(new RegExp(`\\n={3,5}\\s*(${POS_HEADINGS})\\s*={3,5}`, 'g'))].map((m) => m[1].toLowerCase()))]
  return { ipa, audio, pos: pos.length > 0 ? pos.slice(0, 3).join(', ') : null }
}

interface RestDefinition {
  definition: string
  examples?: string[]
  parsedExamples?: { example: string }[]
}

// Senses marked like this are not what a learner needs as «the meaning».
const ODD_SENSE = /\b(obsolete|archaic|dated|rare|heraldry|dialect|nautical|vulgar|slang|historical)\b/i

async function fetchDetails(title: string, term: string): Promise<{ definition: string | null; example: string | null }> {
  const res = await fetch(`${WIKI}/api/rest_v1/page/definition/${encodeURIComponent(title.replace(/ /g, '_'))}`)
  if (!res.ok) return { definition: null, example: null }
  const json = (await res.json()) as { en?: { definitions: RestDefinition[] }[] }
  const senses = (json.en ?? []).flatMap((e) => e.definitions)
  let definition: string | null = null
  let example: string | null = null
  for (const s of senses) {
    const text = htmlText(s.definition)
    if (!definition && text.length >= 8 && text.length <= 160 && !ODD_SENSE.test(text) && !mentions(text, term)) definition = text
    if (!example) {
      const candidates = [...(s.parsedExamples ?? []).map((e) => e.example), ...(s.examples ?? [])].map(htmlText)
      example = candidates.find((ex) => ex.length <= 160 && mentions(ex, term)) ?? null
    }
    if (definition && example) break
  }
  return { definition, example }
}

// Words Wiktionary does not have: remembered per browser, so a bulk lookup does not ask for them again.
const MISSING_KEY = 'lexo.wiktionary.missing'

function readMissing(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(MISSING_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

const missing = readMissing()

function markMissing(term: string) {
  missing.add(term.toLowerCase())
  try {
    localStorage.setItem(MISSING_KEY, JSON.stringify([...missing].slice(-5000)))
  } catch {
    // storage full or blocked: the word is just looked up again next time
  }
}

export const isKnownMissing = (term: string) => missing.has(term.trim().toLowerCase())

const cache = new Map<string, Promise<OnlineEntry | null>>()

async function lookup(term: string, withDetails: boolean): Promise<OnlineEntry | null> {
  const title = pageTitle(term)
  if (!title) return null
  // Page titles are case-sensitive: "Monday" is a page, "monday" redirects or is missing; try as typed, then lowercase.
  for (const t of [...new Set([title, title.toLowerCase()])]) {
    const wikitext = await fetchWikitext(t)
    const section = wikitext && englishSection(wikitext)
    if (!section) continue
    const pron = parsePronunciation(section)
    const details = withDetails ? await fetchDetails(t, title) : { definition: null, example: null }
    return { ...pron, ...details, page: `${WIKI}/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}` }
  }
  markMissing(term)
  return null
}

/**
 * The Wiktionary entry for a word, or null when there is none. Network errors reject (and are not remembered as missing).
 * `withDetails` also fetches a definition and an example (one more request).
 */
export function lookupOnline(term: string, withDetails = true): Promise<OnlineEntry | null> {
  const key = `${withDetails ? 'd' : 'p'}:${getAccent()}:${term.trim().toLowerCase()}`
  let hit = cache.get(key)
  if (!hit) {
    hit = lookup(term.trim(), withDetails)
    hit.catch(() => cache.delete(key))
    cache.set(key, hit)
  }
  return hit
}
