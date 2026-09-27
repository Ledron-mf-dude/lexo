import { useEffect, useSyncExternalStore } from 'react'

/** Pronunciation through the browser's own speech synthesis: free, offline-capable, no server. */
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

const AUTO_KEY = 'lexo.speech.auto'

let voice: SpeechSynthesisVoice | undefined

function pickVoice() {
  const voices = window.speechSynthesis.getVoices()
  voice = voices.find((v) => v.lang === 'en-US') ?? voices.find((v) => v.lang.startsWith('en'))
}

if (canSpeak) {
  pickVoice()
  // Voices load asynchronously in Chrome.
  window.speechSynthesis.addEventListener('voiceschanged', pickVoice)
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

export function stopSpeaking() {
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
