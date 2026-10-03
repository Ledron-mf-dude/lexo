import { createClient, type Session } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && publishableKey)

// Falls back to placeholders so the app still renders (with a setup notice) before .env is filled in.
export const supabase = createClient(url ?? 'http://localhost', publishableKey ?? 'missing-anon-key')

/**
 * The session supabase-js keeps in localStorage. Offline, an expired access token cannot be refreshed, so
 * supabase-js reports no session although it keeps the stored one (it drops it only on a real sign-out or a
 * rejected refresh). The app then goes on with the stored user; the token is refreshed once the connection is back.
 */
export function storedSession(): Session | null {
  if (!url) return null
  try {
    const raw = localStorage.getItem(`sb-${new URL(url).hostname.split('.')[0]}-auth-token`)
    const s = raw ? (JSON.parse(raw) as Session & { currentSession?: Session }) : null
    const session = s?.currentSession ?? s
    return session?.user && session.refresh_token ? session : null
  } catch {
    return null
  }
}
