export interface Word {
  id: string
  user_id: string
  term: string
  translation: string
  definition: string | null
  example: string | null
  audio_url: string | null
  /** Transcription and part of speech, from Wiktionary (migration 0004; absent before it is run). */
  ipa?: string | null
  pos?: string | null
  created_at: string
}

export interface Tag {
  id: string
  user_id: string
  name: string
  color: string | null
}

export interface WordTag {
  word_id: string
  tag_id: string
}

export interface Progress {
  id: string
  word_id: string
  user_id: string
  ease_factor: number
  interval_days: number
  repetitions: number
  due_at: string
  last_reviewed: string | null
  error_count: number
}

export type PracticeMode =
  | 'flashcard'
  | 'translation'
  | 'typing'
  | 'scramble'
  | 'definition'
  | 'choice'
  | 'gaps'
  | 'cloze'
  | 'speed'
  | 'match'
  | 'listen'
  | 'speak'

export interface ReviewLog {
  id: string
  word_id: string
  user_id: string
  mode: PracticeMode
  correct: boolean
  reviewed_at: string
}
