import type { Question } from './exercises'

// Words that say nothing about which rule a question tests (auxiliaries, who/what/that, if stay: they are often the rule itself).
const STOP = new Set(
  'the a an and or but to of in on at with is are was were be been it this you he she they we i my your from by as so than then про для як що не на з із і й та або це від до після перед без коли лише тільки теж також бо чи'.split(
    ' ',
  ),
)

// Long words are cut to a stem, so Ukrainian endings do not matter («послідовні» meets «послідовність»).
const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .split(/[^\p{L}\p{N}'+-]+/u)
    .filter((w) => w.length >= 2 && !STOP.has(w))
    .map((w) => (w.length > 6 ? w.slice(0, 6) : w))

/** What the question is about: the explanation first (it names the rule), then the right answer. */
function clues(q: Question): { word: string; weight: number }[] {
  const answer = q.type === 'choice' ? q.options[q.answer] : q.answer[0]
  const out = new Map<string, number>()
  for (const w of words(q.why)) out.set(w, 2)
  for (const w of words(answer)) if (!out.has(w)) out.set(w, 1)
  return [...out].map(([word, weight]) => ({ word, weight }))
}

/**
 * The article section that most likely explains this question: the one sharing the most clue words with its explanation and answer.
 * «Типові помилки» counts for little, since «find the mistake» pairs come from it but it does not explain the rule.
 */
export function ruleSectionIndex(sections: { title: string; body: string }[], q: Question): number {
  const cl = clues(q)
  let best = 0
  let bestScore = -1
  sections.forEach((s, i) => {
    const text = new Set(words(s.body))
    const title = new Set(words(s.title))
    // A clue in the heading itself («Past Simple», «Since + момент») says the most about what the section explains.
    const hits = cl.reduce((sum, c) => sum + (text.has(c.word) ? c.weight : 0) + (title.has(c.word) ? 2 * c.weight : 0), 0)
    const score = hits * (s.title.startsWith('Типові помилки') ? 0.3 : 1)
    if (score > bestScore) {
      best = i
      bestScore = score
    }
  })
  return best
}
