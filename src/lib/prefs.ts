import { useSyncExternalStore } from 'react'

/**
 * A small per-device preference kept in localStorage under `lexo.<name>`, readable from React with `use()`.
 * Private mode or blocked storage falls back to the default; the value then lasts until the tab is closed.
 */
export function createPref<T extends string>(name: string, allowed: readonly T[], fallback: T) {
  const key = `lexo.${name}`
  const listeners = new Set<() => void>()
  let value: T = (() => {
    try {
      const raw = localStorage.getItem(key)
      return allowed.includes(raw as T) ? (raw as T) : fallback
    } catch {
      return fallback
    }
  })()

  return {
    get: () => value,
    set(next: T) {
      value = next
      try {
        localStorage.setItem(key, next)
      } catch {
        // not remembered, still applies now
      }
      listeners.forEach((l) => l())
    },
    use(): T {
      return useSyncExternalStore(
        (cb) => {
          listeners.add(cb)
          return () => listeners.delete(cb)
        },
        () => value,
      )
    },
  }
}

/** Questions per round of a topic quiz: 10, 20 or the whole topic. */
export const deckSizePref = createPref('deckSize', ['10', '20', 'all'] as const, '10')

/** After a right answer the quiz moves on by itself; a wrong one always waits for «Далі». */
export const autoNextPref = createPref('autoNext', ['on', 'off'] as const, 'off')

/** Which tool panel is open under «Сьогодні» on the Grammar page. */
export const grammarPanelPref = createPref('grammarPanel', ['none', 'route', 'pairs'] as const, 'none')
