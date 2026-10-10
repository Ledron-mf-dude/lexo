import { createPref } from './prefs'

/**
 * Colour theme per device: dark (the original look), light, or whatever the system uses.
 * index.html applies the stored choice before the first paint, so the page does not flash; this module keeps it in
 * sync afterwards (a new choice, or the system switching between day and night).
 */
export const themePref = createPref('theme', ['dark', 'light', 'system'] as const, 'dark')

const BG = { dark: '#0A0B0F', light: '#F3F5FA' } as const
const systemLight = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null

function apply() {
  const choice = themePref.get()
  const theme = choice === 'system' ? (systemLight?.matches ? 'light' : 'dark') : choice
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BG[theme])
}

export function setTheme(next: 'dark' | 'light' | 'system') {
  themePref.set(next)
  apply()
}

if (typeof window !== 'undefined') {
  apply()
  systemLight?.addEventListener('change', () => themePref.get() === 'system' && apply())
}
