import { Fragment, type ReactNode } from 'react'

/**
 * A deliberately small Markdown subset (headings, bold, italic, code, links, lists, quotes).
 * Rendered to React elements, never as raw HTML, so descriptions written by anyone are safe to show.
 */

const SAFE_URL = /^(https?:\/\/|mailto:)/i

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g
  let last = 0
  let i = 0
  for (const m of text.matchAll(pattern)) {
    const start = m.index ?? 0
    if (start > last) out.push(text.slice(last, start))
    const token = m[0]
    const key = `${keyPrefix}-${i++}`
    if (token.startsWith('**')) out.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('`')) out.push(<code key={key}>{token.slice(1, -1)}</code>)
    else if (token.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)
      if (mm && SAFE_URL.test(mm[2])) {
        out.push(
          <a key={key} href={mm[2]} target="_blank" rel="noopener noreferrer">
            {mm[1]}
          </a>,
        )
      } else out.push(token)
    } else out.push(<em key={key}>{token.slice(1, -1)}</em>)
    last = start + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function RichText({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let k = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }
    const key = `b${k++}`
    if (/^##\s+/.test(line)) {
      blocks.push(<h2 key={key}>{inline(line.replace(/^##\s+/, ''), key)}</h2>)
      i++
    } else if (/^###\s+/.test(line)) {
      blocks.push(<h3 key={key}>{inline(line.replace(/^###\s+/, ''), key)}</h3>)
      i++
    } else if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) items.push((lines[i++]).replace(/^[-*]\s+/, ''))
      blocks.push(
        <ul key={key}>
          {items.map((t, n) => (
            <li key={n}>{inline(t, `${key}-${n}`)}</li>
          ))}
        </ul>,
      )
    } else if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) items.push((lines[i++]).replace(/^\d+\.\s+/, ''))
      blocks.push(
        <ol key={key}>
          {items.map((t, n) => (
            <li key={n}>{inline(t, `${key}-${n}`)}</li>
          ))}
        </ol>,
      )
    } else if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push((lines[i++]).replace(/^>\s?/, ''))
      blocks.push(<blockquote key={key}>{inline(quote.join(' '), key)}</blockquote>)
    } else {
      const para: string[] = []
      while (
        i < lines.length &&
        (lines[i]).trim() !== '' &&
        !/^(##|###|[-*]\s|\d+\.\s|>)/.test(lines[i])
      ) {
        para.push(lines[i++])
      }
      blocks.push(
        <p key={key}>
          {para.map((t, n) => (
            <Fragment key={n}>
              {n > 0 && <br />}
              {inline(t, `${key}-${n}`)}
            </Fragment>
          ))}
        </p>,
      )
    }
  }
  return <div className="rich text-ink-2">{blocks}</div>
}

/** Plain-text excerpt for cards. */
export function excerpt(source: string, max = 140): string {
  // Prefer the first real paragraph over headings and list markers.
  const lines = source.split('\n').map((l) => l.trim())
  const para = lines.find((l) => l !== '' && !/^(#|[-*]\s|\d+\.\s|>)/.test(l))
  const plain = (para ?? source)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*`]/g, '')
    .replace(/^\s*[-\d.]+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain
}
