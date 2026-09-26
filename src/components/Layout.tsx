import { NavLink, Outlet } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/supabase'

const navItems = [
  { to: '/practice', label: 'Практика', icon: '◐' },
  { to: '/words', label: 'Слова', icon: '☰' },
  { to: '/grammar', label: 'Граматика', icon: '§' },
  { to: '/tags', label: 'Теги', icon: '#' },
  { to: '/stats', label: 'Статистика', icon: '▤' },
]

export default function Layout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col md:flex-row md:gap-6 md:p-6">
      <nav className="glass fixed inset-x-3 bottom-3 z-10 flex justify-around rounded-3xl p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:static md:w-48 md:flex-col md:justify-start md:gap-1 md:self-start">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-3 py-2 text-xs font-light transition-colors md:flex-none md:flex-row md:gap-3 md:text-sm ${
                isActive ? 'bg-white/10 text-accent' : 'text-white/60 hover:text-white'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        {isSupabaseConfigured && (
          <NavLink
            to="/account"
            className={({ isActive }) =>
              `hidden rounded-2xl px-3 py-2 text-sm font-light transition-colors md:mt-4 md:block ${isActive ? 'bg-white/10 text-accent' : 'text-white/40 hover:text-white'}`
            }
          >
            Акаунт
          </NavLink>
        )}
      </nav>

      {isSupabaseConfigured && (
        <header className="flex items-center justify-between px-4 pt-4 md:hidden">
          <span className="bg-gradient-to-r from-accent to-accent-alt bg-clip-text text-xl font-light text-transparent">Lexo</span>
          <NavLink to="/account" aria-label="Акаунт" className="text-lg text-white/50 hover:text-white">
            ⚙
          </NavLink>
        </header>
      )}

      <main className="flex-1 px-4 pt-4 pb-28 md:p-0">
        {isSupabaseConfigured ? (
          <Outlet />
        ) : (
          <div className="glass rounded-2xl p-4 text-sm text-white/70">
            Supabase не налаштовано: скопіюйте <code>.env.example</code> у <code>.env</code> і вкажіть URL та publishable key.
          </div>
        )}
      </main>
    </div>
  )
}
