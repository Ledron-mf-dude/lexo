import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import { AuthProvider } from './lib/auth'
import { useAuth } from './lib/authContext'
import { lazyPage } from './lib/lazyPage'
import { persistOptions, queryClient } from './lib/offline'
import { isSupabaseConfigured } from './lib/supabase'
import Account from './pages/Account'
import Login from './pages/Login'
import Practice from './pages/Practice'
import Tags from './pages/Tags'
import SetPassword from './pages/SetPassword'
import Words from './pages/Words'

// Grammar articles are bundled as text; load that chunk only when the section is opened.
const Grammar = lazyPage(() => import('./pages/Grammar'))
const GrammarArticle = lazyPage(() => import('./pages/GrammarArticle'))
const ExerciseQuiz = lazyPage(() => import('./pages/ExerciseQuiz'))
const MixedQuiz = lazyPage(() => import('./pages/ExerciseQuiz').then((m) => ({ default: m.MixedQuiz })))
const Stats = lazyPage(() => import('./pages/Stats'))
const Placement = lazyPage(() => import('./pages/Placement'))
const Writing = lazyPage(() => import('./pages/Writing'))
const Reading = lazyPage(() => import('./pages/Reading'))
const ReadingText = lazyPage(() => import('./pages/ReadingText'))

// Shown while a lazily loaded section (grammar, statistics) downloads.
const loading = <p className="animate-pulse text-white/55">Завантаження…</p>

function Gate() {
  const { session, loading, mustSetPassword } = useAuth()
  if (!isSupabaseConfigured) return <Layout />
  if (loading) return null
  if (!session) return <Login />
  if (mustSetPassword) return <SetPassword />
  return <Layout />
}

// HashRouter: GitHub Pages has no server-side fallback for deep links.
export default function App() {
  return (
    <ErrorBoundary>
    {/* The last copy of the user's data comes back from IndexedDB; answers queued offline are then sent. */}
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions} onSuccess={() => queryClient.resumePausedMutations()}>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route element={<Gate />}>
              <Route index element={<Navigate to="/practice" replace />} />
              <Route path="practice" element={<Practice />} />
              <Route path="words" element={<Words />} />
              <Route path="grammar" element={<Suspense fallback={loading}><Grammar /></Suspense>} />
              <Route path="grammar/practice" element={<Suspense fallback={loading}><MixedQuiz /></Suspense>} />
              <Route path="grammar/placement" element={<Suspense fallback={loading}><Placement /></Suspense>} />
              <Route path="grammar/writing" element={<Suspense fallback={loading}><Writing /></Suspense>} />
              <Route path="grammar/:slug" element={<Suspense fallback={loading}><GrammarArticle /></Suspense>} />
              <Route path="grammar/:slug/exercises" element={<Suspense fallback={loading}><ExerciseQuiz /></Suspense>} />
              <Route path="reading" element={<Suspense fallback={loading}><Reading /></Suspense>} />
              <Route path="reading/:slug" element={<Suspense fallback={loading}><ReadingText /></Suspense>} />
              <Route path="account" element={<Account />} />
              <Route path="tags" element={<Tags />} />
              <Route path="stats" element={<Suspense fallback={loading}><Stats /></Suspense>} />
              <Route path="*" element={<Navigate to="/practice" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </AuthProvider>
    </PersistQueryClientProvider>
    </ErrorBoundary>
  )
}
