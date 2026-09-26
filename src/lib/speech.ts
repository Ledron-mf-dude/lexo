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

export function speak(text: string, rate = 0.9) {
  const clean = spoken(text)
  if (!canSpeak || clean === '') return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(clean)
  u.lang = voice?.lang ?? 'en-US'
  if (voice) u.voice = voice
  u.rate = rate
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
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
