// Virtual modules of the content plugin (vite/lexoContent.ts). The data is typed where it is imported
// (lib/grammar.ts, lib/exercises.ts): an ambient declaration cannot import the types by a relative path.

declare module 'virtual:lexo/grammar' {
  export const articles: unknown[]
  export const contents: Record<string, () => Promise<{ body: string; terms: string[] }>>
  export const loadSearch: () => Promise<[slug: string, text: string][]>
}

declare module 'virtual:lexo/exercises' {
  export const ids: Record<string, string[]>
  export const fixes: Record<string, number>
  export const banks: Record<string, () => Promise<unknown[]>>
}
