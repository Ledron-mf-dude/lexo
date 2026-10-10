import { useEffect, useSyncExternalStore } from 'react'
import { getAccent, onAccentChange } from './accent'

/** Pronunciation through the browser's own speech synthesis: free, offline-capable, no server. */
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

const AUTO_KEY = 'lexo.speech.auto'

let voice: SpeechSynthesisVoice | undefined

// The voice follows the British / American choice (Account → Озвучування); any English voice if that one is missing.
function pickVoice() {
  const voices = window.speechSynthesis.getVoices()
  const wanted = getAccent() === 'US' ? 'en-US' : 'en-GB'
  const lang = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-')
  voice = voices.find((v) => lang(v) === wanted) ?? voices.find((v) => lang(v).startsWith('en'))
}

if (canSpeak) {
  pickVoice()
  // Voices load asynchronously in Chrome.
  window.speechSynthesis.addEventListener('voiceschanged', pickVoice)
  onAccentChange(pickVoice)
}

/** "get sth done (informal)" -> "get sth done": what is in brackets is a note, not something to pronounce. */
function spoken(text: string): string {
  return text.replace(/\([^)]*\)/g, ' ').replace(/\s*\/\s*/g, ', ').replace(/\s+/g, ' ').trim()
}

// Recordings of real speakers (Wiktionary, words.audio_url) replace the synthetic voice for the words that have one.
const recordings = new Map<string, string>()

/** Called whenever the word list loads, so every `speak(term)` finds the word's recording. */
export function setRecordings(words: { term: string; audio_url: string | null }[]) {
  recordings.clear()
  for (const w of words) if (w.audio_url) recordings.set(spoken(w.term).toLowerCase(), w.audio_url)
}

// Commons recordings are mostly Ogg Vorbis, which Safari does not play; there the browser voice is used instead.
const canPlayOgg = typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== ''
const playable = (url: string) => !/\.(ogg|oga)$/i.test(url) || canPlayOgg

let playing: HTMLAudioElement | null = null

/** Plays a recording; if it cannot be played, says `fallback` with the browser voice. */
export function playRecording(url: string, fallback: string, rate = 0.9) {
  stopSpeaking()
  if (!playable(url)) return synthesize(spoken(fallback), rate)
  const audio = new Audio(url)
  // `rate` is tuned for the synthetic voice (0.9 = normal); a recording at 0.9 plays at its own speed.
  audio.playbackRate = Math.max(0.5, rate / 0.9)
  playing = audio
  audio.play().catch(() => {
    if (playing === audio) synthesize(spoken(fallback), rate)
  })
}

export function speak(text: string, rate = 0.9) {
  const clean = spoken(text)
  if (clean === '') return
  const url = recordings.get(clean.toLowerCase())
  if (url) return playRecording(url, clean, rate)
  stopSpeaking()
  synthesize(clean, rate)
}

function synthesize(clean: string, rate: number) {
  if (!canSpeak || clean === '') return
  const u = new SpeechSynthesisUtterance(clean)
  u.lang = voice?.lang ?? 'en-US'
  if (voice) u.voice = voice
  u.rate = rate
  window.speechSynthesis.speak(u)
}

let sequence = 0
let partsDone: (() => void) | null = null

/**
 * Reads several sentences one after another (Chrome cuts a long utterance off after about 15 seconds, so a whole
 * text is never one utterance). `onPart` reports the sentence being read; `onDone` fires at the end, or when anything
 * else is spoken or speech is stopped.
 */
export function speakParts(parts: string[], rate: number, onPart: (i: number) => void, onDone: () => void) {
  stopSpeaking()
  if (!canSpeak) return onDone()
  const id = sequence
  partsDone = onDone
  const finish = () => {
    if (id !== sequence) return
    partsDone = null
    onDone()
  }
  const next = (i: number) => {
    if (id !== sequence) return
    if (i >= parts.length) return finish()
    onPart(i)
    const u = new SpeechSynthesisUtterance(spoken(parts[i]))
    u.lang = voice?.lang ?? 'en-US'
    if (voice) u.voice = voice
    u.rate = rate
    u.onend = () => next(i + 1)
    u.onerror = finish
    window.speechSynthesis.speak(u)
  }
  next(0)
}

export function stopSpeaking() {
  sequence++
  const done = partsDone
  partsDone = null
  done?.()
  playing?.pause()
  playing = null
  if (canSpeak) window.speechSynthesis.cancel()
}

// "Speak automatically in practice" preference: per browser, off by default (sound at work is a surprise).
const listeners = new Set<() => void>()

function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1'
  } catch {
    return false
  }
}

let auto = readAuto()

export function setAutoSpeak(on: boolean) {
  auto = on
  try {
    localStorage.setItem(AUTO_KEY, on ? '1' : '0')
  } catch {
    // private mode: the choice lasts until the page is closed
  }
  if (!on) stopSpeaking()
  listeners.forEach((l) => l())
}

export function useAutoSpeak(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => auto,
  )
}

/** Speaks `text` when it appears on screen (`show` becomes true), if automatic speech is on. */
export function useSpeakOnShow(text: string, show = true) {
  const on = useAutoSpeak()
  useEffect(() => {
    if (on && show) speak(text)
  }, [on, show, text])
}
