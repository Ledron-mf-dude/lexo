import { normalizeTerm, type Article } from './grammar'
import type { WordWithTags } from './queries'
import type { Tag } from '../types'

// Grammar words that show up in every article; a vocabulary entry equal to one of them says nothing about the topic.
const FUNCTION_WORDS = new Set([
  'the', 'and', 'but', 'because', 'when', 'than', 'then', 'also', 'for', 'with', 'from', 'not', 'yes', 'you', 'she', 'they', 'his', 'her', 'its',
  'will', 'would', 'can', 'could', 'may', 'might', 'must', 'should', 'shall', 'does', 'did', 'have', 'has', 'had', 'are', 'was', 'were', 'been',
  'past', 'present', 'future', 'perfect', 'simple', 'continuous', 'form', 'verb', 'noun',
])

/** Words of the user's vocabulary that belong to an article: tagged with its `wordTags`, or equal to a term the article teaches. */
export function wordsForArticle(article: Article, words: WordWithTags[], tags: Tag[]): WordWithTags[] {
  const tagIds = new Set(tags.filter((t) => article.wordTags.includes(t.name)).map((t) => t.id))
  const terms = new Set(article.terms.filter((t) => !FUNCTION_WORDS.has(t)))
  return words.filter((w) => w.tagIds.some((id) => tagIds.has(id)) || terms.has(normalizeTerm(w.term)))
}

/** Below this many matches a "practise these words" button is not worth showing. */
export const MIN_WORDS = 3
