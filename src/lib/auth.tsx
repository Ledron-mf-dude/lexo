import type { Session } from '@supabase/supabase-js'
import { useEffect, useState, type ReactNode } from 'react'
import { AuthContext } from './authContext'
import { openedFromPasswordLink } from './authHash'
import { clearOfflineData } from './offline'
import { storedSession, supabase } from './supabase'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [mustSetPassword, setMustSetPassword] = useState(openedFromPasswordLink)

  useEffect(() => {
    // No session but one still stored: the token could not be refreshed offline, so keep working with the stored user.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? storedSession())
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setMustSetPassword(true)
      if (event === 'SIGNED_OUT') {
        setMustSetPassword(false)
        // The next account on this device must not see this one's cached words or send its queued answers.
        void clearOfflineData()
      }
      setSession(next ?? (event === 'SIGNED_OUT' ? null : storedSession()))
      setLoading(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, loading, mustSetPassword, passwordSet: () => setMustSetPassword(false) }}>
      {children}
    </AuthContext.Provider>
  )
}
