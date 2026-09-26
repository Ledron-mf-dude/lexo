import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PracticeMode, Progress, Tag, Word } from '../types'
import { supabase } from './supabase'

export type WordWithTags = Word & { tagIds: string[] }

export interface WordInput {
  id?: string
  term: string
  translation: string
  definition: string
  example: string
  tagNames: string[]
}

const PAGE = 1000 // PostgREST returns at most 1000 rows per request

async function fetchAllWords(): Promise<WordWithTags[]> {
  const rows: WordWithTags[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('words')
      .select('*, word_tags(tag_id)')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw error
    for (const row of data) {
      const { word_tags, ...word } = row as Word & { word_tags: { tag_id: string }[] }
      rows.push({ ...word, tagIds: word_tags.map((wt) => wt.tag_id) })
    }
    if (data.length < PAGE) return rows
  }
}

export function useWords() {
  return useQuery({ queryKey: ['words'], queryFn: fetchAllWords })
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase.from('tags').select('*').order('name')
      if (error) throw error
      return data
    },
  })
}

/** Creates missing tags by name and returns ids for every requested name. */
async function ensureTags(userId: string, names: string[]): Promise<string[]> {
  if (names.length === 0) return []
  const { data: existing, error } = await supabase.from('tags').select('id, name').in('name', names)
  if (error) throw error
  const byName = new Map(existing.map((t) => [t.name as string, t.id as string]))
  const missing = names.filter((n) => !byName.has(n))
  if (missing.length > 0) {
    const { data: created, error: insertError } = await supabase
      .from('tags')
      .insert(missing.map((name) => ({ name, user_id: userId })))
      .select('id, name')
    if (insertError) throw insertError
    for (const t of created) byName.set(t.name as string, t.id as string)
  }
  return names.map((n) => byName.get(n)!)
}

export function useSaveWord(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: WordInput) => {
      const fields = {
        term: input.term.trim(),
        translation: input.translation.trim(),
        definition: input.definition.trim() || null,
        example: input.example.trim() || null,
      }
      let wordId = input.id
      if (wordId) {
        const { error } = await supabase.from('words').update(fields).eq('id', wordId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('words')
          .insert({ ...fields, user_id: userId })
          .select('id')
          .single()
        if (error) throw error
        wordId = data.id as string
      }

      const tagIds = await ensureTags(userId, input.tagNames)
      const { error: delError } = await supabase.from('word_tags').delete().eq('word_id', wordId)
      if (delError) throw delError
      if (tagIds.length > 0) {
        const { error } = await supabase
          .from('word_tags')
          .insert(tagIds.map((tag_id) => ({ word_id: wordId, tag_id })))
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['words'] })
      qc.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

export function useDeleteWord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('words').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['words'] }),
  })
}

export interface ImportResult {
  added: number
  skipped: number
}

const CHUNK = 200

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Bulk-inserts parsed words, skipping terms that already exist. New words get a progress row via DB trigger. */
export function useImportWords(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      words: WordInput[]
      extraTag: string
      onProgress?: (done: number, total: number) => void
    }): Promise<ImportResult> => {
      const existing = new Set((await fetchAllWords()).map((w) => w.term.toLowerCase()))
      const fresh = args.words.filter((w) => !existing.has(w.term.toLowerCase()))
      const extra = args.extraTag.trim()
      const withTags = fresh.map((w) => ({ ...w, tagNames: extra ? [...new Set([...w.tagNames, extra])] : w.tagNames }))

      const tagNames = [...new Set(withTags.flatMap((w) => w.tagNames))]
      const tagIds = await ensureTags(userId, tagNames)
      const tagIdByName = new Map(tagNames.map((n, i) => [n, tagIds[i]]))

      const links: { word_id: string; tag_id: string }[] = []
      let done = 0
      for (const batch of chunks(withTags, CHUNK)) {
        const { data, error } = await supabase
          .from('words')
          .insert(
            batch.map((w) => ({
              user_id: userId,
              term: w.term,
              translation: w.translation,
              definition: w.definition || null,
              example: w.example || null,
            })),
          )
          .select('id, term')
        if (error) throw error
        const idByTerm = new Map(data.map((r) => [(r.term as string).toLowerCase(), r.id as string]))
        for (const w of batch) {
          const wordId = idByTerm.get(w.term.toLowerCase())
          if (wordId) for (const name of w.tagNames) links.push({ word_id: wordId, tag_id: tagIdByName.get(name)! })
        }
        done += batch.length
        args.onProgress?.(done, withTags.length)
      }
      for (const batch of chunks(links, 500)) {
        const { error } = await supabase.from('word_tags').insert(batch)
        if (error) throw error
      }
      return { added: withTags.length, skipped: args.words.length - withTags.length }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['words'] })
      qc.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

async function fetchAllProgress(): Promise<Progress[]> {
  const rows: Progress[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('progress').select('*').range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data as Progress[]))
    if (data.length < PAGE) return rows
  }
}

export function useProgress() {
  return useQuery({ queryKey: ['progress'], queryFn: fetchAllProgress })
}

export interface ReviewInput {
  wordId: string
  mode: PracticeMode
  correct: boolean
  errorCount: number
  /** Omitted for the early exercises of a complex: those are only logged, the schedule changes once, at the end. */
  next?: { ease_factor: number; interval_days: number; repetitions: number; due_at: Date }
}

/** Persists one answer: appends a review_log row and, unless `next` is omitted, updates the word's schedule. */
export function useReviewWord(userId: string) {
  return useMutation({
    mutationFn: async (r: ReviewInput) => {
      const now = new Date().toISOString()
      if (r.next) {
        const { error } = await supabase
          .from('progress')
          .update({
            ease_factor: r.next.ease_factor,
            interval_days: r.next.interval_days,
            repetitions: r.next.repetitions,
            due_at: r.next.due_at.toISOString(),
            last_reviewed: now,
            error_count: r.errorCount,
          })
          .eq('word_id', r.wordId)
        if (error) throw error
      }
      const { error: logError } = await supabase
        .from('review_log')
        .insert({ word_id: r.wordId, user_id: userId, mode: r.mode, correct: r.correct, reviewed_at: now })
      if (logError) throw logError
    },
  })
}

export const TAG_COLORS = ['#7c9bff', '#5eead4', '#6ee7b7', '#fbbf24', '#fb7185', '#c4b5fd', '#f9a8d4', '#94a3b8']

/** Create / rename / recolour / delete / merge tags. Words and tags are refetched afterwards. */
export function useTagActions(userId: string) {
  const qc = useQueryClient()
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['tags'] })
    qc.invalidateQueries({ queryKey: ['words'] })
  }
  const opts = { onSuccess: refresh }

  const create = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('tags').insert({ name: name.trim(), user_id: userId })
      if (error) throw error
    },
    ...opts,
  })
  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('tags').update({ name: name.trim() }).eq('id', id)
      if (error) throw error
    },
    ...opts,
  })
  const recolor = useMutation({
    mutationFn: async ({ id, color }: { id: string; color: string | null }) => {
      const { error } = await supabase.from('tags').update({ color }).eq('id', id)
      if (error) throw error
    },
    ...opts,
  })
  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      // word_tags rows disappear with the tag (ON DELETE CASCADE); the words themselves stay.
      const { error } = await supabase.from('tags').delete().in('id', ids)
      if (error) throw error
    },
    ...opts,
  })
  /** Moves every word of `from` to `into` (skipping words that already have it), then deletes `from`. */
  const merge = useMutation({
    mutationFn: async ({ from, into }: { from: string; into: string }) => {
      const { data: fromRows, error: e1 } = await supabase.from('word_tags').select('word_id').eq('tag_id', from)
      if (e1) throw e1
      const { data: intoRows, error: e2 } = await supabase.from('word_tags').select('word_id').eq('tag_id', into)
      if (e2) throw e2
      const already = new Set(intoRows.map((r) => r.word_id as string))
      const toAdd = fromRows.map((r) => r.word_id as string).filter((id) => !already.has(id))
      for (let i = 0; i < toAdd.length; i += 500) {
        const { error } = await supabase.from('word_tags').insert(toAdd.slice(i, i + 500).map((word_id) => ({ word_id, tag_id: into })))
        if (error) throw error
      }
      const { error } = await supabase.from('tags').delete().eq('id', from)
      if (error) throw error
    },
    ...opts,
  })

  return { create, rename, recolor, remove, merge }
}
