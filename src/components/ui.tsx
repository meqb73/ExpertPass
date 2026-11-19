import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { categoryLabel } from '@/lib/constants'
import type { SessionPhase } from '@/lib/types'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin', className ?? 'h-4 w-4')} aria-hidden />
}

export function CategoryBadge({ category, className }: { category: number; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand',
        className,
      )}
    >
      {categoryLabel(category)}
    </span>
  )
}

const PHASE_STYLE: Record<SessionPhase, string> = {
  upcoming: 'bg-brand/15 text-brand',
  live: 'bg-good/15 text-good',
  ended: 'bg-muted text-dim',
  cancelled: 'bg-bad/15 text-bad',
}
const PHASE_LABEL: Record<SessionPhase, string> = { upcoming: 'Upcoming', live: 'Live now', ended: 'Ended', cancelled: 'Cancelled' }

const PHASE_DOT: Record<SessionPhase, string> = {
  upcoming: 'bg-sky-300',
  live: 'bg-emerald-400',
  ended: 'bg-slate-400',
  cancelled: 'bg-rose-400',
}

/** `overlay` renders a dark chip that stays legible on top of cover images. */
export function PhasePill({ phase, overlay }: { phase: SessionPhase; overlay?: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        overlay ? 'bg-black/65 text-white backdrop-blur' : PHASE_STYLE[phase],
      )}
    >
      {(phase === 'live' || overlay) && (
        <span className={clsx('h-1.5 w-1.5 rounded-full', overlay ? PHASE_DOT[phase] : 'bg-good', phase === 'live' && 'animate-pulse')} />
      )}
      {PHASE_LABEL[phase]}
    </span>
  )
}

export function RefundBadge({ state, amount }: { state: 'refunded' | 'pending' | 'partial'; amount?: string }) {
  const style =
    state === 'refunded' ? 'bg-good/15 text-good' : state === 'partial' ? 'bg-warn/15 text-warn' : 'bg-warn/15 text-warn'
  const label =
    state === 'refunded' ? `Refunded${amount ? ` ${amount} USDC` : ''}` : state === 'partial' ? 'Refunding' : 'Refund pending'
  return <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', style)}>{label}</span>
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-2xl border border-line bg-card shadow-card', className)}>{children}</div>
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode }) {
  return (
    <Card className="relative overflow-hidden p-5 sm:p-6">
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent" aria-hidden />
      <div className="flex items-center justify-between">
        <p className="eyebrow !text-dim">{label}</p>
        {icon && <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-brand">{icon}</span>}
      </div>{' '}
      <p className="display num mt-3 text-4xl font-bold text-ink">{value}</p>{' '}
      {hint && <p className="mt-1.5 text-sm text-dim">{hint}</p>}
    </Card>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="glass flex flex-col items-center rounded-3xl !border-dashed px-6 py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/25 to-brand2/10 text-brand ring-1 ring-brand/30">{icon}</div>
      <h3 className="display text-lg font-semibold">{title}</h3>{' '}
      <p className="mt-2 max-w-sm text-pretty text-sm leading-relaxed text-dim">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-3xl border border-line bg-card">
      <div className="aspect-video bg-muted" />
      <div className="space-y-3 p-6">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
        <div className="h-3 w-full rounded bg-muted" />
      </div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-ink">{label}</span>{' '}
      {children}{' '}
      {hint && <span className="mt-2 block text-xs leading-relaxed text-dim">{hint}</span>}
    </label>
  )
}
