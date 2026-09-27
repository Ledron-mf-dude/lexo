import { useSyncExternalStore } from 'react'

/**
 * British or American English, per browser: the voice that reads words aloud and the spelling the writing check
 * expects («colour» or «color»). British by default, as taught in Ukrainian schools.
 */
export type Accent = 'GB' | 'US'

const KEY = 'lexo.accent'
const listeners = new Set<() => void>()

function read(): Accent {
  try {
    return localStorage.getItem(KEY) === 'US' ? 'US' : 'GB'
  } catch {
    return 'GB'
  }
}

let accent = read()

export const getAccent = () => accent

export function setAccent(a: Accent) {
  accent = a
  try {
    localStorage.setItem(KEY, a)
  } catch {
    // private mode: the choice lasts until the page is closed
  }
  listeners.forEach((l) => l())
}

export function onAccentChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useAccent(): Accent {
  return useSyncExternalStore(onAccentChange, getAccent)
}
