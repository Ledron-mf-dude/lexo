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

/** Word reviews of the last 90 days (enough for every chart on the statistics page). */
export function useReviewLog() {
  return useQuery({ queryKey: ['review_log'], queryFn: fetchReviewLog, refetchOnWindowFocus: false })
}
