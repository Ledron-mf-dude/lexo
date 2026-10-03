import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { PracticeMode, Progress, Tag, Word } from '../types'
import type { ReviewRow } from './stats'
import { ANSWER_SCOPE } from './exerciseLog'
import { setRecordings } from './speech'
import { supabase } from './supabase'
import { builtInColor } from './tagTaxonomy'

export type WordWithTags = Word & { tagIds: string[] }

export interface WordInput {
  id?: string
  term: string
  translation: string
  definition: string
  example: string
  tagNames: string[]
  /** Pronunciation from Wiktionary; undefined leaves the stored value as it is. */
  ipa?: string
  pos?: string
  audio_url?: string
  /** Personal hint (migration 0005); undefined leaves it as it is. */
  note?: string
}

/** PostgREST's "column not in the schema cache": the migration that adds it has not been run yet. */
export const isMissingColumn = (error: { code?: string } | null) => error?.code === 'PGRST204'

export const MIGRATION_0004 = 'Спершу запустіть міграцію supabase/migrations/0004_word_pronunciation.sql у Supabase → SQL Editor.'

const PAGE = 1000 // PostgREST returns at most 1000 rows per request

async function fetchAllWords(): Promise<WordWithTags[]> {
  const rows: WordWithTags[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('words')
      .select('*, word_tags(tag_id)')
      .order('created_at', { ascending: false })
      // Words from one import share created_at: a unique tiebreaker keeps the order stable and the pages from overlapping.
      .order('term')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    for (const row of data) {
      const { word_tags, ...word } = row as Word & { word_tags: { tag_id: string }[] }
      rows.push({ ...word, tagIds: word_tags.map((wt) => wt.tag_id) })
    }
    if (data.length < PAGE) {
      setRecordings(rows)
      return rows
    }
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
      .insert(missing.map((name) => ({ name, user_id: userId, color: builtInColor(name) ?? null })))
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
      const pronunciation = {
        ...(input.ipa !== undefined && { ipa: input.ipa.trim() || null }),
        ...(input.pos !== undefined && { pos: input.pos.trim() || null }),
        ...(input.audio_url !== undefined && { audio_url: input.audio_url.trim() || null }),
        ...(input.note !== undefined && { note: input.note.trim() || null }),
      }
      // Before migration 0004 the ipa and pos columns do not exist: the word is saved without its pronunciation.
      async function write(values: Record<string, unknown>): Promise<string> {
        if (input.id) {
          const { error } = await supabase.from('words').update(values).eq('id', input.id)
          if (error) throw error
          return input.id
        }
        const { data, error } = await supabase
          .from('words')
          .insert({ ...values, user_id: userId })
          .select('id')
          .single()
        if (error) throw error
        return data.id as string
      }
      let wordId: string
      try {
        wordId = await write({ ...fields, ...pronunciation })
      } catch (e) {
        if (!isMissingColumn(e as { code?: string })) throw e
        wordId = await write(fields)
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

export const MIGRATION_0005 = 'Спершу запустіть міграцію supabase/migrations/0005_hard_words_directions.sql у Supabase → SQL Editor.'

/** «Відкласти»: leaves a word out of practice until `until` (null brings it back). Needs migration 0005. */
export function useSuspendWord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ wordId, until }: { wordId: string; until: Date | null }) => {
      const { error } = await supabase.from('progress').update({ suspended_until: until?.toISOString() ?? null }).eq('word_id', wordId)
      if (error) throw isMissingColumn(error) ? new Error(MIGRATION_0005) : error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progress'] }),
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
      // Pronunciation goes along when the rows have it; before migration 0004 the batch is retried without it.
      let withPronunciation = true
      const row = (w: WordInput) => ({
        user_id: userId,
        term: w.term,
        translation: w.translation,
        definition: w.definition || null,
        example: w.example || null,
        ...(withPronunciation && { ipa: w.ipa || null, pos: w.pos || null, audio_url: w.audio_url || null }),
      })
      const hasPronunciation = withTags.some((w) => w.ipa || w.pos || w.audio_url)
      if (!hasPronunciation) withPronunciation = false
      for (const batch of chunks(withTags, CHUNK)) {
        let { data, error } = await supabase.from('words').insert(batch.map(row)).select('id, term')
        if (error && withPronunciation && isMissingColumn(error)) {
          withPronunciation = false
          ;({ data, error } = await supabase.from('words').insert(batch.map(row)).select('id, term'))
        }
        if (error || !data) throw error
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
    const { data, error } = await supabase.from('progress').select('*').order('id').range(from, from + PAGE - 1)
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
  /** Recall schedule (translation -> word), set when the word was practised in a recall exercise (migration 0005). */
  recall?: { ease_factor: number; interval_days: number; repetitions: number; due_at: Date }
  /** The wrong option picked, for finding words that get confused (migration 0005). */
  given?: string
  /** false: only the schedule changes, nothing is logged (a skipped exercise was not an answer). */
  log?: boolean
}

/** An answer queued for saving: the time it was given travels with it, so a reply sent later keeps its own time. */
export type QueuedReview = ReviewInput & { userId: string; at: string }

/** Key of the review mutation; its defaults (registered in lib/offline.ts) let a queued answer be sent after a reload. */
export const REVIEW_KEY = ['review'] as const

// Variables come back from IndexedDB as JSON, so a queued `due_at` may be a string rather than a Date.
const iso = (d: Date | string) => new Date(d).toISOString()

/** Writes one answer: updates the word's schedule (unless `next` and `recall` are omitted) and appends a review_log row. */
async function saveReview(r: QueuedReview) {
  if (r.next || r.recall) {
    const base = {
      ...(r.next && {
        ease_factor: r.next.ease_factor,
        interval_days: r.next.interval_days,
        repetitions: r.next.repetitions,
        due_at: iso(r.next.due_at),
      }),
      // last_reviewed marks the word as started, whichever direction was practised.
      last_reviewed: r.at,
      error_count: r.errorCount,
    }
    const recall = r.recall && {
      recall_ease_factor: r.recall.ease_factor,
      recall_interval_days: r.recall.interval_days,
      recall_repetitions: r.recall.repetitions,
      recall_due_at: iso(r.recall.due_at),
      recall_last_reviewed: r.at,
    }
    let { error } = await supabase.from('progress').update({ ...base, ...recall }).eq('word_id', r.wordId)
    // Before migration 0005 there are no recall columns: keep the recognition schedule only.
    if (error && recall && isMissingColumn(error)) ({ error } = await supabase.from('progress').update(base).eq('word_id', r.wordId))
    if (error) throw error
  }
  if (r.log === false) return
  const row: Record<string, unknown> = { word_id: r.wordId, user_id: r.userId, mode: r.mode, correct: r.correct, reviewed_at: r.at }
  let { error: logError } = await supabase.from('review_log').insert(r.given ? { ...row, given: r.given } : row)
  if (logError && r.given && isMissingColumn(logError)) ({ error: logError } = await supabase.from('review_log').insert(row))
  if (logError) throw logError
}

/**
 * Options of the review mutation. The cached progress and log change at once, so the Practice page is right
 * while the answers wait offline; the server copy is refetched once the last queued answer has been saved.
 */
export function reviewMutationDefaults(qc: QueryClient) {
  return {
    mutationFn: saveReview,
    scope: { id: ANSWER_SCOPE },
    retry: 2,
    onMutate: (r: QueuedReview) => {
      if (r.next || r.recall)
        qc.setQueryData<Progress[]>(['progress'], (old) =>
          old?.map((p) =>
            p.word_id !== r.wordId
              ? p
              : {
                  ...p,
                  ...(r.next && { ease_factor: r.next.ease_factor, interval_days: r.next.interval_days, repetitions: r.next.repetitions, due_at: iso(r.next.due_at) }),
                  ...(r.recall && {
                    recall_ease_factor: r.recall.ease_factor,
                    recall_interval_days: r.recall.interval_days,
                    recall_repetitions: r.recall.repetitions,
                    recall_due_at: iso(r.recall.due_at),
                    recall_last_reviewed: r.at,
                  }),
                  last_reviewed: r.at,
                  error_count: r.errorCount,
                },
          ),
        )
      if (r.log !== false) qc.setQueryData<ReviewRow[]>(['review_log'], (old) => old && [{ reviewed_at: r.at, mode: r.mode, correct: r.correct }, ...old])
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: REVIEW_KEY }) > 1) return
      qc.invalidateQueries({ queryKey: ['progress'] })
      qc.invalidateQueries({ queryKey: ['review_log'] })
    },
  }
}

/** Saves answers. Offline they wait in a queue that survives closing the app and are sent when the connection is back. */
export function useReviewWord(userId: string) {
  const m = useMutation<void, Error, QueuedReview>({ mutationKey: REVIEW_KEY })
  return { mutate: (r: ReviewInput) => m.mutate({ ...r, userId, at: new Date().toISOString() }) }
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
      const { error } = await supabase.from('tags').insert({ name: name.trim(), user_id: userId, color: builtInColor(name.trim()) ?? null })
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

/** Writes definitions / examples into words that had those fields empty (one UPDATE per word). */
export type WordFill = { id: string } & Partial<Pick<Word, 'definition' | 'example' | 'audio_url' | 'ipa' | 'pos'>>

/** Updates the given fields of several words in parallel (a batch of up to ~20). */
export async function updateWords(fills: WordFill[]) {
  const results = await Promise.all(fills.map(({ id, ...fields }) => supabase.from('words').update(fields).eq('id', id)))
  const failed = results.find((r) => r.error)
  if (failed?.error) throw isMissingColumn(failed.error) ? new Error(MIGRATION_0004) : failed.error
}

export function useFillDetails() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ fills, onProgress }: { fills: WordFill[]; onProgress?: (done: number, total: number) => void }) => {
      let done = 0
      // Small parallel batches keep ~1100 updates to about a minute without flooding the API.
      for (let i = 0; i < fills.length; i += 20) {
        const batch = fills.slice(i, i + 20)
        await updateWords(batch)
        done += batch.length
        onProgress?.(done, fills.length)
      }
      return done
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['words'] }),
  })
}

export interface AutoTagPlan {
  /** Tags to add to each word (existing links are kept). */
  links: { wordId: string; tagNames: string[] }[]
  /** Tags to delete afterwards (their links go with them). */
  removeTagIds: string[]
}

/** Applies suggested tags to many words at once: creates missing tags, adds links, optionally removes old tags. */
export function useAutoTag(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ plan, onProgress }: { plan: AutoTagPlan; onProgress?: (done: number, total: number) => void }) => {
      const names = [...new Set(plan.links.flatMap((l) => l.tagNames))]
      const ids = await ensureTags(userId, names)
      const idByName = new Map(names.map((n, i) => [n, ids[i]]))
      const rows = plan.links.flatMap((l) => l.tagNames.map((n) => ({ word_id: l.wordId, tag_id: idByName.get(n)! })))
      for (let i = 0; i < rows.length; i += 500) {
        // A word may already carry the tag: the duplicate row is skipped.
        const { error } = await supabase.from('word_tags').upsert(rows.slice(i, i + 500), { onConflict: 'word_id,tag_id', ignoreDuplicates: true })
        if (error) throw error
        onProgress?.(Math.min(i + 500, rows.length), rows.length)
      }
      if (plan.removeTagIds.length > 0) {
        const { error } = await supabase.from('tags').delete().in('id', plan.removeTagIds)
        if (error) throw error
      }
      return { tagged: plan.links.length, links: rows.length, removed: plan.removeTagIds.length }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
      qc.invalidateQueries({ queryKey: ['words'] })
    },
  })
}
