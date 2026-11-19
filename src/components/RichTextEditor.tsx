import { useRef, useState } from 'react'
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Quote } from 'lucide-react'
import clsx from 'clsx'
import { RichText } from '@/lib/richtext'

export const MAX_DESCRIPTION_BYTES = 4000
export const byteLength = (s: string) => new TextEncoder().encode(s).length

interface Props {
  value: string
  onChange: (v: string) => void
  id?: string
}

type Action = { label: string; icon: typeof Bold; wrap?: [string, string]; prefix?: string; placeholder: string }

const ACTIONS: Action[] = [
  { label: 'Bold', icon: Bold, wrap: ['**', '**'], placeholder: 'bold text' },
  { label: 'Italic', icon: Italic, wrap: ['*', '*'], placeholder: 'italic text' },
  { label: 'Heading', icon: Heading2, prefix: '## ', placeholder: 'Heading' },
  { label: 'Bulleted list', icon: List, prefix: '- ', placeholder: 'List item' },
  { label: 'Numbered list', icon: ListOrdered, prefix: '1. ', placeholder: 'List item' },
  { label: 'Quote', icon: Quote, prefix: '> ', placeholder: 'Quote' },
  { label: 'Link', icon: Link2, wrap: ['[', '](https://)'], placeholder: 'link text' },
]

/** Markdown-based rich text editor with a toolbar and live preview. */
export function RichTextEditor({ value, onChange, id }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const bytes = byteLength(value)

  const apply = (a: Action) => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end) || a.placeholder
    let next: string
    let caretStart: number
    let caretEnd: number
    if (a.wrap) {
      next = value.slice(0, start) + a.wrap[0] + selected + a.wrap[1] + value.slice(end)
      caretStart = start + a.wrap[0].length
      caretEnd = caretStart + selected.length
    } else {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const prefix = a.prefix ?? ''
      next = value.slice(0, lineStart) + prefix + value.slice(lineStart, start) + selected + value.slice(end)
      caretStart = lineStart + prefix.length + (start - lineStart)
      caretEnd = caretStart + selected.length
    }
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caretStart, caretEnd)
    })
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-canvas focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgb(var(--brand)/0.25)]">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-muted/60 p-1.5">
        {ACTIONS.map((a) => (
          <button
            key={a.label}
            type="button"
            title={a.label}
            aria-label={a.label}
            disabled={tab === 'preview'}
            onClick={() => apply(a)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-card disabled:opacity-40"
          >
            <a.icon size={16} />
          </button>
        ))}
        <div className="ml-auto flex rounded-lg bg-canvas p-0.5 text-xs font-semibold">
          {(['write', 'preview'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={clsx('rounded-md px-3 py-1.5 capitalize', tab === t ? 'bg-card text-ink shadow-sm' : 'text-dim')}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {tab === 'write' ? (
        <textarea
          id={id}
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={9}
          placeholder="What will learners get from this session? Use the toolbar for headings, lists, and links."
          className="block w-full resize-y bg-transparent p-3.5 text-[15px] leading-relaxed text-ink outline-none placeholder:text-dim/80"
        />
      ) : (
        <div className="min-h-[14rem] p-3.5">
          {value.trim() ? <RichText source={value} /> : <p className="text-sm text-dim">Nothing to preview yet.</p>}
        </div>
      )}
      <div className="flex justify-end border-t border-line px-3 py-1.5 text-xs">
        <span className={clsx('num', bytes > MAX_DESCRIPTION_BYTES ? 'font-semibold text-bad' : 'text-dim')}>
          {bytes} / {MAX_DESCRIPTION_BYTES}
        </span>
      </div>
    </div>
  )
}
