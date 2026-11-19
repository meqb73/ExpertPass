import { ArrowRight, CalendarDays, Clock } from 'lucide-react'
import clsx from 'clsx'
import { Link } from '@/lib/router'
import { Cover } from './Cover'
import { ExpertAvatar } from './ExpertAvatar'
import { PhasePill } from './ui'
import { categoryLabel, CATEGORY_HUE } from '@/lib/constants'
import { formatDateTime, formatDuration, formatPrice, shortAddress } from '@/lib/format'
import { excerpt } from '@/lib/richtext'
import { remaining, sessionPhase, type Session, type SessionMeta } from '@/lib/types'

interface Props {
  session: Session
  expertName?: string
  meta?: SessionMeta
  view: 'grid' | 'list'
  now: number
  owned?: boolean
  expertAvatar?: number | null
}

function CategoryChip({ category }: { category: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(${CATEGORY_HUE[category] ?? 200} 85% 65%)` }} aria-hidden />
      {categoryLabel(category)}
    </span>
  )
}

/** Sits above the card's stretched link so the expert name is its own link to their profile. */
function ExpertLink({ address, name, avatar, className }: { address: string; name: string; avatar?: number | null; className?: string }) {
  return (
    <Link to={`/expert/${address}`} className={clsx('relative z-20 inline-flex min-w-0 items-center gap-2.5 font-medium text-ink-2 transition-colors hover:text-brand', className)}>
      <ExpertAvatar name={name} address={address} version={avatar} size={28} />{' '}
      <span className="truncate">{name}</span>
    </Link>
  )
}

function CardLink({ id, title }: { id: bigint; title: string }) {
  return (
    <Link to={`/session/${id}`} className="absolute inset-0 z-10 rounded-3xl" aria-label={title}>
      <span className="sr-only">{title}</span>
    </Link>
  )
}

export function SessionCard({ session: s, expertName, meta, view, now, owned, expertAvatar }: Props) {
  const phase = sessionPhase(s, now)
  const left = remaining(s)
  const soldOut = left === 0
  const expert = expertName || shortAddress(s.expert)
  const pct = Math.min(100, Math.round((s.sold / s.supply) * 100))
  const lowStock = !soldOut && left <= Math.max(3, Math.ceil(s.supply * 0.15))
  const cta = owned
    ? 'View ticket'
    : phase === 'cancelled'
      ? 'Cancelled'
      : phase !== 'upcoming'
        ? 'View session'
        : soldOut
          ? 'Sold out'
          : s.price === 0n
            ? 'Get free ticket'
            : 'Get ticket'
  const ctaMuted = !owned && (phase === 'cancelled' || soldOut || phase !== 'upcoming')

  const stock = (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className={clsx('font-semibold', soldOut ? 'text-bad' : lowStock ? 'text-warn' : 'text-ink-2')}>
          {soldOut ? 'Sold out' : `${left} ticket${left === 1 ? '' : 's'} left`}
        </span>
        <span className="num text-dim">
          {s.sold}/{s.supply}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={clsx('h-full rounded-full', soldOut ? 'bg-bad' : lowStock ? 'bg-warn' : 'bg-gradient-to-r from-brand to-brand2')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )

  const price = (
    <div className="shrink-0">
      <p className="display num text-2xl font-bold leading-none">{formatPrice(s.price, false)}</p>
      {s.price > 0n && <p className="mt-1 text-xs font-medium text-dim">USDC</p>}
    </div>
  )

  const button = (
    <span className={clsx('btn btn-sm !min-h-[40px] shrink-0', ctaMuted ? 'btn-ghost' : 'btn-primary')}>
      {cta}
      {!ctaMuted && <ArrowRight size={15} aria-hidden />}
    </span>
  )

  if (view === 'list') {
    return (
      <div className="group card-hover relative flex flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-card sm:flex-row">
        <CardLink id={s.id} title={s.title} />
        <div className="relative aspect-video shrink-0 overflow-hidden sm:aspect-auto sm:min-h-[180px] sm:w-72">
          <div className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-105">
            <Cover category={s.category} url={meta?.cover} iconSize={36} />
          </div>
          <div className="absolute left-3 top-3">
            <CategoryChip category={s.category} />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <PhasePill phase={phase} />
              {owned && <span className="rounded-full bg-good/15 px-2.5 py-1 text-xs font-semibold text-good">Ticket owned</span>}
            </div>{' '}
            <h3 className="display mt-3 line-clamp-2 text-xl font-bold leading-snug transition-colors group-hover:text-brand">{s.title}</h3>{' '}
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-dim">{excerpt(s.description, 160) || 'Live session. Ticket holders get the event link on the session page.'}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-dim">
              <ExpertLink address={s.expert} name={expert} avatar={expertAvatar} />{' '}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={14} aria-hidden /> {formatDateTime(s.startTime)}
              </span>
            </div>
          </div>
          <div className="flex w-full flex-col gap-4 sm:w-56">
            {stock}
            <div className="flex items-center justify-between gap-3">
              {price}
              {button}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group card-hover relative flex flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-card">
      <CardLink id={s.id} title={s.title} />
      <div className="relative aspect-video overflow-hidden">
        <div className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-105">
          <Cover category={s.category} url={meta?.cover} iconSize={52} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/50 to-transparent" aria-hidden />
        <div className="absolute left-4 top-4">
          <CategoryChip category={s.category} />
        </div>
        <div className="absolute right-4 top-4">
          <PhasePill phase={phase} overlay />
        </div>
        {owned && <div className="absolute bottom-4 left-4 rounded-full bg-good px-3 py-1.5 text-xs font-bold text-black">Ticket owned</div>}
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="display line-clamp-2 min-h-[3.4rem] text-xl font-bold leading-snug transition-colors group-hover:text-brand">{s.title}</h3>{' '}
        <p className="mt-2.5 line-clamp-2 min-h-[2.9rem] text-sm leading-relaxed text-dim">
          {excerpt(s.description, 140) || 'Live session. Ticket holders get the event link on the session page.'}
        </p>
        <div className="mt-4 flex text-sm">
          <ExpertLink address={s.expert} name={expert} avatar={expertAvatar} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-dim">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={14} aria-hidden /> {formatDateTime(s.startTime)}
          </span>{' '}
          <span className="inline-flex items-center gap-1.5">
            <Clock size={14} aria-hidden /> {formatDuration(s.duration)}
          </span>
        </div>

        <div className="mt-auto pt-6">
          {stock}
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-5">
            {price}
            {button}
          </div>
        </div>
      </div>
    </div>
  )
}
