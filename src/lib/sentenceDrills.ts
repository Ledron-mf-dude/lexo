import type { Item, Question } from './exercises'
import { IRREGULAR, IRREGULAR_BY_FORM, type IrregularVerb } from './irregularVerbs'

/**
 * Grammar drills made from the example sentences of the user's own words.
 *
 *  - «Поставте дієслово у форму» (fill): the verb group is blanked, the hint names the verb and the tense, so there is
 *    one right answer; the explanation says how that tense is formed for this very verb (spelling, irregular forms)
 *    and points at the time words in the sentence.
 *  - «Складіть речення» (order): a short example sentence to put back together.
 *
 * Items carry the slug of the grammar article that explains the form, so «Правило» opens it. Their ids start with
 * `mw-` and are in no bank, so the answers do not change topic progress, only the «нове» marks and the draw order.
 */

export const MY_WORDS = 'my-words'

export interface DrillWord {
  term: string
  translation: string
  example: string | null
  pos?: string | null
}

type Tense =
  | 'present-simple'
  | 'present-simple-neg'
  | 'present-continuous'
  | 'past-simple'
  | 'past-simple-neg'
  | 'past-continuous'
  | 'present-perfect'
  | 'present-perfect-continuous'
  | 'past-perfect'
  | 'future-simple'
  | 'going-to'
  | 'passive-present'
  | 'passive-past'
  | 'passive-perfect'
  | 'passive-future'

const TENSES: Record<Tense, { name: string; slug: string; rule: string }> = {
  'present-simple': { name: 'Present Simple', slug: 'present-simple-vs-continuous', rule: 'Present Simple — звичка, факт, розклад. Після he / she / it дієслово отримує -s.' },
  'present-simple-neg': { name: 'Present Simple, заперечення', slug: 'present-simple-vs-continuous', rule: 'Заперечення в Present Simple: *don\'t / doesn\'t* + початкова форма. Закінчення -s переходить у *does*, тому після *doesn\'t* дієслово без -s.' },
  'present-continuous': { name: 'Present Continuous', slug: 'present-simple-vs-continuous', rule: 'Present Continuous — дія триває зараз або це тимчасова ситуація: *am / is / are* + -ing.' },
  'past-simple': { name: 'Past Simple', slug: 'past-tenses', rule: 'Past Simple — завершена дія в минулому: правильні дієслова + -ed, неправильні — друга форма (V2).' },
  'past-simple-neg': { name: 'Past Simple, заперечення', slug: 'past-tenses', rule: 'Заперечення в Past Simple: *didn\'t* + початкова форма. Минулий час уже «сидить» у *did*, тому не *didn\'t went*.' },
  'past-continuous': { name: 'Past Continuous', slug: 'past-tenses', rule: 'Past Continuous — дія тривала в певний момент минулого: *was / were* + -ing.' },
  'present-perfect': { name: 'Present Perfect', slug: 'present-perfect', rule: 'Present Perfect — результат чи досвід, важливий зараз: *have / has* + третя форма (V3).' },
  'present-perfect-continuous': { name: 'Present Perfect Continuous', slug: 'present-perfect', rule: 'Present Perfect Continuous — дія почалася в минулому й триває досі: *have / has been* + -ing.' },
  'past-perfect': { name: 'Past Perfect', slug: 'past-perfect', rule: 'Past Perfect — дія сталася раніше за інший момент у минулому: *had* + третя форма (V3).' },
  'future-simple': { name: 'Future Simple (will)', slug: 'future-simple-shall-will', rule: 'Future Simple: *will* + початкова форма, для всіх осіб однаково.' },
  'going-to': { name: 'be going to', slug: 'future-forms', rule: 'План чи намір: *am / is / are going to* + початкова форма.' },
  'passive-present': { name: 'Present Simple, пасив', slug: 'passive-voice', rule: 'Пасив у Present Simple: *am / is / are* + третя форма (V3). Важливо, що робиться, а не хто.' },
  'passive-past': { name: 'Past Simple, пасив', slug: 'passive-voice', rule: 'Пасив у Past Simple: *was / were* + третя форма (V3).' },
  'passive-perfect': { name: 'Present Perfect, пасив', slug: 'passive-voice', rule: 'Пасив у Present Perfect: *have / has been* + третя форма (V3).' },
  'passive-future': { name: 'Future Simple, пасив', slug: 'passive-voice', rule: 'Пасив у майбутньому: *will be* + третя форма (V3).' },
}

// ---- Forms of a verb ---------------------------------------------------------------------------------------------

const endsCvc = (w: string) => /[^aeiou][aeiou][^aeiouwxy]$/.test(w)

function sForm(b: string): string {
  if (/(s|x|z|ch|sh|o)$/.test(b)) return b + 'es'
  if (/[^aeiou]y$/.test(b)) return b.slice(0, -1) + 'ies'
  return b + 's'
}

/** Regular -ed spellings; a final consonant may or may not double (stop → stopped, visit → visited), so both are kept. */
function edForms(b: string): string[] {
  if (b.endsWith('e')) return [b + 'd']
  if (/[^aeiou]y$/.test(b)) return [b.slice(0, -1) + 'ied']
  return endsCvc(b) ? [b + 'ed', b + b.at(-1) + 'ed'] : [b + 'ed']
}

function ingForms(b: string): string[] {
  if (b.endsWith('ie')) return [b.slice(0, -2) + 'ying']
  if (/[^e]e$/.test(b) && b.length > 2) return [b.slice(0, -1) + 'ing']
  return endsCvc(b) ? [b + 'ing', b + b.at(-1) + 'ing'] : [b + 'ing']
}

type Form = 'base' | 's' | 'past' | 'participle' | 'ing'

interface VerbForms {
  base: string
  irregular?: IrregularVerb
  forms: Map<string, Form[]>
}

function verbForms(base: string): VerbForms {
  const irregular = IRREGULAR.get(base)
  const forms = new Map<string, Form[]>()
  const add = (f: string, kind: Form) => forms.set(f, [...(forms.get(f) ?? []), kind])
  add(base, 'base')
  add(sForm(base), 's')
  for (const f of ingForms(base)) add(f, 'ing')
  if (irregular) {
    irregular.past.forEach((f) => add(f, 'past'))
    irregular.participle.forEach((f) => add(f, 'participle'))
  } else {
    for (const f of edForms(base)) {
      add(f, 'past')
      add(f, 'participle')
    }
  }
  return { base, irregular, forms }
}

/** How the form is spelled for this verb: the part of the explanation that is about the word itself. */
function spellingNote(v: VerbForms, form: Form, used: string): string {
  const b = v.base
  if ((form === 'past' || form === 'participle') && v.irregular) {
    const i = v.irregular
    return `*${b}* — неправильне дієслово: *${b} → ${i.past.join(' / ')} → ${i.participle.join(' / ')}*.`
  }
  if (form === 'past' || form === 'participle') {
    if (b.endsWith('e')) return `*${b}* закінчується на -e, тож додаємо лише -d: *${used}*.`
    if (/[^aeiou]y$/.test(b)) return `Приголосна + y → -ied: *${b} → ${used}*.`
    if (used.endsWith(b.at(-1)! + b.at(-1)! + 'ed')) return `Наголошений склад «приголосна-голосна-приголосна» — кінцева приголосна подвоюється: *${b} → ${used}*.`
    return `Правильне дієслово: *${b} + -ed → ${used}*.`
  }
  if (form === 'ing') {
    if (b.endsWith('ie')) return `-ie → -ying: *${b} → ${used}*.`
    if (/[^e]e$/.test(b) && !used.includes(b)) return `Німе -e випадає перед -ing: *${b} → ${used}*.`
    if (used.endsWith(b.at(-1)! + b.at(-1)! + 'ing')) return `Кінцева приголосна подвоюється: *${b} → ${used}*.`
    return ''
  }
  if (form === 's' && used !== b + 's') return `Після he / she / it: *${b} → ${used}*.`
  return ''
}

// ---- Finding the verb group -------------------------------------------------------------------------------------

interface Tok {
  text: string
  lower: string
  start: number
}

const words = (s: string): Tok[] => [...s.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)].map((m) => ({ text: m[0], lower: m[0].toLowerCase().replace(/’/g, "'"), start: m.index }))

const PRONOUNS = new Set(['i', 'you', 'we', 'they', 'he', 'she', 'it'])
const THIRD = new Set(['he', 'she', 'it'])
// Words after which a bare form is a noun or an infinitive, not a finite verb.
const NOT_SUBJECT = new Set(
  'a an the this that these those my your his her its our their to of in on at by for with from about into some any no every each very so too not never'.split(' '),
)
const PARTICLES = new Set('up down out off on in over away back through along around about into across ahead apart forward together'.split(' '))
// Main verbs whose forms are also auxiliaries: a group made of them is left alone.
const AUX_VERBS = new Set(['be', 'have', 'do'])

const TIME_WORDS: [RegExp, string][] = [
  [/\byesterday\b/i, '*yesterday* — завершений момент у минулому'],
  [/\b\w+ ago\b/i, '*ago* — «тому», точка в минулому'],
  [/\blast (night|week|month|year|summer|winter|spring|autumn|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, '*last …* — минулий завершений період'],
  [/\bin (1[89]|20)\d\d\b/, 'рік у минулому — завершений час'],
  [/\b(already|just|yet|ever|never)\b/i, '*already / just / yet / ever / never* — типові маркери Present Perfect'],
  [/\bsince\b/i, '*since* — «відтоді як», дія триває досі'],
  [/\bfor (\w+ )?(years?|months?|weeks?|days?|hours?|ages|a long time)\b/i, '*for* + період — як довго триває'],
  [/\b(now|right now|at the moment|currently)\b/i, '*now / at the moment* — дія відбувається зараз'],
  [/\b(every|usually|always|often|sometimes|rarely|seldom)\b/i, 'слова частоти — звичка, повторювана дія'],
  [/\b(tomorrow|next (week|month|year)|soon)\b/i, 'майбутній час у реченні'],
]

interface Group {
  from: number
  to: number
  tense: Tense
  verb: VerbForms
  mainForm: Form
  main: string
  particles: string[]
}

/** The tense of an auxiliary chain followed by a main-verb form, or null when the chain is not one we drill. */
function tenseOf(aux: string[], form: Form, subject: string | undefined): Tense | null {
  const chain = aux.join(' ')
  const has = (f: Form) => form === f
  if (chain === '') {
    if (has('past')) return 'past-simple'
    if (has('s')) return 'present-simple'
    if (has('base') && subject && PRONOUNS.has(subject) && !THIRD.has(subject)) return 'present-simple'
    return null
  }
  if (/^(don't|doesn't|do not|does not)$/.test(chain) && has('base')) return 'present-simple-neg'
  if (/^(didn't|did not)$/.test(chain) && has('base')) return 'past-simple-neg'
  if (/^(am|is|are)$/.test(chain) && has('ing')) return 'present-continuous'
  if (/^(was|were)$/.test(chain) && has('ing')) return 'past-continuous'
  if (/^(have|has)$/.test(chain) && has('participle')) return 'present-perfect'
  if (/^(have|has) been$/.test(chain) && has('ing')) return 'present-perfect-continuous'
  if (/^(have|has) been$/.test(chain) && has('participle')) return 'passive-perfect'
  if (chain === 'had' && has('participle')) return 'past-perfect'
  if (chain === 'will' && has('base')) return 'future-simple'
  if (chain === 'will be' && has('participle')) return 'passive-future'
  if (/^(am|is|are) going to$/.test(chain) && has('base')) return 'going-to'
  if (/^(am|is|are)$/.test(chain) && has('participle')) return 'passive-present'
  if (/^(was|were)$/.test(chain) && has('participle')) return 'passive-past'
  return null
}

const AUX_WORDS = new Set("am is are was were be been have has had will don't doesn't didn't do does did not going to".split(' '))

/** The first drillable verb group: the word's own verb if the sentence has one, else an irregular verb after a pronoun or auxiliary. */
function findGroup(sentence: string, own: VerbForms | null, ownParticles: string[], ownSure: boolean): Group | null {
  const toks = words(sentence)
  const question = /\?\s*$/.test(sentence)
  const candidates: { i: number; verb: VerbForms; forms: Form[] }[] = []
  toks.forEach((t, i) => {
    if (own?.forms.has(t.lower)) return candidates.push({ i, verb: own, forms: own.forms.get(t.lower)! })
    const irr = IRREGULAR_BY_FORM.get(t.lower)
    if (!irr || AUX_VERBS.has(irr.base)) return
    const v = verbForms(irr.base)
    candidates.push({ i, verb: v, forms: v.forms.get(t.lower) ?? [] })
  })
  // The word's own verb first: the drill is about the user's word whenever it can be.
  candidates.sort((a, b) => Number(b.verb === own) - Number(a.verb === own) || a.i - b.i)

  for (const c of candidates) {
    const isOwn = c.verb === own
    // The auxiliaries directly before the verb (a contracted one such as «I've» is part of the subject: skipped).
    const aux: string[] = []
    let j = c.i - 1
    while (j >= 0 && aux.length < 3 && AUX_WORDS.has(toks[j].lower)) aux.unshift(toks[j--].lower)
    // «to» is an auxiliary only in «going to»; «want to», «have to», «used to» are infinitives.
    if (aux.at(-1) === 'to' && aux.at(-2) !== 'going') continue
    const subject = toks[j]?.lower
    if (!subject || /'(ve|s|re|m|ll|d)$/.test(subject) || NOT_SUBJECT.has(subject)) continue
    // The subject must stand right before the group: «Be careful, don't break it» is an imperative, not a tense.
    const groupStart = toks[c.i - aux.length].start
    if (/[^\s]/.test(sentence.slice(toks[j].start + toks[j].text.length, groupStart))) continue
    // A word not known to be a verb counts as one only with an auxiliary (has postponed, was postponing).
    if (isOwn && !ownSure && aux.length === 0) continue
    if (aux.length === 0) {
      // In a question the bare form comes after «do you…»: nothing to choose.
      if (question) continue
      // A bare form needs a subject right before it; for a verb that is not the word itself, only a pronoun counts.
      if (!isOwn && !PRONOUNS.has(subject)) continue
      // put / cut / read: present and past look the same, so the tense cannot be told without an auxiliary.
      if (c.verb.irregular?.past.includes(c.verb.base)) continue
    }
    for (const form of c.forms) {
      const tense = tenseOf(aux, form, subject)
      if (!tense) continue
      // The particles of a phrasal word that stand right after the verb go into the gap with it.
      const particles: string[] = []
      if (isOwn) for (let k = c.i + 1; k < toks.length && ownParticles.includes(toks[k].lower); k++) particles.push(toks[k].lower)
      const first = toks[c.i - aux.length]
      const last = toks[c.i + particles.length]
      return { from: first.start, to: last.start + last.text.length, tense, verb: c.verb, mainForm: form, main: toks[c.i].lower, particles }
    }
  }
  return null
}

function hash(text: string): string {
  let h = 5381
  for (const ch of text) h = ((h << 5) + h + ch.charCodeAt(0)) | 0
  return (h >>> 0).toString(36)
}

/** A word that is (or starts with) a verb: by its part of speech, a «to …» form, or a particle after the first word. */
function ownVerb(w: DrillWord): { verb: VerbForms; particles: string[]; sure: boolean } | null {
  const parts = w.term.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/^to\s+/, '').trim().split(/\s+/)
  const first = parts[0]
  if (!/^[a-z]+$/.test(first) || AUX_VERBS.has(first)) return null
  const particles = parts.slice(1).filter((p) => PARTICLES.has(p))
  // Sure: by part of speech, «to …», a phrasal particle or the irregular table. Otherwise only an auxiliary shows it is a verb.
  const sure = /verb/i.test(w.pos ?? '') || /^to\s/i.test(w.term) || particles.length > 0 || IRREGULAR.has(first)
  if (!sure && (parts.length > 1 || /(ed|ing)$/.test(first))) return null
  return { verb: verbForms(first), particles, sure }
}

/** «Поставте дієслово у форму» from one sentence, or null if no verb group in it can be drilled reliably. */
export function formDrill(w: DrillWord): Item | null {
  const sentence = w.example?.trim()
  if (!sentence || sentence.length > 200) return null
  const own = ownVerb(w)
  const g = findGroup(sentence, own?.verb ?? null, own?.particles ?? [], own?.sure ?? false)
  if (!g) return null
  const answer = sentence.slice(g.from, g.to)
  const t = TENSES[g.tense]
  const cue = [g.verb.base, ...g.particles].join(' ')
  const isOwn = own?.verb.base === g.verb.base
  const markers = TIME_WORDS.filter(([re]) => re.test(sentence)).map(([, note]) => note)
  const spelling = spellingNote(g.verb, g.mainForm, g.main)
  const why = [t.rule, spelling, markers.length > 0 ? `Підказка в реченні: ${markers[0]}.` : '', `Відповідь: *${answer}*.`].filter(Boolean).join(' ')
  const accepted = [answer]
  // «will» and «shall» are both right after I / we.
  if (g.tense === 'future-simple' && /^(I|we) /i.test(sentence.slice(Math.max(0, g.from - 3)))) accepted.push(answer.replace(/^will/i, 'shall'))
  // Both spellings of verbs like learnt / learned, gotten / got.
  const irr = g.verb.irregular
  const variants = irr ? (g.mainForm === 'past' ? irr.past : g.mainForm === 'participle' ? irr.participle : []) : []
  for (const alt of variants) if (alt !== g.main) accepted.push(answer.replace(new RegExp(String.raw`\b${g.main}\b`, 'i'), alt))
  const q: Question = {
    id: `mw-f-${hash(sentence)}`,
    type: 'fill',
    q: `${sentence.slice(0, g.from)}___${sentence.slice(g.to)}`,
    answer: [...new Set(accepted)],
    hint: `${cue}${isOwn && w.translation ? ` (${w.translation})` : ''} → ${t.name}`,
    why,
  }
  return { slug: t.slug, q }
}

/** «Складіть речення» from a short sentence without commas, quotes or brackets (those have several right orders). */
export function orderDrill(w: DrillWord): Item | null {
  const sentence = w.example?.trim().replace(/[.!?]+$/, '')
  if (!sentence || /[,;:"“”()—–-]/.test(sentence)) return null
  const parts = sentence.split(/\s+/)
  if (parts.length < 5 || parts.length > 10 || parts.some((p) => !/^[A-Za-z'’]+$/.test(p))) return null
  return {
    slug: 'word-order',
    q: {
      id: `mw-o-${hash(sentence)}`,
      type: 'order',
      words: parts,
      answer: [sentence],
      hint: `Речення до слова «${w.term}»${w.translation ? ` — ${w.translation}` : ''}`,
      why: `Звичайний порядок: підмет → присудок → додаток → місце → час. Прислівники частоти стоять перед основним дієсловом. Речення з вашого словника: *${sentence}.*`,
    },
  }
}

/** Every drill the user's words give: verb forms from all sentences that allow one, word order from the short ones. */
export function sentenceDrills(list: DrillWord[]): Item[] {
  const seen = new Set<string>()
  const out: Item[] = []
  for (const w of list) {
    for (const item of [formDrill(w), orderDrill(w)]) {
      if (item && !seen.has(item.q.id)) {
        seen.add(item.q.id)
        out.push(item)
      }
    }
  }
  return out
}
