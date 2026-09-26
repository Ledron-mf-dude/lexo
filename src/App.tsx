import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { AuthProvider, useAuth } from './lib/auth'
import { isSupabaseConfigured } from './lib/supabase'
import Account from './pages/Account'
import Login from './pages/Login'
import Placeholder from './pages/Placeholder'
import Practice from './pages/Practice'
import SetPassword from './pages/SetPassword'
import Words from './pages/Words'

// Grammar articles are bundled as text; load that chunk only when the section is opened.
const Grammar = lazy(() => import('./pages/Grammar'))
const GrammarArticle = lazy(() => import('./pages/GrammarArticle'))
const ExerciseQuiz = lazy(() => import('./pages/ExerciseQuiz'))
const Stats = lazy(() => import('./pages/Stats'))

const queryClient = new QueryClient()

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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route element={<Gate />}>
              <Route index element={<Navigate to="/practice" replace />} />
              <Route path="practice" element={<Practice />} />
              <Route path="words" element={<Words />} />
              <Route path="grammar" element={<Suspense fallback={null}><Grammar /></Suspense>} />
              <Route path="grammar/:slug" element={<Suspense fallback={null}><GrammarArticle /></Suspense>} />
              <Route path="grammar/:slug/exercises" element={<Suspense fallback={null}><ExerciseQuiz /></Suspense>} />
              <Route path="account" element={<Account />} />
              <Route path="tags" element={<Placeholder title="Теги" />} />
              <Route path="stats" element={<Suspense fallback={null}><Stats /></Suspense>} />
            </Route>
          </Routes>
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
