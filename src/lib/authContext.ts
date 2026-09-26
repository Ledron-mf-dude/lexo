import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export interface AuthState {
  session: Session | null
  loading: boolean
  /** True after a password-reset / invite link: the user must choose a password before using the app. */
  mustSetPassword: boolean
  passwordSet: () => void
}

export const AuthContext = createContext<AuthState>({ session: null, loading: true, mustSetPassword: false, passwordSet: () => {} })

/** The signed-in session and password-link state (provided by AuthProvider in auth.tsx). */
export function useAuth() {
  return useContext(AuthContext)
}
