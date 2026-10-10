import './dev/mock'
import './lib/authHash' // must run first: reads the password-link type before supabase-js clears the URL hash
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/theme'
import App from './App.tsx'
import { reloadForNewVersion } from './lib/lazyPage'

// A preloaded chunk of the old version is gone after a deploy: reload once instead of failing.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault()
})
// The app restores scroll itself when going back (Layout), so the browser should not jump on its own.
history.scrollRestoration = 'manual'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
