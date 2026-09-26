import { useEffect } from 'react'

/** While the calling component is mounted (and `active`), hides the phone navigation (see `body[data-focus]` in index.css). */
export function useFocusMode(active = true) {
  useEffect(() => {
    if (!active) return
    document.body.dataset.focus = ''
    return () => {
      delete document.body.dataset.focus
    }
  }, [active])
}
