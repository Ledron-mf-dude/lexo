import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

export interface LogRow {
  article_slug: string
  question_id: string
  correct: boolean
  answered_at: string
}

const PAGE = 1000

async function fetchLog(): Promise<LogRow[]> {
  const rows: LogRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('exercise_log')
      .select('article_slug, question_id, correct, answered_at')
      .order('answered_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data as LogRow[]))
    if (data.length < PAGE) return rows
  }
}

/** All answers, newest first. If the table has not been created yet the query fails and callers treat it as "no data". */
export function useExerciseLog() {
  return useQuery({ queryKey: ['exercise_log'], queryFn: fetchLog, retry: false, refetchOnWindowFocus: false })
}

/** A grammar answer queued for saving, with the time it was given. */
export interface QueuedAnswer {
  slug: string
  questionId: string
  correct: boolean
  userId: string
  at: string
}

/** Scope shared by word reviews and grammar answers: one queue, sent in the order the answers were given. */
export const ANSWER_SCOPE = 'lexo-answers'

/** Key of the answer mutation; its defaults are registered in lib/offline.ts so a queued answer survives a reload. */
export const ANSWER_KEY = ['exercise_answer'] as const

export function answerMutationDefaults(qc: QueryClient) {
  return {
    mutationFn: async (a: QueuedAnswer) => {
      const { error } = await supabase
        .from('exercise_log')
        .insert({ user_id: a.userId, article_slug: a.slug, question_id: a.questionId, correct: a.correct, answered_at: a.at })
      if (error) throw error
    },
    scope: { id: ANSWER_SCOPE },
    retry: 2,
    // The answer goes into the cached log at once (newest first), so progress and «new» counts are right without refetching every page.
    onMutate: (a: QueuedAnswer) =>
      qc.setQueryData<LogRow[]>(['exercise_log'], (old) => old && [{ article_slug: a.slug, question_id: a.questionId, correct: a.correct, answered_at: a.at }, ...old]),
    onError: () => qc.invalidateQueries({ queryKey: ['exercise_log'] }),
  }
}

/** Logs grammar answers; offline they wait in the queue (see useReviewWord). */
export function useLogAnswer(userId: string) {
  const m = useMutation<void, Error, QueuedAnswer>({ mutationKey: ANSWER_KEY })
  return { mutate: (a: { slug: string; questionId: string; correct: boolean }) => m.mutate({ ...a, userId, at: new Date().toISOString() }) }
}

export interface TopicStats {
  /** Questions whose latest answer is correct. */
  mastered: number
  /** Questions answered at least once. */
  attempted: number
  /** Ids of questions whose latest answer is wrong. */
  mistakes: string[]
}

/** Latest answer per question decides: a question is "mastered" once its most recent attempt was right. */
export function topicStats(log: LogRow[] | undefined, slug: string, validIds: Set<string>): TopicStats {
  const latest = new Map<string, boolean>()
  for (const row of log ?? []) {
    if (row.article_slug === slug && validIds.has(row.question_id) && !latest.has(row.question_id)) latest.set(row.question_id, row.correct)
  }
  const mistakes = [...latest].filter(([, ok]) => !ok).map(([id]) => id)
  return { mastered: latest.size - mistakes.length, attempted: latest.size, mistakes }
}

export interface LastAnswer {
  at: number
  correct: boolean
}

/** The latest answer to every question ever answered, keyed `slug/id`; a question missing from it was never shown. */
export function answerHistory(log: LogRow[] | undefined): Map<string, LastAnswer> {
  const out = new Map<string, LastAnswer>()
  for (const row of log ?? []) {
    const key = `${row.article_slug}/${row.question_id}`
    if (!out.has(key)) out.set(key, { at: Date.parse(row.answered_at), correct: row.correct })
  }
  return out
}

/** Every question, across all topics, whose latest answer is wrong (newest mistakes first). */
export function allMistakes(log: LogRow[] | undefined, ids: Map<string, string[]>): { slug: string; id: string }[] {
  const seen = new Set<string>()
  const out: { slug: string; id: string }[] = []
  for (const row of log ?? []) {
    const key = `${row.article_slug}/${row.question_id}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!row.correct && ids.get(row.article_slug)?.includes(row.question_id)) out.push({ slug: row.article_slug, id: row.question_id })
  }
  return out
}
