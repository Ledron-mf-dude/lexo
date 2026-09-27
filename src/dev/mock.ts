import { BUILT_IN } from '../lib/tagTaxonomy'

// Local-only preview data: open http://localhost:5173/lexo/?mock=1 in `npm run dev`. Never active in production builds.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
  const ref = new URL(import.meta.env.VITE_SUPABASE_URL as string).hostname.split('.')[0]
  const user = { id: 'u-mock', aud: 'authenticated', role: 'authenticated', email: 'demo@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  localStorage.setItem(
    `sb-${ref}-auth-token`,
    JSON.stringify({ access_token: 'mock', refresh_token: 'mock', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user }),
  )

  const DAY = 86_400_000
  const base = [
    ['get up', 'вставати', 'to rise from bed', 'I usually get up at seven o’clock in the morning.'],
    ['look forward to', 'з нетерпінням чекати', 'to be excited about something in the future', 'I am looking forward to meeting you next week.'],
    ['carry out', 'виконувати', 'to do and complete a task', 'The team will carry out the experiment tomorrow.'],
    ['come across', 'натрапити', 'to find or meet by chance', 'I came across an old photo in the drawer.'],
    ['deal with', 'мати справу з', 'to take action about a problem', 'She knows how to deal with difficult customers.'],
    ['give up', 'здаватися', 'to stop trying', 'Never give up on your dreams, whatever happens.'],
    ['ubiquitous', 'всюдисущий', 'present everywhere at the same time', 'Smartphones have become ubiquitous in modern life.'],
    ['reluctant', 'неохочий', 'unwilling and hesitant', 'He was reluctant to share the details with the whole team.'],
    ['thoroughly', 'ретельно', 'completely and with great attention to detail', 'Please check the document thoroughly before sending it.'],
    ['concern', 'занепокоєння', 'a feeling of worry', 'There is growing concern about the rising costs.'],
  ]
  const tags = [
    { id: 't1', user_id: 'u-mock', name: 'phrasal verbs', color: '#7c9bff' },
    { id: 't2', user_id: 'u-mock', name: 'work', color: '#5eead4' },
    { id: 't3', user_id: 'u-mock', name: 'unit 12', color: '#fbbf24' },
  ]
  const builtIn = Object.values(BUILT_IN).map((t, i) => ({ id: `b${i}`, user_id: 'u-mock', name: t.name, color: t.color }))
  tags.push(...builtIn)
  const words = Array.from({ length: 60 }, (_, i) => {
    const b = base[i % base.length]
    const n = i >= base.length ? ` ${Math.floor(i / base.length) + 1}` : ''
    return {
      id: `w${i}`,
      user_id: 'u-mock',
      term: b[0] + n,
      translation: b[1],
      definition: b[2],
      example: b[3],
      audio_url: null,
      created_at: new Date(Date.now() - i * 3600_000).toISOString(),
      // One personal tag plus one or two built-in topic tags, so the tag picker has groups to show.
      word_tags: [{ tag_id: tags[i % 3].id }, { tag_id: builtIn[i % builtIn.length].id }, ...(i % 3 === 0 ? [{ tag_id: builtIn[(i * 7) % builtIn.length].id }] : [])],
    }
  })
  const progress = words.map((w, i) => ({
    id: `p${i}`,
    word_id: w.id,
    user_id: 'u-mock',
    ease_factor: 2.5,
    interval_days: i % 4 === 0 ? 0 : (i % 5) * 6,
    repetitions: i % 4 === 0 ? 0 : i % 5,
    due_at: new Date(Date.now() + (i % 7 - 2) * DAY).toISOString(),
    last_reviewed: i % 4 === 0 ? null : new Date(Date.now() - DAY).toISOString(),
    error_count: i % 9 === 0 ? 3 : 0,
  }))
  const modes = ['choice', 'typing', 'flashcard', 'scramble']
  const review_log = Array.from({ length: 400 }, (_, i) => ({
    reviewed_at: new Date(Date.now() - Math.floor(i / 8) * DAY - (i % 8) * 600_000).toISOString(),
    mode: modes[i % 4],
    correct: i % 5 !== 0,
  }))

  const tables: Record<string, unknown[]> = { words, tags, progress, review_log, exercise_log: [] }
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    // Relative URLs (app assets, the sql.js wasm) are resolved against the page, as fetch itself does.
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (url.hostname.includes('supabase.co') && url.pathname.startsWith('/rest/v1/')) {
      const rows = tables[url.pathname.split('/').pop()!] ?? []
      const body = method === 'GET' ? rows : []
      return new Response(JSON.stringify(body), { status: method === 'GET' ? 200 : 201, headers: { 'content-type': 'application/json' } })
    }
    return realFetch(input, init)
  }
}
