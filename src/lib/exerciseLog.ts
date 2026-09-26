import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

export function useLogAnswer(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { slug: string; questionId: string; correct: boolean }) => {
      const { error } = await supabase
        .from('exercise_log')
        .insert({ user_id: userId, article_slug: a.slug, question_id: a.questionId, correct: a.correct })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercise_log'] }),
  })
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

/** Every question, across all topics, whose latest answer is wrong (newest mistakes first). */
export function allMistakes(log: LogRow[] | undefined, banks: Map<string, { id: string }[]>): { slug: string; id: string }[] {
  const seen = new Set<string>()
  const out: { slug: string; id: string }[] = []
  for (const row of log ?? []) {
    const key = `${row.article_slug}/${row.question_id}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!row.correct && banks.get(row.article_slug)?.some((q) => q.id === row.question_id)) out.push({ slug: row.article_slug, id: row.question_id })
  }
  return out
}
