import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && publishableKey)

// Falls back to placeholders so the app still renders (with a setup notice) before .env is filled in.
export const supabase = createClient(url ?? 'http://localhost', publishableKey ?? 'missing-anon-key')
