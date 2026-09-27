import { useQuery } from '@tanstack/react-query'
import type { ReviewRow } from './stats'
import { supabase } from './supabase'

const PAGE = 1000
export const LOG_DAYS = 90

async function fetchReviewLog(): Promise<ReviewRow[]> {
  const since = new Date(Date.now() - LOG_DAYS * 86_400_000).toISOString()
  const rows: ReviewRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('review_log')
      .select('reviewed_at, mode, correct')
      .gte('reviewed_at', since)
      .order('reviewed_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data as ReviewRow[]))
    if (data.length < PAGE) return rows
  }
}

export interface Confusion {
  word_id: string
  mode: string
  given: string
}

/** Wrong options picked in the last 90 days (migration 0005). Before the migration the query fails and there is no data. */
async function fetchConfusions(): Promise<Confusion[]> {
  const since = new Date(Date.now() - LOG_DAYS * 86_400_000).toISOString()
  const { data, error } = await supabase.from('review_log').select('word_id, mode, given').not('given', 'is', null).gte('reviewed_at', since).limit(2000)
  if (error) throw error
  return data as Confusion[]
}

export function useConfusions() {
  return useQuery({ queryKey: ['review_log', 'confusions'], queryFn: fetchConfusions, retry: false, refetchOnWindowFocus: false })
}

/** Word reviews of the last 90 days (enough for every chart on the statistics page). */
export function useReviewLog() {
  return useQuery({ queryKey: ['review_log'], queryFn: fetchReviewLog, refetchOnWindowFocus: false })
}
