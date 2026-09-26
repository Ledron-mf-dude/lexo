/** Helpers for typed-answer modes: normalisation, typo tolerance, gap masks. */

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

export type TypedResult = 'exact' | 'typo' | 'wrong'

/** Short words must be exact; longer ones tolerate 1 (>= 5 letters) or 2 (>= 10 letters) slips. */
export function checkTyped(answer: string, expected: string): TypedResult {
  const a = normalize(answer)
  const e = normalize(expected)
  if (a === e) return 'exact'
  const allowed = e.length >= 10 ? 2 : e.length >= 5 ? 1 : 0
  return allowed > 0 && levenshtein(a, e) <= allowed ? 'typo' : 'wrong'
}

const isLetter = (ch: string) => /\p{L}/u.test(ch)

/** Indices of letters to hide: about 40%, never the first letter, at least one. Returns null if there is nothing to hide. */
export function pickGaps(term: string): number[] | null {
  const candidates = [...term].map((ch, i) => (i > 0 && isLetter(ch) ? i : -1)).filter((i) => i >= 0)
  if (candidates.length < 2) return null
  const count = Math.max(1, Math.round(candidates.length * 0.4))
  return candidates
    .map((i) => ({ i, r: Math.random() }))
    .sort((x, y) => x.r - y.r)
    .slice(0, count)
    .map((x) => x.i)
    .sort((x, y) => x - y)
}

/** Letters of `term` in a random order that differs from the original (when possible). */
export function scrambleLetters(term: string): string[] {
  const letters = [...term]
  if (new Set(letters).size < 2) return letters
  let out = letters
  for (let tries = 0; tries < 10 && out.join('') === term; tries++) {
    out = [...letters]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
  }
  return out
}
