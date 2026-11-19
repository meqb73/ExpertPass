import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { isAddress, type Address } from 'viem'
import { ArrowLeft, CalendarCheck, ExternalLink, Pencil, Presentation, Ticket, UserX } from 'lucide-react'
import { ExpertAvatar } from '@/components/ExpertAvatar'
import { SessionCard } from '@/components/SessionCard'
import { Card, EmptyState, Spinner } from '@/components/ui'
import { useAvatars, useExperts, useMyBalances, useSessionMeta, useSessions } from '@/hooks/useExpertPass'
import { CHAIN_ID } from '@/lib/constants'
import { shortAddress } from '@/lib/format'
import { Link, useNow } from '@/lib/router'
import { sessionPhase } from '@/lib/types'
import { buildAddressExplorerUrl } from '@/onchain-facts'

type Tab = 'upcoming' | 'past'

export function ExpertProfile({ address }: { address: string }) {
  if (!isAddress(address)) return <NotFound />
  return <Profile address={address.toLowerCase() as Address} />
}

function NotFound() {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-5 py-16 sm:px-8">
      <EmptyState
        icon={<UserX />}
        title="Expert not found"
        body="This profile link is not valid."
        action={
          <Link to="/" className="btn btn-primary">
            Back to Explore
          </Link>
        }
      />
    </div>
  )
}

function Profile({ address }: { address: Address }) {
  const now = useNow(30_000)
  const { address: me } = useAccount()
  const addrs = useMemo(() => [address], [address])
  const experts = useExperts(addrs)
  const avatars = useAvatars(addrs)
  const { sessions, isLoading } = useSessions()
  const mine = useMemo(() => sessions.filter((s) => s.expert.toLowerCase() === address), [sessions, address])
  const ids = useMemo(() => mine.map((s) => s.id), [mine])
  const { meta } = useSessionMeta(ids)
  const { tickets } = useMyBalances(ids)
  const [tab, setTab] = useState<Tab | null>(null)

  const profile = experts.get(address)
  const isMe = me?.toLowerCase() === address

  const stats = useMemo(() => {
    const active = mine.filter((s) => !s.cancelled)
    return {
      hosted: active.length,
      sold: active.reduce((a, s) => a + s.sold, 0),
      upcoming: active.filter((s) => ['upcoming', 'live'].includes(sessionPhase(s, now))).length,
    }
  }, [mine, now])

  const upcoming = mine.filter((s) => ['upcoming', 'live'].includes(sessionPhase(s, now))).sort((a, b) => Number(a.startTime - b.startTime))
  const past = mine.filter((s) => ['ended', 'cancelled'].includes(sessionPhase(s, now))).sort((a, b) => Number(b.startTime - a.startTime))
  const active: Tab = tab ?? (upcoming.length > 0 || past.length === 0 ? 'upcoming' : 'past')
  const shown = active === 'upcoming' ? upcoming : past

  if (!profile && isLoading) {
    return (
      <div className="flex justify-center py-32 text-dim">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (!profile?.registered) {
    return (
      <div className="mx-auto w-full max-w-[1320px] px-5 py-16 sm:px-8">
        <EmptyState
          icon={<UserX />}
          title="No expert profile"
          body={`${shortAddress(address)} has not created an expert profile yet.`}
          action={
            <Link to="/" className="btn btn-primary">
              Back to Explore
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] px-5 py-8 sm:px-8 sm:py-10">
      <Link to="/" className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-dim transition-colors hover:text-ink">
        <ArrowLeft size={16} /> Back to Explore
      </Link>

      <Card className="mt-3 overflow-hidden rounded-[2rem]">
        <div className="hero-bg h-32 border-b border-line sm:h-40" aria-hidden />
        <div className="px-6 pb-8 sm:px-10">
          <div className="relative z-10 -mt-14 flex flex-wrap items-end justify-between gap-4 sm:-mt-16">
            <ExpertAvatar
              name={profile.name}
              address={address}
              version={avatars[address]}
              size={120}
              className="!ring-4 !ring-card"
            />
            {isMe && (
              <Link to="/dashboard" className="btn btn-ghost">
                <Pencil size={16} /> Edit profile
              </Link>
            )}
          </div>

          <div className="mt-5 grid gap-8 2xl:grid-cols-[1fr_auto] 2xl:items-end">
            <div className="min-w-0">
              <p className="eyebrow">Expert</p>
              <h1 className="display mt-2 text-balance text-4xl font-bold sm:text-5xl">{profile.name}</h1>{' '}
              <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-ink-2 sm:text-lg">
                {profile.bio || 'This expert has not added a bio yet.'}
              </p>
              <a
                href={buildAddressExplorerUrl(CHAIN_ID, address)}
                target="_blank"
                rel="noopener noreferrer"
                className="mono mt-4 inline-flex items-center gap-1.5 text-xs text-dim transition-colors hover:text-brand"
              >
                {shortAddress(address)} <ExternalLink size={12} aria-hidden />
              </a>
            </div>

            <dl className="grid grid-cols-3 gap-3">
              {[
                { icon: Presentation, label: 'Sessions hosted', value: stats.hosted },
                { icon: Ticket, label: 'Tickets sold', value: stats.sold },
                { icon: CalendarCheck, label: 'Upcoming', value: stats.upcoming },
              ].map((x) => (
                <div key={x.label} className="min-w-[110px] rounded-2xl border border-line bg-canvas/50 p-4">
                  <x.icon size={17} className="text-brand" aria-hidden />
                  <dd className="display num mt-3 text-3xl font-bold">{x.value}</dd>{' '}
                  <dt className="mt-0.5 text-xs font-medium text-dim">{x.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Card>

      <section className="mt-12" aria-labelledby="their-sessions">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="their-sessions" className="display text-2xl font-bold sm:text-3xl">
            Sessions by {profile.name}
          </h2>
          <div className="flex gap-2.5" role="tablist" aria-label="Session filters">
            {(['upcoming', 'past'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={active === t} onClick={() => setTab(t)} className="chip capitalize">
                {t} <span className="num ml-1 text-xs opacity-70">{t === 'upcoming' ? upcoming.length : past.length}</span>
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16 text-dim">
            <Spinner className="h-6 w-6" />
          </div>
        ) : shown.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-line px-6 py-14 text-center text-dim">
            {active === 'upcoming' ? 'No upcoming sessions right now.' : 'No past sessions yet.'}
          </p>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((s) => (
              <SessionCard
                key={s.id.toString()}
                session={s}
                view="grid"
                now={now}
                meta={meta[s.id.toString()]}
                expertName={profile.name}
                expertAvatar={avatars[address]}
                owned={(tickets.get(s.id.toString()) ?? 0n) > 0n}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
