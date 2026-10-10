/** Ukrainian plural form: plural(1, WORD) → «слово», plural(3, WORD) → «слова», plural(5, WORD) → «слів». */
export function plural(n: number, [one, few, many]: readonly [string, string, string]): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/** "5 слів", "1 слово". */
export const count = (n: number, forms: readonly [string, string, string]) => `${n} ${plural(n, forms)}`

export const WORD = ['слово', 'слова', 'слів'] as const
/** After «у», «для», «до», «з»: «для 1 слова», «для 5 слів». */
export const WORD_GEN = ['слова', 'слів', 'слів'] as const
export const DAY = ['день', 'дні', 'днів'] as const
export const CARD = ['картка', 'картки', 'карток'] as const
export const REVIEW = ['повторення', 'повторення', 'повторень'] as const
export const QUESTION = ['запитання', 'запитання', 'запитань'] as const
export const NEW_QUESTION = ['нове запитання', 'нові запитання', 'нових запитань'] as const
export const EXERCISE = ['вправа', 'вправи', 'вправ'] as const
/** After «з», «із»: «з 1 вправи», «з 2 вправ». */
export const EXERCISE_GEN = ['вправи', 'вправ', 'вправ'] as const
export const ARTICLE = ['стаття', 'статті', 'статей'] as const
export const TAG = ['тег', 'теги', 'тегів'] as const
export const ANSWER = ['відповідь', 'відповіді', 'відповідей'] as const
/** After «з»: «з 1 тексту», «з 4 текстів». */
export const TEXT_GEN = ['тексту', 'текстів', 'текстів'] as const
