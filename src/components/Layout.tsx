import { useEffect, useLayoutEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/supabase'
import ErrorBoundary from './ErrorBoundary'
import OfflineBanner from './OfflineBanner'

const navItems = [
  { to: '/practice', label: 'Практика', icon: '◐' },
  { to: '/words', label: 'Слова', icon: '☰' },
  { to: '/grammar', label: 'Граматика', icon: '§' },
  { to: '/reading', label: 'Читання', icon: '¶' },
  { to: '/stats', label: 'Статистика', icon: '▤' },
]

/** A new page opens at the top; Back returns to where the previous page was scrolled (e.g. the grammar list). */
function ScrollRestoration() {
  const { key, pathname } = useLocation()
  const type = useNavigationType()
  const saved = useRef(new Map<string, number>())
  const prevPath = useRef(pathname)
  // The key the scroll position belongs to. It switches before this page scrolls, so the scroll events caused by
  // navigating are recorded for the new page and the previous page keeps the position the user left it at.
  const current = useRef(key)

  useEffect(() => {
    const onScroll = () => saved.current.set(current.current, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    current.current = key
    const changed = prevPath.current !== pathname
    prevPath.current = pathname
    const y = type === 'POP' ? saved.current.get(key) : undefined
    if (y !== undefined) {
      // A lazily loaded page may not be tall enough yet: retry for a few frames.
      let tries = 0
      const go = () => {
        window.scrollTo(0, y)
        if (Math.abs(window.scrollY - y) > 2 && tries++ < 20) requestAnimationFrame(go)
      }
      go()
    } else if (changed) {
      window.scrollTo(0, 0)
    }
  }, [key, pathname, type])

  return null
}

export default function Layout() {
  const { pathname } = useLocation()
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col md:flex-row md:gap-6 md:p-6">
      <ScrollRestoration />
      <nav className="app-nav glass max-md:bg-panel! fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex justify-around rounded-3xl p-1.5 md:sticky md:top-6 md:w-48 md:flex-col md:justify-start md:gap-1 md:self-start">
        <span className="hidden bg-gradient-to-r from-accent to-accent-alt bg-clip-text px-3 pt-2 pb-3 text-2xl font-light text-transparent md:block">Lexo</span>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-0.5 py-2 text-[11px] font-light md:px-3 transition-colors md:flex-none md:flex-row md:gap-3 md:text-sm ${
                isActive ? 'bg-white/10 text-accent' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <span className="text-base leading-none md:w-4 md:text-center">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        {isSupabaseConfigured && (
          <NavLink
            to="/account"
            className={({ isActive }) =>
              `hidden items-center gap-3 rounded-2xl px-3 py-2 text-sm font-light transition-colors md:mt-3 md:flex md:border-t md:border-white/8 ${isActive ? 'bg-white/10 text-accent' : 'text-white/50 hover:bg-white/5 hover:text-white'}`
            }
          >
            <span className="w-4 text-center text-base leading-none">⚙</span>
            Акаунт
          </NavLink>
        )}
      </nav>

      {isSupabaseConfigured && (
        <header className="app-header flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] md:hidden">
          <span className="bg-gradient-to-r from-accent to-accent-alt bg-clip-text text-xl font-light text-transparent">Lexo</span>
          <NavLink to="/account" aria-label="Акаунт" className="-m-2 grid size-10 place-items-center text-lg text-white/50 hover:text-white">
            ⚙
          </NavLink>
        </header>
      )}

      <main className="app-main min-w-0 flex-1 px-4 pt-4 pb-28 md:p-0">
        {isSupabaseConfigured ? (
          // Keyed by page: a crash in one page does not stay on screen after navigating to another.
          <ErrorBoundary key={pathname}>
            <OfflineBanner />
            <Outlet />
          </ErrorBoundary>
        ) : (
          <div className="glass rounded-2xl p-4 text-sm text-white/70">
            Supabase не налаштовано: скопіюйте <code>.env.example</code> у <code>.env</code> і вкажіть URL та publishable key.
          </div>
        )}
      </main>
    </div>
  )
}
