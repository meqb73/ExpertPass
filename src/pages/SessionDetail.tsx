import { useMemo } from 'react'
import { ArrowLeft, Award, CalendarDays, Check, Clock, Repeat2, ShieldCheck, Ticket, Undo2, Users, Video } from 'lucide-react'
import { useAccount } from 'wagmi'
import { BuyPanel } from '@/components/BuyPanel'
import { AccessPanel } from '@/components/AccessPanel'
import { Cover } from '@/components/Cover'
import { ExpertAvatar } from '@/components/ExpertAvatar'
import { CategoryBadge, Card, PhasePill, Spinner } from '@/components/ui'
import { useAvatars, useExperts, useMyBalances, useMyRefunds, useSession, useSessionMeta } from '@/hooks/useExpertPass'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { CHAIN_ID, EXPERT_PASS_ADDRESS } from '@/lib/constants'
import { formatDateTime, formatDuration, formatPrice, shortAddress } from '@/lib/format'
import { RichText } from '@/lib/richtext'
import { Link, useNow } from '@/lib/router'
import { remaining, sessionPhase } from '@/lib/types'

export function SessionDetail({ id }: { id: bigint }) {
  const now = useNow(15_000)
  const { address } = useAccount()
  const { session, isLoading, isError } = useSession(id)
  const hostAddrs = useMemo(() => (session ? [session.expert] : []), [session])
  const experts = useExperts(hostAddrs)
  const avatars = useAvatars(hostAddrs)
  const { meta } = useSessionMeta([id])
  const { tickets, certs } = useMyBalances([id])
  const ids = useMemo(() => [id], [id])
  const { refunds } = useMyRefunds(ids)

  if (isLoading) {
    return (
      <div className="flex justify-center py-32 text-dim">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (isError || !session) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="display text-2xl font-semibold">Session not found</h1>{' '}
        <p className="mt-2 text-dim">It may not exist or the network is unavailable.</p>
        <Link to="/" className="btn btn-primary mt-6">
          Browse sessions
        </Link>
      </div>
    )
  }

  const phase = sessionPhase(session, now)
  const expert = experts.get(session.expert.toLowerCase())
  const left = remaining(session)
  const isExpert = address?.toLowerCase() === session.expert.toLowerCase()
  const balance = tickets.get(id.toString()) ?? 0n
  const hasCert = (certs.get(id.toString()) ?? 0n) > 0n
  const sessionMeta = meta[id.toString()]
  const pct = Math.min(100, Math.round((session.sold / session.supply) * 100))
  const refundedAmount = refunds.get(id.toString())?.refunded ?? 0n

  return (
    <div className="mx-auto w-full max-w-[1320px] px-5 py-8 sm:px-8 sm:py-10">
      <Link to="/" className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-dim transition-colors hover:text-ink">
        <ArrowLeft size={16} /> Back to Explore
      </Link>

      <div className="mt-3 grid gap-8 2xl:grid-cols-[1fr_400px] 2xl:gap-x-10">
        <div className="min-w-0 2xl:col-start-1 2xl:row-start-1">
          <div className="relative aspect-video overflow-hidden rounded-[2rem] border border-line shadow-card">
            <Cover category={session.category} url={sessionMeta?.cover} iconSize={72} />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2.5 p-5 sm:p-7">
              <PhasePill phase={phase} overlay />{' '}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                <Repeat2 size={12} aria-hidden />
                {session.transferable ? 'Transferable ticket' : 'Soulbound ticket'}
              </span>
            </div>
          </div>

          <div className="mt-8">
            <CategoryBadge category={session.category} />{' '}
            <h1 className="display mt-4 text-balance text-3xl font-bold leading-[1.1] sm:text-5xl">{session.title}</h1>
          </div>

          <Card className="mt-7 flex items-center gap-4 p-5">
            <Link to={`/expert/${session.expert}`} aria-label="View expert profile" className="shrink-0">
              <ExpertAvatar name={expert?.name || 'E'} address={session.expert} version={avatars[session.expert.toLowerCase()]} size={60} />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="eyebrow !text-dim">Hosted by</p>{' '}
              <Link to={`/expert/${session.expert}`} className="mt-1 block truncate text-lg font-semibold transition-colors hover:text-brand">
                {expert?.name || shortAddress(session.expert)}
              </Link>
              {expert?.bio && <p className="mt-0.5 text-sm text-dim">{expert.bio}</p>}
              <a
                href={buildAddressExplorerUrl(CHAIN_ID, session.expert)}
                target="_blank"
                rel="noopener noreferrer"
                className="mono mt-1 inline-block text-xs text-dim underline-offset-2 hover:text-brand hover:underline"
              >
                {shortAddress(session.expert)}
              </a>
            </div>
            <Link to={`/expert/${session.expert}`} className="btn btn-ghost btn-sm hidden shrink-0 sm:inline-flex">
              View profile
            </Link>
          </Card>
        </div>

        <aside className="2xl:sticky 2xl:top-28 2xl:col-start-2 2xl:row-span-2 2xl:row-start-1 2xl:self-start">
          <Card className="overflow-hidden">
            <div className="hero-bg border-b border-line p-6 sm:p-7">
              <p className="eyebrow !text-dim">Ticket price</p>
              <div className="mt-2 flex items-end justify-between gap-4">
                <div>
                  <p className="display num text-5xl font-bold leading-none">{formatPrice(session.price, false)}</p>
                  {session.price > 0n && <p className="mt-1.5 text-sm font-medium text-dim">USDC</p>}
                </div>
                <div className="text-right">
                  <p className="num text-xl font-bold">{session.cancelled ? 'Cancelled' : left === 0 ? 'Sold out' : `${left} left`}</p>{' '}
                  <p className="text-sm text-dim">
                    {session.cancelled ? `${session.refunded} of ${session.sold} refunded` : `of ${session.supply} tickets`}
                  </p>
                </div>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-canvas/70" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tickets sold">
                <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand2" style={{ width: `${pct}%` }} />
              </div>
            </div>

            <div className="p-6 sm:p-7">
              <dl className="space-y-4 text-sm">
                <div className="flex items-center gap-3.5">
                  <CalendarDays size={18} className="shrink-0 text-brand" aria-hidden />
                  <dt className="sr-only">Starts</dt>
                  <dd className="font-medium">{formatDateTime(session.startTime)}</dd>
                </div>
                <div className="flex items-center gap-3.5">
                  <Clock size={18} className="shrink-0 text-brand" aria-hidden />
                  <dt className="sr-only">Duration</dt>
                  <dd className="font-medium">{formatDuration(session.duration)}</dd>
                </div>
                <div className="flex items-center gap-3.5">
                  <Users size={18} className="shrink-0 text-brand" aria-hidden />
                  <dt className="sr-only">Sold</dt>
                  <dd className="num font-medium">{session.sold} attending</dd>
                </div>
              </dl>

              <div className="mt-6 border-t border-line pt-6">
                {isExpert ? (
                  <div className="space-y-3">
                    <p className="text-sm text-dim">You are hosting this session.</p>
                    <AccessPanel session={session} now={now} compact />
                    <Link to="/dashboard" className="btn btn-ghost w-full">
                      Manage in dashboard
                    </Link>
                  </div>
                ) : balance === 0n && session.cancelled && refundedAmount > 0n ? (
                  <div className="space-y-2 rounded-xl bg-good/15 px-4 py-3 text-good">
                    <p className="flex items-center gap-2 font-semibold">
                      <Check size={16} /> Refunded {formatPrice(refundedAmount)}
                    </p>
                    <p className="text-sm">This session was cancelled. Your USDC went back to your wallet and the ticket was burned.</p>
                  </div>
                ) : (
                  <BuyPanel session={session} now={now} balance={balance} />
                )}
              </div>

              {hasCert && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-brand/15 px-4 py-3 text-sm font-semibold text-brand">
                  <Award size={16} /> You hold the attendance certificate
                </div>
              )}
              <p className="mt-5 flex items-center gap-2 text-xs text-dim">
                <ShieldCheck size={14} aria-hidden /> Secured by smart contract escrow
              </p>
            </div>
          </Card>
          {EXPERT_PASS_ADDRESS && (
            <p className="mt-3 flex items-center gap-1.5 px-2 text-xs text-dim">
              Ticket NFT contract{' '}
              <a href={buildAddressExplorerUrl(CHAIN_ID, EXPERT_PASS_ADDRESS)} target="_blank" rel="noopener noreferrer" className="mono underline">
                {shortAddress(EXPERT_PASS_ADDRESS)}
              </a>
            </p>
          )}
        </aside>

        <div className="min-w-0 2xl:col-start-1 2xl:row-start-2">
          <section className="mt-10" aria-labelledby="about">
            <h2 id="about" className="display text-2xl font-bold">
              About this session
            </h2>{' '}
            <div className="mt-3">
              <RichText source={session.description || 'The expert has not added a description yet.'} />
            </div>
          </section>

          <section className="mt-10" aria-labelledby="included">
            <h2 id="included" className="display text-2xl font-bold">
              What you get
            </h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                { icon: Ticket, title: 'NFT ticket', body: 'A ticket in your wallet that proves you are in.' },
                { icon: Video, title: 'Event link', body: 'Shown on this page to wallets that hold the ticket.' },
                { icon: Undo2, title: 'Full refund if cancelled', body: 'If the expert cancels, your USDC returns automatically.' },
                { icon: Award, title: 'Attendance certificate', body: 'The expert can mint a soulbound certificate after the session.' },
              ].map((x) => (
                <li key={x.title} className="flex gap-4 rounded-2xl border border-line bg-card p-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
                    <x.icon size={20} aria-hidden />
                  </span>{' '}
                  <div>
                    <p className="font-semibold">{x.title}</p>{' '}
                    <p className="mt-1 text-sm leading-relaxed text-dim">{x.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
