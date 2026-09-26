import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { openedFromPasswordLink } from './authHash'
import { supabase } from './supabase'

interface AuthState {
  session: Session | null
  loading: boolean
  /** True after a password-reset / invite link: the user must choose a password before using the app. */
  mustSetPassword: boolean
  passwordSet: () => void
}

const AuthContext = createContext<AuthState>({ session: null, loading: true, mustSetPassword: false, passwordSet: () => {} })

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

export function useAuth() {
  return useContext(AuthContext)
}
