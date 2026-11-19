import { useMemo, useState } from 'react'
import { LayoutGrid, List, SearchX, Sparkles, Ticket, Users, Video, Wallet } from 'lucide-react'
import clsx from 'clsx'
import { CardSkeleton, EmptyState } from '@/components/ui'
import { SessionCard } from '@/components/SessionCard'
import { CATEGORIES } from '@/lib/constants'
import { useAvatars, useExperts, useMyBalances, useSessionMeta, useSessions } from '@/hooks/useExpertPass'
import { Link, setExploreParams, useNow, useQueryParam } from '@/lib/router'
import { sessionPhase, type Session } from '@/lib/types'

type PriceFilter = 'any' | 'free' | 'u10' | 'u50' | 'o50'
type DateFilter = 'any' | 'today' | 'week' | 'month'
type Sort = 'soonest' | 'newest' | 'priceAsc' | 'priceDesc'

const PRICE_OPTIONS: { id: PriceFilter; label: string }[] = [
  { id: 'any', label: 'Any price' },
  { id: 'free', label: 'Free' },
  { id: 'u10', label: 'Under 10 USDC' },
  { id: 'u50', label: 'Under 50 USDC' },
  { id: 'o50', label: '50 USDC and up' },
]

const USDC = 1_000_000n

function priceOk(s: Session, f: PriceFilter) {
  if (f === 'free') return s.price === 0n
  if (f === 'u10') return s.price < 10n * USDC
  if (f === 'u50') return s.price < 50n * USDC
  if (f === 'o50') return s.price >= 50n * USDC
  return true
}

function dateOk(s: Session, f: DateFilter, now: number) {
  if (f === 'any') return true
  const start = Number(s.startTime)
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  const limit =
    f === 'today' ? Math.floor(endOfToday.getTime() / 1000) : f === 'week' ? now + 7 * 86400 : now + 30 * 86400
  return start <= limit && start + s.duration >= now
}

export function Home() {
  const now = useNow()
  const { sessions, isLoading, isError } = useSessions()
  const ids = useMemo(() => sessions.map((s) => s.id), [sessions])
  const { meta } = useSessionMeta(ids)
  const { tickets } = useMyBalances(ids)
  const expertAddrs = useMemo(() => sessions.map((s) => s.expert), [sessions])
  const experts = useExperts(expertAddrs)
  const avatars = useAvatars(expertAddrs)

  const query = useQueryParam('q')
  const catParam = useQueryParam('cat')
  const category = /^[0-7]$/.test(catParam) ? Number(catParam) : null
  const [price, setPrice] = useState<PriceFilter>('any')
  const [date, setDate] = useState<DateFilter>('any')
  const [sort, setSort] = useState<Sort>('soonest')
  const [showPast, setShowPast] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = sessions.filter((s) => {
      const phase = sessionPhase(s, now)
      if (!showPast && (phase === 'ended' || phase === 'cancelled')) return false
      if (category !== null && s.category !== category) return false
      if (!priceOk(s, price) || !dateOk(s, date, now)) return false
      if (!q) return true
      const name = experts.get(s.expert.toLowerCase())?.name.toLowerCase() ?? ''
      return s.title.toLowerCase().includes(q) || name.includes(q) || s.expert.toLowerCase().includes(q)
    })
    return list.sort((a, b) => {
      if (sort === 'newest') return Number(b.id - a.id)
      if (sort === 'priceAsc') return Number(a.price - b.price)
      if (sort === 'priceDesc') return Number(b.price - a.price)
      return Number(a.startTime - b.startTime)
    })
  }, [sessions, now, showPast, category, price, date, query, sort, experts])

  const upcoming = useMemo(
    () => sessions.filter((s) => sessionPhase(s, now) === 'upcoming' && s.sold < s.supply).sort((a, b) => b.sold - a.sold),
    [sessions, now],
  )
  const filtering = query !== '' || category !== null || price !== 'any' || date !== 'any'
  // Only feature sessions when there are enough to make the split worthwhile, and don't repeat them below.
  const featured = useMemo(() => (upcoming.length > 3 ? upcoming.slice(0, 3) : []), [upcoming])
  const showFeatured = !filtering && !showPast && featured.length > 0
  const featuredIds = useMemo(() => new Set(featured.map((s) => s.id.toString())), [featured])
  const listed = showFeatured ? filtered.filter((s) => !featuredIds.has(s.id.toString())) : filtered

  const stats = useMemo(
    () => ({
      live: sessions.filter((s) => ['upcoming', 'live'].includes(sessionPhase(s, now))).length,
      experts: new Set(sessions.map((s) => s.expert.toLowerCase())).size,
      tickets: sessions.reduce((a, s) => a + s.sold - s.refunded, 0),
    }),
    [sessions, now],
  )

  const card = (s: Session, v: 'grid' | 'list') => (
    <SessionCard
      key={s.id.toString()}
      session={s}
      view={v}
      now={now}
      meta={meta[s.id.toString()]}
      expertName={experts.get(s.expert.toLowerCase())?.name}
      expertAvatar={avatars[s.expert.toLowerCase()]}
      owned={(tickets.get(s.id.toString()) ?? 0n) > 0n}
    />
  )

  return (
    <div className="mx-auto w-full max-w-[1320px] px-5 py-8 sm:px-8 sm:py-10">
      <section className="hero-bg glass relative overflow-hidden rounded-[2rem] p-7 sm:p-10 lg:p-12">
        <div className="relative grid gap-10 2xl:grid-cols-[1.4fr_1fr] 2xl:items-center">
          <div>
            <span className="inline-flex items-center gap-2.5 rounded-full border border-brand/25 bg-brand/10 px-4 py-2 text-sm font-semibold text-brand">
              <Sparkles size={15} aria-hidden /> Live sessions · NFT tickets · Paid in USDC
            </span>{' '}
            <h1 className="display mt-6 max-w-2xl text-balance text-4xl font-bold leading-[1.05] sm:text-5xl lg:text-[3.5rem]">
              Learn live from people <span className="gradient-text">who do the work.</span>
            </h1>{' '}
            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-dim sm:text-lg">
              Your wallet is your pass. Buy a ticket with USDC and get the event link for engineering, health, finance, design and more.
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-3 sm:gap-4">
            {[
              { icon: Sparkles, label: 'Open sessions', value: stats.live },
              { icon: Users, label: 'Experts', value: stats.experts },
              { icon: Ticket, label: 'Tickets sold', value: stats.tickets },
            ].map((x) => (
              <div key={x.label} className="min-w-0 rounded-2xl border border-line bg-canvas/50 p-4 sm:p-5">
                <x.icon size={18} className="text-brand" aria-hidden />
                <dd className="display num mt-4 text-3xl font-bold sm:text-4xl">{isLoading ? '–' : x.value}</dd>{' '}
                <dt className="mt-1 text-xs font-medium leading-snug text-dim sm:text-sm">{x.label}</dt>
              </div>
            ))}
          </dl>

          <ol className="grid gap-4 border-t border-line pt-8 md:grid-cols-3 2xl:col-span-2" aria-label="How it works">
            {[
              { icon: Wallet, title: 'Pay with USDC', body: 'Pick a session and buy your ticket in one click.' },
              { icon: Ticket, title: 'Receive an NFT ticket', body: 'Your ticket lands in your wallet. It is your pass.' },
              { icon: Video, title: 'Get the event link', body: 'Your ticket shows the Zoom or Meet link on the session page.' },
            ].map((step, i) => (
              <li key={step.title} className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand2 text-accent-ink shadow-[0_10px_24px_-10px_rgb(var(--brand)/0.8)]">
                  <step.icon size={19} aria-hidden />
                </span>{' '}
                <div>
                  <p className="font-semibold">
                    <span className="num mr-2 text-sm text-brand">0{i + 1}</span>
                    {step.title}
                  </p>{' '}
                  <p className="mt-1 text-sm leading-relaxed text-dim">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="mt-10" role="tablist" aria-label="Categories">
        <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8">
          <Chip active={category === null} onClick={() => setExploreParams({ cat: null })}>
            All
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} active={category === c.id} onClick={() => setExploreParams({ cat: String(c.id) })} title={c.label}>
              {c.short}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 items-center gap-3 sm:flex sm:flex-wrap">
        <Select label="Price" value={price} onChange={(v) => setPrice(v as PriceFilter)} options={PRICE_OPTIONS} />{' '}
        <Select
          label="Date"
          value={date}
          onChange={(v) => setDate(v as DateFilter)}
          options={[
            { id: 'any', label: 'Any date' },
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'Next 7 days' },
            { id: 'month', label: 'Next 30 days' },
          ]}
        />{' '}
        <Select
          label="Sort"
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          options={[
            { id: 'soonest', label: 'Starting soonest' },
            { id: 'newest', label: 'Newest' },
            { id: 'priceAsc', label: 'Price: low to high' },
            { id: 'priceDesc', label: 'Price: high to low' },
          ]}
        />{' '}
        <label className="col-span-2 flex min-h-[44px] cursor-pointer items-center gap-2.5 px-1 text-sm font-medium text-ink-2 sm:col-span-1">
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--brand))]" />{' '}
          Show past sessions
        </label>
        <div className="col-span-2 ml-auto flex rounded-xl border border-line bg-card p-1 sm:col-span-1" role="group" aria-label="View">
          {(['grid', 'list'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              aria-label={`${v} view`}
              onClick={() => setView(v)}
              className={clsx('flex h-9 w-10 items-center justify-center rounded-lg transition-colors', view === v ? 'bg-brand/20 text-brand' : 'text-dim hover:text-ink')}
            >
              {v === 'grid' ? <LayoutGrid size={16} /> : <List size={16} />}
            </button>
          ))}
        </div>
      </div>

      {showFeatured && (
        <section className="mt-12" aria-labelledby="featured">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="featured" className="display text-2xl font-bold sm:text-3xl">
              Trending now
            </h2>{' '}
            <p className="text-sm text-dim">Most booked upcoming sessions</p>
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{featured.map((s) => card(s, 'grid'))}</div>
        </section>
      )}

      <section className="mt-12" aria-labelledby="all">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="all" className="display text-2xl font-bold sm:text-3xl">
            {category !== null ? CATEGORIES[category]?.label : showFeatured ? 'More sessions' : showPast ? 'All sessions' : 'Upcoming sessions'}
          </h2>{' '}
          <span className="num text-sm text-dim">{(showFeatured ? listed : filtered).length} found</span>
        </div>

        {isLoading ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <div className="mt-6">
            <EmptyState icon={<SearchX />} title="Could not load sessions" body="The network did not respond. Check your connection and refresh." />
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={<Ticket />}
              title={sessions.length === 0 ? 'No sessions yet' : 'No sessions match'}
              body={
                sessions.length === 0
                  ? 'Be the first expert to host a session on ExpertPass.'
                  : 'Try a different category, price, or date, or search for something else.'
              }
              action={
                sessions.length === 0 ? (
                  <Link to="/dashboard/new" className="btn btn-primary">
                    Host a session
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setExploreParams({ q: null, cat: null })
                      setPrice('any')
                      setDate('any')
                      setShowPast(true)
                    }}
                  >
                    Clear filters
                  </button>
                )
              }
            />
          </div>
        ) : listed.length === 0 ? null : (
          <div className={clsx('mt-6', view === 'grid' ? 'grid gap-6 sm:grid-cols-2 xl:grid-cols-3' : 'flex flex-col gap-5')}>
            {listed.map((s) => card(s, view))}
          </div>
        )}
      </section>
    </div>
  )
}

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} className="chip shrink-0" title={title}>
      {children}
    </button>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { id: string; label: string }[]
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input !min-h-[44px] w-full !bg-card !py-0 !text-sm font-medium sm:w-auto"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
