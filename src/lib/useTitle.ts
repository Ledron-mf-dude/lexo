import { useEffect } from 'react'

/** Sets the browser tab / history title: "Граматика · Lexo". */
export function useTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Lexo` : 'Lexo'
  }, [title])
}
