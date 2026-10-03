export interface DiffPart {
  text: string
  /** Not in the other sentence: the words the correction removed (wrong side) or added (right side). */
  changed: boolean
}

const key = (w: string) => w.toLowerCase().replace(/[.,!?;:"«»()]/g, '').replace(/’/g, "'")

/**
 * Word-level difference between a wrong sentence and its correction, as two lists of parts:
 * the words kept by both (longest common subsequence) are plain, the rest are marked as changed.
 */
export function diffWords(wrong: string, right: string): { wrong: DiffPart[]; right: DiffPart[] } {
  const a = wrong.split(/\s+/).filter(Boolean)
  const b = right.split(/\s+/).filter(Boolean)
  const ka = a.map(key)
  const kb = b.map(key)
  // lcs[i][j] = length of the common subsequence of a[i..] and b[j..]
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = ka[i] === kb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const keepA = new Array<boolean>(a.length).fill(false)
  const keepB = new Array<boolean>(b.length).fill(false)
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (ka[i] === kb[j]) {
      keepA[i++] = true
      keepB[j++] = true
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++
    else j++
  }
  const parts = (words: string[], keep: boolean[]) => words.map((text, i) => ({ text, changed: !keep[i] }))
  return { wrong: parts(a, keepA), right: parts(b, keepB) }
}
