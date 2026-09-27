/**
 * Draft Ukrainian translations from MyMemory (free, no key, about 5000 characters a day per address).
 * Only the chosen word or phrase is sent, never the pasted text around it. The result is a suggestion the user checks.
 */

const cache = new Map<string, Promise<string[]>>()

const tidy = (s: string, source: string) => {
  // "(трішки збентежено)" -> "трішки збентежено": translation memories wrap notes and stage directions in brackets.
  const t = s
    .replace(/[()[\]]/g, '')
    .replace(/[.!?:;\s]+$/, '')
    .trim()
  // "Розгорнути" for "deploy": a lowercase word gets a lowercase translation.
  return source === source.toLowerCase() && t.length > 0 && !/\s/.test(source) ? t[0].toLowerCase() + t.slice(1) : t
}

async function fetchDrafts(text: string): Promise<string[]> {
  const res = await fetch(`https://api.mymemory.translated.net/get?langpair=en|uk&q=${encodeURIComponent(text)}`)
  if (!res.ok) throw new Error(`MyMemory: ${res.status}`)
  const json = (await res.json()) as {
    responseData?: { translatedText?: string }
    matches?: { translation: string; quality: number | string }[]
  }
  const main = json.responseData?.translatedText ?? ''
  // Alternatives from the translation memory: short ones only (a whole sentence is a usage, not a translation).
  const alternatives = (json.matches ?? []).filter((m) => Number(m.quality) > 0 && m.translation.split(' ').length <= 4).map((m) => m.translation)
  const all = [main, ...alternatives].map((t) => tidy(t, text)).filter((t) => t && !/[A-Za-z]{3}/.test(t))
  return [...new Map(all.map((t) => [t.toLowerCase(), t])).values()].slice(0, 4)
}

/** Up to four draft translations, best first; empty when nothing usable came back. */
export function draftTranslations(text: string): Promise<string[]> {
  const key = text.trim().toLowerCase()
  let hit = cache.get(key)
  if (!hit) {
    hit = fetchDrafts(text.trim())
    hit.catch(() => cache.delete(key))
    cache.set(key, hit)
  }
  return hit
}
