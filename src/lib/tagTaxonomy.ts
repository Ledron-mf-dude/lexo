/**
 * Built-in tags that group vocabulary by meaning ("Теми") and by kind of expression ("Мова").
 * Tags with other names are the user's own and are shown as "Мої теги".
 * A dictionary of topic codes for known words lives in src/content/wordTopics.json (loaded on demand).
 */

export type TagGroup = 'topic' | 'language' | 'own'

export const GROUP_LABELS: Record<TagGroup, string> = {
  topic: 'Теми',
  language: 'Мова',
  own: 'Мої теги',
}

export const GROUP_ORDER: TagGroup[] = ['topic', 'language', 'own']

interface BuiltInTag {
  name: string
  group: Exclude<TagGroup, 'own'>
  color: string
}

// The two-letter codes are what wordTopics.json stores for each word.
export const BUILT_IN: Record<string, BuiltInTag> = {
  EM: { name: 'почуття й емоції', group: 'topic', color: '#fb7185' },
  CH: { name: 'характер', group: 'topic', color: '#f9a8d4' },
  AP: { name: 'зовнішність', group: 'topic', color: '#c4b5fd' },
  RE: { name: 'люди й стосунки', group: 'topic', color: '#f9a8d4' },
  HE: { name: "здоров'я й тіло", group: 'topic', color: '#6ee7b7' },
  SP: { name: 'спорт', group: 'topic', color: '#6ee7b7' },
  FO: { name: 'їжа', group: 'topic', color: '#fbbf24' },
  HO: { name: 'дім і побут', group: 'topic', color: '#fbbf24' },
  CI: { name: 'місто й транспорт', group: 'topic', color: '#94a3b8' },
  TR: { name: 'подорожі', group: 'topic', color: '#5eead4' },
  NA: { name: 'природа й погода', group: 'topic', color: '#6ee7b7' },
  GE: { name: 'географія', group: 'topic', color: '#5eead4' },
  WO: { name: "робота й кар'єра", group: 'topic', color: '#7c9bff' },
  MO: { name: 'гроші й покупки', group: 'topic', color: '#fbbf24' },
  ED: { name: 'навчання', group: 'topic', color: '#7c9bff' },
  IT: { name: 'технології', group: 'topic', color: '#7c9bff' },
  ME: { name: 'кіно, ігри, історії', group: 'topic', color: '#c4b5fd' },
  AR: { name: 'мистецтво й культура', group: 'topic', color: '#c4b5fd' },
  SO: { name: 'суспільство', group: 'topic', color: '#94a3b8' },
  TH: { name: 'думки й міркування', group: 'topic', color: '#7c9bff' },
  CO: { name: 'спілкування', group: 'topic', color: '#5eead4' },
  TI: { name: 'час', group: 'topic', color: '#94a3b8' },
  QU: { name: 'кількість і міри', group: 'topic', color: '#94a3b8' },
  LE: { name: 'дозвілля й хобі', group: 'topic', color: '#5eead4' },
  DE: { name: 'опис і оцінка', group: 'topic', color: '#f9a8d4' },
  BV: { name: 'базові дієслова', group: 'topic', color: '#94a3b8' },
  PV: { name: 'фразові дієслова', group: 'language', color: '#fbbf24' },
  GR: { name: 'герундій (-ing)', group: 'language', color: '#fb7185' },
  EX: { name: 'сталі вирази', group: 'language', color: '#c4b5fd' },
  PH: { name: 'розмовні фрази', group: 'language', color: '#5eead4' },
  LI: { name: "слова-зв'язки", group: 'language', color: '#94a3b8' },
  MD: { name: 'модальні дієслова', group: 'language', color: '#7c9bff' },
  PR: { name: 'з прийменником', group: 'language', color: '#6ee7b7' },
  SE: { name: 'речення', group: 'language', color: '#94a3b8' },
  CM: { name: 'порівняння', group: 'language', color: '#f9a8d4' },
}

const BY_NAME = new Map(Object.values(BUILT_IN).map((t) => [t.name, t]))
// Display order inside a group: the order of BUILT_IN.
const ORDER = new Map(Object.values(BUILT_IN).map((t, i) => [t.name, i]))

export const isBuiltInTag = (name: string) => BY_NAME.has(name)
export const groupOf = (name: string): TagGroup => BY_NAME.get(name)?.group ?? 'own'
export const builtInColor = (name: string) => BY_NAME.get(name)?.color

/** Tags grouped for display: built-in ones in their fixed order, the user's own alphabetically. */
export function groupTags<T extends { name: string }>(tags: T[]): { group: TagGroup; tags: T[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    tags: tags
      .filter((t) => groupOf(t.name) === group)
      .sort((a, b) => (group === 'own' ? a.name.localeCompare(b.name, 'uk') : ORDER.get(a.name)! - ORDER.get(b.name)!)),
  })).filter((g) => g.tags.length > 0)
}

export type TopicDictionary = Record<string, string>

let dictionary: Promise<TopicDictionary> | null = null

/** The dictionary of known words (≈1100 entries) is a separate chunk: it loads only when tags are suggested. */
export function loadTopicDictionary(): Promise<TopicDictionary> {
  dictionary ??= import('../content/wordTopics.json').then((m) => m.default as TopicDictionary)
  return dictionary
}

const PARTICLES = new Set(['up', 'down', 'out', 'off', 'on', 'in', 'into', 'back', 'over', 'away', 'through', 'around', 'by', 'along', 'about', 'across', 'forward'])
const NOT_VERBS = new Set(['the', 'a', 'an', 'this', 'that', 'my', 'your', 'his', 'her', 'our', 'their', 'its', 'no', 'one'])

/** Tag names for a term: from the dictionary when the word is known, otherwise from its shape (sentence, phrasal verb, -ing). */
export function suggestTags(term: string, dict: TopicDictionary | null): string[] {
  const key = term.trim().toLowerCase()
  const known = dict?.[key]
  if (known) return known.split(' ').map((code) => BUILT_IN[code].name)

  const words = key.replace(/[.,!?…]+$/, '').split(/\s+/).filter(Boolean)
  const codes: string[] = []
  if (/[.!?]$/.test(key) && words.length >= 3) codes.push(key.endsWith('?') && words.length <= 6 ? 'PH' : 'SE')
  else if (words.length >= 2 && words.length <= 3 && PARTICLES.has(words[words.length - 1]) && !NOT_VERBS.has(words[0])) codes.push('PV')
  if (/\(\+ ?ing\)/.test(key)) codes.push('GR')
  if (/^(be|get|have|make|take|do) \w+/.test(key) && codes.length === 0 && words.length >= 2) codes.push('EX')
  return codes.map((code) => BUILT_IN[code].name)
}
