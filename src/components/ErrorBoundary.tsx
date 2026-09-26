import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Catches a crash in one page so the app shows a way out instead of a blank screen. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    // A failed lazy chunk after a deploy (old bundle cached) is fixed by a reload.
    const staleBundle = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message)
    return (
      <div className="glass mx-auto mt-10 max-w-md space-y-4 rounded-3xl p-6 text-center">
        <h1 className="text-xl font-light">{staleBundle ? 'Вийшла нова версія' : 'Щось пішло не так'}</h1>
        <p className="text-sm text-white/55">
          {staleBundle ? 'Оновіть сторінку, щоб завантажити її.' : 'Спробуйте оновити сторінку. Якщо помилка повториться, повідомте про неї.'}
        </p>
        {!staleBundle && <p className="rounded-xl bg-white/5 p-3 text-left font-mono text-xs break-words text-white/40">{error.message}</p>}
        <button onClick={() => location.reload()} className="btn-primary w-full">
          Оновити
        </button>
      </div>
    )
  }
}
