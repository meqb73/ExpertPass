import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

/** Inline explanation for one feature that needs the offchain API. */
export function FeatureUnavailable({ title, children, className = '' }: { title: string; children?: ReactNode; className?: string }) {
  return (
    <div role="note" className={`flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm leading-relaxed ${className}`}>
      <Info size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
      <div>
        <p className="font-semibold text-ink">{title}</p>
        {children && <p className="mt-1 text-ink-2">{children}</p>}
      </div>
    </div>
  )
}
