import { lazy, type ComponentType } from 'react'

const RELOADED_KEY = 'lexo.reloadedForNewVersion'

/**
 * After a deploy the service worker drops the old chunks, so a tab still running the old bundle cannot load a section
 * it has not opened yet. One automatic reload picks up the new version; the flag stops a reload loop if the file is
 * really missing (the error boundary then shows a message).
 */
export function reloadForNewVersion(): boolean {
  try {
    if (sessionStorage.getItem(RELOADED_KEY)) return false
    sessionStorage.setItem(RELOADED_KEY, '1')
  } catch {
    return false
  }
  location.reload()
  return true
}

function loaded() {
  try {
    sessionStorage.removeItem(RELOADED_KEY)
  } catch {
    // storage blocked: nothing to reset
  }
}

/** `React.lazy` that reloads the page once when the chunk is gone after a deploy. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().then(
      (module) => {
        loaded()
        return module
      },
      (error: unknown) => {
        // Never resolves: the page is reloading.
        if (reloadForNewVersion()) return new Promise<{ default: T }>(() => {})
        throw error
      },
    ),
  )
}
