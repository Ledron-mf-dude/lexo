import type { ReactNode } from 'react'

/** Explanation text with *English examples* in italics, the way the articles write them. */
export default function RichText({ text }: { text: string }): ReactNode {
  return text.split(/(\*[^*]+\*)/).map((part, i) =>
    /^\*[^*]+\*$/.test(part) ? (
      <em key={i} className="text-white/85">
        {part.slice(1, -1)}
      </em>
    ) : (
      part
    ),
  )
}
