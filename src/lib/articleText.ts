import { isValidElement, type ReactNode } from 'react'

/** Id of an article section heading (HashRouter owns the URL hash, so the table of contents scrolls by id instead of #anchors). */
export const headingId = (text: string) => 'h-' + text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')

/** Plain text of rendered markdown children. */
export const textOf = (node: ReactNode): string =>
  typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(textOf).join('') : isValidElement(node) ? textOf((node.props as { children?: ReactNode }).children) : ''

/** An article body split into its `## ` sections (the text before the first heading is dropped). */
export function articleSections(body: string): { title: string; body: string }[] {
  return body
    .split(/^(?=## )/m)
    .filter((part) => part.startsWith('## '))
    .map((part) => ({ title: part.slice(3, part.search(/\r?\n/)).replace(/[*`]/g, '').trim(), body: part }))
}
