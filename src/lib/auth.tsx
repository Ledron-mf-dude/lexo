import type { Session } from '@supabase/supabase-js'
import { useEffect, useState, type ReactNode } from 'react'
import { AuthContext } from './authContext'
import { openedFromPasswordLink } from './authHash'
import { supabase } from './supabase'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [mustSetPassword, setMustSetPassword] = useState(openedFromPasswordLink)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setMustSetPassword(true)
      if (event === 'SIGNED_OUT') setMustSetPassword(false)
      setSession(next)
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
