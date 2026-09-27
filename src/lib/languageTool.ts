import { getAccent } from './accent'

/**
 * Writing check through the public LanguageTool API (free, no key, CORS-enabled; about 20 requests a minute and
 * 20 KB of text per request). It finds grammar, spelling and word-choice mistakes; it is weaker at tenses in context.
 */

export interface Issue {
  offset: number
  length: number
  /** The text that was flagged. */
  original: string
  message: string
  /** Short label from LanguageTool: «Agreement error», «Commonly confused word»… */
  label: string
  replacements: string[]
  ruleId: string
  /** grammar, misspelling, typographical, style, whitespace… */
  issueType: string
  category: string
  /** The sentence the mistake is in, as written. */
  sentence: string
  sentenceStart: number
  /** Our article about this kind of mistake, when the rule maps to one. */
  slug: string | null
}

interface Match {
  message: string
  shortMessage: string
  offset: number
  length: number
  replacements: { value: string }[]
  sentence: string
  rule: { id: string; issueType: string; category: { id: string } }
}

// LanguageTool rule ids -> articles. First match wins, so the specific patterns come first.
const RULE_TOPICS: [RegExp, string][] = [
  [/SINCE_FOR|FOR_SINCE|DURING_WHILE/, 'during-for-while-since'],
  [/INTEREST|BORED|_ED_ING|_ING_ED|EXCIT/, 'ed-ing-adjectives'],
  [/UNCOUNTABLE|INFORMATIONS|ADVICES|NON_COUNT|MUCH_COUNT|MANY_UNCOUNT|FURNITURES|LUGGAGES|EQUIPMENTS/, 'countable-uncountable'],
  [/DOUBLE_NEG/, 'double-negatives'],
  [/THERE_IS|THERE_ARE|THERE_RE_MANY|THERE_S_MANY/, 'there-is-are'],
  [/SO_SUCH|SUCH_A/, 'so-such'],
  [/TOO_|ENOUGH/, 'too-enough'],
  [/IF_WOULD|CONDITIONAL|IF_VB/, 'conditionals'],
  [/COMPARATIVE|SUPERLATIVE|MORE_ADJ|THAN_/, 'comparatives-superlatives'],
  [/PRESENT_PERFECT|HAVE_PART|HAVE_VBD|PERF_TENS|SINCE_PAST/, 'present-perfect'],
  [/DID_BASEFORM|DID_PAST|PAST_TENSE|PRP_PAST|YESTERDAY/, 'past-tenses'],
  [/IRREGULAR|BEEN_PART|_VBN|VBD_VBN/, 'irregular-verbs'],
  [/GERUND|TO_INFINITIVE|INFINITIVE|_TO_VB|VBG|_ING_TO|TO_ING/, 'gerund-or-infinitive'],
  [/MD_BASEFORM|MODAL|CAN_|MUST_|SHOULD_/, 'modals-obligation'],
  [/WILL_|FUTURE/, 'future-simple-shall-will'],
  [/HE_VERB_AGR|NON3PRS|SUBJECT_VERB|AGREEMENT|SINGULAR_VERB|PLURAL_VERB|DOES_X_HAS|PRP_VBZ|PRP_VBP/, 'subject-verb-agreement'],
  [/EN_A_VS_AN|A_PLURAL|ARTICLE|MISSING_THE|THE_SUPERLATIVE|A_INFINITIVE|DT_/, 'articles'],
  [/WORD_ORDER|ADVERB_ORDER|ADV_ORDER/, 'word-order'],
  [/QUESTION|DO_QUESTION|WH_/, 'questions'],
  [/PLURAL|NNS/, 'plural-nouns'],
  [/ME_I|I_ME|OBJECT_PRONOUN|PRP_|PRONOUN/, 'pronouns'],
  [/MAKE_|DO_MAKE|MAKE_DO/, 'do-make'],
  [/MENTION_ABOUT|DISCUSS|EXPLAIN_TO|ARRIVE_TO|LISTEN_|DEPEND|MARRIED_WITH|VERB_PREP/, 'verb-preposition'],
]

function topicFor(ruleId: string, category: string): string | null {
  const hit = RULE_TOPICS.find(([re]) => re.test(ruleId))
  if (hit) return hit[1]
  if (category === 'COLLOCATIONS') return 'verb-preposition'
  return null
}

export async function checkText(text: string): Promise<Issue[]> {
  const res = await fetch('https://api.languagetool.org/v2/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ text, language: getAccent() === 'US' ? 'en-US' : 'en-GB', motherTongue: 'uk', level: 'picky' }),
  })
  if (res.status === 429) throw new Error('Забагато перевірок за хвилину. Зачекайте трохи й спробуйте ще раз.')
  if (!res.ok) throw new Error(`Сервіс перевірки недоступний (${res.status}). Спробуйте пізніше.`)
  const json = (await res.json()) as { matches: Match[] }
  return json.matches.map((m) => {
    // The sentence around the mistake: the closest occurrence that starts before it.
    const sentenceStart = text.lastIndexOf(m.sentence, m.offset)
    return {
      offset: m.offset,
      length: m.length,
      original: text.slice(m.offset, m.offset + m.length),
      message: m.message,
      label: m.shortMessage,
      replacements: m.replacements.slice(0, 4).map((r) => r.value),
      ruleId: m.rule.id,
      issueType: m.rule.issueType,
      category: m.rule.category.id,
      sentence: m.sentence,
      sentenceStart: sentenceStart >= 0 ? sentenceStart : -1,
      slug: topicFor(m.rule.id, m.rule.category.id),
    }
  })
}

/** Grammar and word-choice mistakes are worth a card; spaces, quotes, style and plain typos are not. */
export const isLearnable = (i: Issue) =>
  i.replacements.length > 0 && (i.issueType === 'grammar' || (i.issueType === 'misspelling' && i.category !== 'TYPOS'))

export interface SentenceCard {
  wrong: string
  /** The sentence with the first suggestion for every learnable mistake in it applied. */
  right: string
  why: string
  slug: string | null
}

/** One personal card per sentence, however many mistakes it has: «She have a lot of informations» -> «She has a lot of information». */
export function sentenceCards(issues: Issue[]): SentenceCard[] {
  const bySentence = new Map<number, Issue[]>()
  for (const i of issues) if (isLearnable(i) && i.sentenceStart >= 0) bySentence.set(i.sentenceStart, [...(bySentence.get(i.sentenceStart) ?? []), i])
  return [...bySentence.values()].flatMap((group) => {
    const { sentence, sentenceStart } = group[0]
    let right = sentence
    for (const i of [...group].sort((a, b) => b.offset - a.offset)) {
      const at = i.offset - sentenceStart
      right = right.slice(0, at) + i.replacements[0] + right.slice(at + i.length)
    }
    right = right.trim()
    if (right === sentence.trim()) return []
    return [{ wrong: sentence.trim(), right, why: group.map((i) => i.message).join(' '), slug: group.find((i) => i.slug)?.slug ?? null }]
  })
}
