import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { onlineManager, QueryClient, useMutationState, type Mutation } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { del, get, set } from 'idb-keyval'
import { ANSWER_KEY, ANSWER_SCOPE, answerMutationDefaults } from './exerciseLog'
import { REVIEW_KEY, reviewMutationDefaults } from './queries'

/**
 * Offline support for user data. Grammar is bundled and works offline anyway; words, progress and logs come from
 * Supabase, so their last copy is kept in IndexedDB and shown when there is no connection. Answers given offline
 * are paused mutations: they are persisted with the cache and sent, in order, when the connection is back,
 * even if the app was closed in between.
 */

const WEEK = 7 * 86_400_000

export const queryClient = new QueryClient({
  defaultOptions: {
    // The persisted copy is restored only while it is younger than the cache lifetime.
    queries: { gcTime: WEEK },
  },
})

// A restored paused mutation has only its key and variables: these defaults supply the function that sends it.
queryClient.setMutationDefaults(REVIEW_KEY, reviewMutationDefaults(queryClient))
queryClient.setMutationDefaults(ANSWER_KEY, answerMutationDefaults(queryClient))

// Mock mode (dev, ?mock=1) keeps its fake data apart from a real account's cache.
const mock = import.meta.env.DEV && new URLSearchParams(location.search).has('mock')
const CACHE_KEY = mock ? 'lexo.cache.mock' : 'lexo.cache'

export const persister = createAsyncStoragePersister({
  key: CACHE_KEY,
  throttleTime: 1000,
  storage: {
    getItem: (key) => get<string>(key).then((v) => v ?? null),
    setItem: (key, value: string) => set(key, value),
    removeItem: (key) => del(key),
  },
})

export const persistOptions = {
  persister,
  maxAge: WEEK,
  // Bumped when the shape of cached rows changes, so an old copy is dropped instead of misread.
  buster: 'v1',
  dehydrateOptions: {
    // Only answers have defaults that can send them after a reload; other offline edits are not kept across it.
    shouldDehydrateMutation: (m: Mutation) => m.state.isPaused && m.options.scope?.id === ANSWER_SCOPE,
  },
}

/** Forgets the cached data and queued answers, for example on signing out, so the next account starts clean. */
export async function clearOfflineData() {
  queryClient.clear()
  await persister.removeClient()
}

// Lets the browser preview switch the app offline in dev (`__lexoOnline(false)`) and inspect the cache.
if (import.meta.env.DEV) Object.assign(window, { __lexoOnline: (v: boolean) => onlineManager.setOnline(v), __lexoQueryClient: queryClient })

/** Whether the browser has a connection (TanStack's view of it, which pauses queries and answers while offline). */
export function useOnline() {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
  )
}

/** Answers given but not yet saved on the server: waiting for a connection or being sent. */
export function usePendingAnswers() {
  return useMutationState({ filters: { status: 'pending', predicate: (m) => m.options.scope?.id === ANSWER_SCOPE } }).length
}
