import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Award, CalendarDays, CheckCircle2, Clock, Ticket, Wallet } from 'lucide-react'
import clsx from 'clsx'
import { AccessPanel } from '@/components/AccessPanel'
import { Cover } from '@/components/Cover'
import { ExpertAvatar } from '@/components/ExpertAvatar'
import { RefundButton } from '@/components/RefundButton'
import { EmptyState, PhasePill, RefundBadge, Spinner } from '@/components/ui'
import { useAvatars, useExperts, useMyBalances, useMyRefunds, useSessionMeta, useSessions } from '@/hooks/useExpertPass'
import { categoryLabel } from '@/lib/constants'
import { formatDateTime, formatDuration, formatPrice, shortAddress } from '@/lib/format'
import { Link, useNow } from '@/lib/router'
import { sessionPhase } from '@/lib/types'

type Tab = 'all' | 'upcoming' | 'past' | 'cancelled'
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'cancelled', label: 'Cancelled' },
]

export function MyTickets() {
  const { isConnected } = useAccount()
  const now = useNow(15_000)
  const { sessions, isLoading } = useSessions()
  const ids = useMemo(() => sessions.map((s) => s.id), [sessions])
  const { tickets, certs, isLoading: balancesLoading } = useMyBalances(ids)
  const { meta } = useSessionMeta(ids)
  const cancelledIds = useMemo(() => sessions.filter((s) => s.cancelled).map((s) => s.id), [sessions])
  const { refunds } = useMyRefunds(cancelledIds)
  const expertAddrs = useMemo(() => sessions.map((s) => s.expert), [sessions])
  const experts = useExperts(expertAddrs)
  const avatars = useAvatars(expertAddrs)
  const [tab, setTab] = useState<Tab>('all')

  const owned = useMemo(
    () =>
      sessions
        .filter((s) => {
          if ((tickets.get(s.id.toString()) ?? 0n) > 0n) return true
          const r = refunds.get(s.id.toString())
          return s.cancelled && Boolean(r && (r.refunded > 0n || r.purchased))
        })
        .sort((a, b) => {
          const done = (p: string) => (p === 'ended' || p === 'cancelled' ? 1 : 0)
          return done(sessionPhase(a, now)) - done(sessionPhase(b, now)) || Number(a.startTime - b.startTime)
        }),
    [sessions, tickets, refunds, now],
  )
  const certificates = useMemo(() => sessions.filter((s) => (certs.get(s.id.toString()) ?? 0n) > 0n), [sessions, certs])

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: owned.length, upcoming: 0, past: 0, cancelled: 0 }
    for (const s of owned) {
      const p = sessionPhase(s, now)
      if (p === 'cancelled') c.cancelled++
      else if (p === 'ended') c.past++
      else c.upcoming++
    }
    return c
  }, [owned, now])

  const shown = owned.filter((s) => {
    const p = sessionPhase(s, now)
    if (tab === 'all') return true
    if (tab === 'cancelled') return p === 'cancelled'
    if (tab === 'past') return p === 'ended'
    return p === 'upcoming' || p === 'live'
  })

  return (
    <div className="mx-auto w-full max-w-[1320px] px-5 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow">Your library</p>
      <h1 className="display mt-2 text-4xl font-bold sm:text-5xl">My Tickets</h1>{' '}
      <p className="mt-3 max-w-xl text-dim">Every session NFT in your wallet. Your event link and Join button are right here.</p>

      {!isConnected ? (
        <div className="mt-10">
          <EmptyState
            icon={<Wallet />}
            title="Connect your wallet"
            body="Your tickets are NFTs in your wallet. Connect to see them."
            action={
              <ConnectKitButton.Custom>
                {({ show }) => (
                  <button type="button" onClick={show} className="btn btn-primary">
                    Connect wallet
                  </button>
                )}
              </ConnectKitButton.Custom>
            }
          />
        </div>
      ) : isLoading || balancesLoading ? (
        <div className="flex justify-center py-24 text-dim">
          <Spinner className="h-6 w-6" />
        </div>
      ) : owned.length === 0 && certificates.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={<Ticket />}
            title="No tickets yet"
            body="Pick a session you like and buy a ticket with USDC."
            action={
              <Link to="/" className="btn btn-primary">
                Explore sessions
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-8 flex gap-2.5 overflow-x-auto pb-1" role="tablist" aria-label="Ticket filters">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className="chip shrink-0">
                {t.label} <span className={clsx('num ml-1.5 text-xs', tab === t.id ? 'opacity-80' : 'text-dim')}>{counts[t.id]}</span>
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="mt-8 rounded-2xl border border-dashed border-line px-6 py-12 text-center text-dim">Nothing in this view.</p>
          ) : (
            <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((s) => {
                const phase = sessionPhase(s, now)
                const expert = experts.get(s.expert.toLowerCase())
                const holding = (tickets.get(s.id.toString()) ?? 0n) > 0n
                const refunded = refunds.get(s.id.toString())?.refunded ?? 0n
                return (
                  <article key={s.id.toString()} className="card-hover flex flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-card">
                    <Link to={`/session/${s.id}`} className="relative block aspect-[16/9] overflow-hidden" aria-label={s.title}>
                      <Cover category={s.category} url={meta[s.id.toString()]?.cover} iconSize={44} />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" aria-hidden />
                      <div className="absolute left-4 top-4">
                        <PhasePill phase={phase} overlay />
                      </div>
                      {phase === 'cancelled' && !holding && refunded > 0n && (
                        <div className="absolute right-4 top-4">
                          <RefundBadge state="refunded" amount={formatPrice(refunded, false)} />
                        </div>
                      )}
                      {phase === 'cancelled' && holding && (
                        <div className="absolute right-4 top-4">
                          <RefundBadge state="pending" />
                        </div>
                      )}
                    </Link>
                    <div className="flex flex-1 flex-col p-6">
                      <p className="eyebrow !text-dim">{categoryLabel(s.category)}</p>{' '}
                      <Link to={`/session/${s.id}`} className="display mt-2 line-clamp-2 text-xl font-bold leading-snug transition-colors hover:text-brand">
                        {s.title}
                      </Link>{' '}
                      <Link to={`/expert/${s.expert}`} className="mt-2 inline-flex min-w-0 items-center gap-2 text-sm text-dim transition-colors hover:text-brand">
                        <ExpertAvatar name={expert?.name || 'E'} address={s.expert} version={avatars[s.expert.toLowerCase()]} size={22} />{' '}
                        <span className="truncate">by {expert?.name || shortAddress(s.expert)}</span>
                      </Link>
                      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-dim">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays size={14} aria-hidden /> {formatDateTime(s.startTime)}
                        </span>{' '}
                        <span className="inline-flex items-center gap-1.5">
                          <Clock size={14} aria-hidden /> {formatDuration(s.duration)}
                        </span>
                      </div>
                      <div className="mt-auto pt-6">
                        <div className="border-t border-line pt-5">
                        {phase !== 'cancelled' ? (
                          <AccessPanel session={s} now={now} compact />
                        ) : holding ? (
                          <RefundButton session={s} />
                        ) : (
                          <p className="flex items-start gap-2 rounded-xl bg-good/15 px-3.5 py-3 text-sm text-good">
                            <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
                            <span>Refunded {formatPrice(refunded)} to your wallet. The ticket NFT was burned.</span>
                          </p>
                        )}
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {certificates.length > 0 && (
            <section className="mt-14" aria-labelledby="certs">
              <h2 id="certs" className="display text-2xl font-bold sm:text-3xl">
                Attendance certificates
              </h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {certificates.map((s) => (
                  <Link key={s.id.toString()} to={`/session/${s.id}`} className="card-hover flex items-center gap-4 rounded-2xl border border-line bg-card p-5 shadow-card">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand2 text-accent-ink">
                      <Award size={22} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{s.title}</span>
                      <span className="block text-sm text-dim">Soulbound certificate</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
