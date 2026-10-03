import { Children, type ComponentProps, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'
import { headingId, textOf } from '../lib/articleText'

// Links to other articles are app-internal routes; everything else opens normally.
function ArticleLink({ href = '', children }: ComponentProps<'a'>) {
  return href.startsWith('/grammar/') ? (
    <Link to={href} className="text-accent no-underline hover:underline">
      {children}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

// Section headings get ids so the table of contents can scroll to them (HashRouter owns the URL hash, so no #anchors).
function Heading({ children }: ComponentProps<'h2'>) {
  return (
    <h2 id={headingId(textOf(children))} className="scroll-mt-4">
      {children}
    </h2>
  )
}

// A "Типові помилки" list item: "✗ wrong → ✓ right" gets coloured marks.
function ListItem({ children }: ComponentProps<'li'>) {
  if (!textOf(children).startsWith('✗')) return <li>{children}</li>
  const mark = (node: ReactNode, key: number): ReactNode =>
    typeof node === 'string'
      ? node.split(/([✗✓])/).map((part, i) =>
          part === '✗' ? (
            <span key={`${key}-${i}`} className="font-medium text-bad">✗</span>
          ) : part === '✓' ? (
            <span key={`${key}-${i}`} className="font-medium text-good">✓</span>
          ) : (
            part
          ),
        )
      : node
  return <li className="mistake list-none">{Children.toArray(children).map(mark)}</li>
}

// Wide tables scroll inside the card on a phone instead of stretching the whole page.
function ScrollTable({ children }: ComponentProps<'table'>) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table>{children}</table>
    </div>
  )
}

const components = { a: ArticleLink, table: ScrollTable, h2: Heading, li: ListItem }

/** An article body (or a part of it) as rendered on the article page: internal links, scrolling tables, mistake cards. */
export default function ArticleMarkdown({ body }: { body: string }) {
  return (
    <div className="glass prose prose-invert max-w-none rounded-3xl p-4 break-words sm:p-6 prose-headings:font-normal prose-strong:text-white prose-code:text-accent-alt prose-code:before:content-none prose-code:after:content-none prose-th:text-left">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
        {body}
      </Markdown>
    </div>
  )
}
