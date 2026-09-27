import { levenshtein } from './text'

/**
 * Speech recognition through the browser (Web Speech API): Chrome and Edge on a computer, Chrome on Android,
 * Safari on iPhone. Chrome sends the audio to Google for recognition, so it needs a connection. Firefox has no support:
 * there the speaking exercise is hidden.
 */

interface RecognitionResult {
  transcript: string
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<ArrayLike<RecognitionResult> & { isFinal: boolean }>
}
interface Recognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => Recognition

const Ctor: RecognitionCtor | undefined =
  typeof window === 'undefined' ? undefined : ((window as unknown as Record<string, RecognitionCtor | undefined>).SpeechRecognition ?? (window as unknown as Record<string, RecognitionCtor | undefined>).webkitSpeechRecognition)

export const canRecognize = Boolean(Ctor)

const ERRORS: Record<string, string> = {
  'not-allowed': 'Немає доступу до мікрофона. Дозвольте його в налаштуваннях браузера або пропустіть вправу.',
  'service-not-allowed': 'Браузер не дозволяє розпізнавання мовлення на цій сторінці.',
  'no-speech': 'Нічого не почуто. Спробуйте ще раз, трохи голосніше.',
  'audio-capture': 'Мікрофон не знайдено.',
  network: 'Для розпізнавання потрібен інтернет.',
}

export interface Listening {
  stop: () => void
  /** Everything the recogniser thought it heard, best guess first. */
  result: Promise<string[]>
}

export function startListening(onInterim?: (text: string) => void): Listening {
  if (!Ctor) throw new Error('Розпізнавання мовлення не підтримується в цьому браузері.')
  const rec = new Ctor()
  rec.lang = 'en-US'
  rec.interimResults = true
  rec.maxAlternatives = 5
  rec.continuous = false
  const result = new Promise<string[]>((resolve, reject) => {
    let heard: string[] = []
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const alternatives = Array.from(res, (a) => a.transcript.trim()).filter(Boolean)
        if (res.isFinal) heard = alternatives
        else onInterim?.(alternatives[0] ?? '')
      }
    }
    rec.onerror = (e) => {
      if (e.error === 'aborted') resolve([])
      else reject(new Error(ERRORS[e.error] ?? `Помилка розпізнавання: ${e.error}`))
    }
    rec.onend = () => resolve(heard)
  })
  rec.start()
  return { stop: () => rec.stop(), result }
}

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bsmth\b|\bsth\b/g, 'something')
    .replace(/\bsb\b/g, 'somebody')
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export type SpokenResult = 'exact' | 'typo' | 'wrong'

/**
 * Compares what was heard with the word. Recognition is not exact, so a small difference (one or two letters, like a
 * typo) counts as close; saying the word inside a longer phrase ("the word is cat") also counts.
 */
export function checkSpoken(heard: string[], term: string): SpokenResult {
  const expected = clean(term)
  let best: SpokenResult = 'wrong'
  for (const h of heard.map(clean)) {
    if (h === expected || ` ${h} `.includes(` ${expected} `)) return 'exact'
    const allowed = expected.length >= 10 ? 2 : expected.length >= 4 ? 1 : 0
    if (allowed > 0 && levenshtein(h, expected) <= allowed) best = 'typo'
  }
  return best
}
