import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { Award, Banknote, CalendarX2, KeyRound, Pencil, Plus, Presentation, Ticket, Undo2, UserRound, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Cover } from '@/components/Cover'
import { EditProfileModal } from '@/components/EditProfileModal'
import { ExpertAvatar } from '@/components/ExpertAvatar'
import { CertificatePanel } from '@/components/CertificatePanel'
import { ExpertGate } from '@/components/ExpertGate'
import { Modal } from '@/components/Modal'
import { Card, EmptyState, PhasePill, RefundBadge, Spinner, Stat } from '@/components/ui'
import { useActions } from '@/hooks/useActions'
import { useStorageHealth } from '@/hooks/useStorageHealth'
import { useAvatars, useEventLink, useMyExpertProfile, useRefundsPending, useSessionMeta, useSessions } from '@/hooks/useExpertPass'
import { formatAmount, formatDateTime, parseTxError } from '@/lib/format'
import { isValidEventLink } from '@/lib/messages'
import { Link, useNow } from '@/lib/router'
import { remaining, sessionPhase, type Session } from '@/lib/types'

const gross = (s: Session) => BigInt(s.sold) * s.price
const net = (s: Session) => gross(s) - (gross(s) * BigInt(s.feeBps)) / 10_000n

export function Dashboard() {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-5 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow">Expert studio</p>
          <h1 className="display mt-2 text-4xl font-bold sm:text-5xl">Expert dashboard</h1>{' '}
          <p className="mt-3 max-w-xl text-dim">Manage your sessions, track ticket sales, and collect your earnings in USDC.</p>
        </div>
        <Link to="/dashboard/new" className="btn btn-primary">
          <Plus size={18} /> New session
        </Link>
      </div>
      <div className="mt-10">
        <ExpertGate>{(name) => <MySessions name={name} />}</ExpertGate>
      </div>
    </div>
  )
}

type Filter = 'all' | 'upcoming' | 'past' | 'cancelled'

function MySessions({ name }: { name: string }) {
  const { address } = useAccount()
  const now = useNow(15_000)
  const { sessions, isLoading } = useSessions()
  const mine = useMemo(() => sessions.filter((s) => s.expert.toLowerCase() === address?.toLowerCase()), [sessions, address])
  const { meta } = useSessionMeta(useMemo(() => mine.map((s) => s.id), [mine]))
  const [filter, setFilter] = useState<Filter>('all')
  const [editProfile, setEditProfile] = useState(false)
  const storageHealth = useStorageHealth()
  const { profile } = useMyExpertProfile()
  const avatars = useAvatars(useMemo(() => (address ? [address] : []), [address]))

  const live = mine.filter((s) => !s.cancelled)
  const totalRevenue = live.reduce((a, s) => a + gross(s), 0n)
  const paidOut = live.filter((s) => s.paidOut).reduce((a, s) => a + net(s), 0n)
  const pending = live.filter((s) => !s.paidOut).reduce((a, s) => a + net(s), 0n)
  const ticketsSold = live.reduce((a, s) => a + s.sold, 0)

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: mine.length, upcoming: 0, past: 0, cancelled: 0 }
    for (const s of mine) {
      const p = sessionPhase(s, now)
      if (p === 'cancelled') c.cancelled++
      else if (p === 'ended') c.past++
      else c.upcoming++
    }
    return c
  }, [mine, now])
  const shown = mine.filter((s) => {
    const p = sessionPhase(s, now)
    if (filter === 'all') return true
    if (filter === 'cancelled') return p === 'cancelled'
    if (filter === 'past') return p === 'ended'
    return p === 'upcoming' || p === 'live'
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-24 text-dim">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <Card className="flex flex-wrap items-center gap-5 p-5 sm:p-6">
        <ExpertAvatar name={name} address={address ?? ''} version={address ? avatars[address.toLowerCase()] : null} size={72} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow !text-dim">Your public profile</p>{' '}
          <p className="display mt-1 truncate text-2xl font-bold">{name}</p>
          <p className="mt-1 line-clamp-2 max-w-2xl text-sm leading-relaxed text-dim">{profile?.bio || 'Add a short bio so learners know who you are.'}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className="btn btn-primary btn-sm !min-h-[42px]" onClick={() => setEditProfile(true)}>
            <Pencil size={15} /> Edit profile
          </button>
          <Link to={`/expert/${address}`} className="btn btn-ghost btn-sm !min-h-[42px]">
            <UserRound size={15} /> View public page
          </Link>
        </div>
      </Card>
      {editProfile && (
        <EditProfileModal
          initialName={profile?.name ?? name}
          initialBio={profile?.bio ?? ''}
          avatarVersion={address ? avatars[address.toLowerCase()] : null}
          onClose={() => setEditProfile(false)}
        />
      )}
      {import.meta.env.PROD && storageHealth && !storageHealth.durable && (
        <p className="rounded-2xl border border-line bg-card/60 px-5 py-4 text-sm leading-relaxed text-dim">
          This server keeps profile photos on a disk that may be reset when it restarts, so you may need to upload yours again. Event links, cover image links, sessions and tickets are stored onchain and are not affected.
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 2xl:grid-cols-4">
        <Stat icon={<Banknote size={18} />} label="Total revenue" value={formatAmount(totalRevenue)} hint="USDC, gross ticket sales" />
        <Stat icon={<Presentation size={18} />} label="Sessions" value={mine.length} hint={`${mine.filter((s) => s.cancelled).length} cancelled`} />
        <Stat icon={<Ticket size={18} />} label="Tickets sold" value={ticketsSold} />
        <Stat icon={<Wallet size={18} />} label="Paid out" value={formatAmount(paidOut)} hint={`${formatAmount(pending)} USDC pending`} />
      </div>

      {mine.length === 0 ? (
        <EmptyState
          icon={<Presentation />}
          title="Host your first session"
          body="Set a price and ticket supply, add your event link, and share it. Ticket holders see the link on the session page."
          action={
            <Link to="/dashboard/new" className="btn btn-primary">
              <Plus size={18} /> Create a session
            </Link>
          }
        />
      ) : (
        <section aria-labelledby="mine">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="mine" className="display text-2xl font-bold sm:text-3xl">
              Your sessions
            </h2>
            <div className="flex gap-2.5 overflow-x-auto" role="tablist" aria-label="Session filters">
              {(['all', 'upcoming', 'past', 'cancelled'] as const).map((f) => (
                <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className="chip shrink-0 capitalize">
                  {f} <span className="num ml-1 text-xs opacity-70">{counts[f]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 space-y-4">
            {shown.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-dim">Nothing in this view.</p>
            ) : (
              shown.map((s) => <SessionRow key={s.id.toString()} s={s} now={now} cover={meta[s.id.toString()]?.cover} />)
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function SessionRow({ s, now, cover }: { s: Session; now: number; cover: string | null | undefined }) {
  const actions = useActions()
  const { link: currentLink } = useEventLink(s.id)
  const phase = sessionPhase(s, now)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [certs, setCerts] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [refundsLeft, setRefundsLeft] = useState<number | null>(null)
  const pendingOnchain = useRefundsPending(s.id, s.cancelled)
  const outstanding = s.sold - s.refunded
  const pct = Math.round((s.sold / s.supply) * 100)

  const canWithdraw = phase === 'ended' && !s.paidOut && s.sold > 0
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      toast.success(ok)
    } catch (e) {
      const msg = parseTxError(e)
      if (msg) toast.error(msg)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="aspect-video w-full shrink-0 overflow-hidden rounded-2xl sm:w-72 lg:w-60">
          <Cover category={s.category} url={cover} iconSize={30} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PhasePill phase={phase} />
            {s.paidOut && <span className="rounded-full bg-good/15 px-2.5 py-1 text-xs font-semibold text-good">Paid out</span>}
            {s.cancelled && s.sold > 0 && (
              <RefundBadge state={outstanding === 0 ? 'refunded' : s.refunded > 0 ? 'partial' : 'pending'} />
            )}
          </div>
          <Link to={`/session/${s.id}`} className="display mt-2.5 block truncate text-xl font-bold transition-colors hover:text-brand">
            {s.title}
          </Link>
          <p className="text-sm text-dim">{formatDateTime(s.startTime)}</p>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm lg:w-[360px]">
          <div>
            <p className="text-xs text-dim">Sold</p>{' '}
            <p className="num font-semibold">
              {s.sold} / {s.supply}
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div>
            <p className="text-xs text-dim">Remaining</p>{' '}
            <p className="num font-semibold">{remaining(s)}</p>
          </div>
          <div>
            <p className="text-xs text-dim">{s.cancelled ? 'Refunded' : 'Revenue'}</p>{' '}
            <p className="num font-semibold">
              {s.cancelled ? `${formatAmount(BigInt(s.refunded) * s.price)} USDC` : formatAmount(gross(s))}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        {(phase === 'upcoming' || phase === 'live') && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setLinkValue(currentLink ?? '')
              setLinkOpen(true)
            }}
          >
            <KeyRound size={14} /> Change link
          </button>
        )}
        {phase === 'upcoming' && (
          <>
            <Link to={`/dashboard/edit/${s.id}`} className="btn btn-ghost btn-sm">
              <Pencil size={14} /> Edit
            </Link>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmCancel(true)}>
              <CalendarX2 size={14} /> Cancel and refund
            </button>
          </>
        )}
        {canWithdraw && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy === 'pay'}
            onClick={() => void run('pay', () => actions.withdrawProceeds(s.id), 'Earnings sent to your wallet')}
          >
            {busy === 'pay' ? <Spinner /> : <Banknote size={14} />}
            Withdraw {formatAmount(net(s))} USDC
          </button>
        )}
        {phase === 'ended' && s.sold > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCerts(true)}>
            <Award size={14} /> Attendance certificates
          </button>
        )}
        {phase === 'live' && <span className="self-center text-sm text-dim">Live now. Earnings unlock when the session ends.</span>}
        {phase === 'cancelled' && (
          <>
            <span className="self-center text-sm text-dim">
              {s.refunded} of {s.sold} tickets refunded
              {outstanding > 0 && pendingOnchain === 0 && ' · remaining holders can claim from My Tickets'}
            </span>
            {pendingOnchain > 0 && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy === 'refunds'}
                onClick={() => void run('refunds', () => actions.processRefunds(s.id), 'Refunds sent')}
              >
                {busy === 'refunds' ? <Spinner /> : <Undo2 size={14} />}
                Send remaining refunds ({pendingOnchain} left)
              </button>
            )}
          </>
        )}
      </div>

      {confirmCancel && (
        <Modal title="Cancel this session?" onClose={() => setConfirmCancel(false)}>
          <p className="text-sm text-dim">
            {s.sold > 0 ? (
              <>
                All {s.sold} ticket holder{s.sold === 1 ? '' : 's'} will be refunded {formatAmount(s.price)} USDC each ({formatAmount(gross(s))} USDC in total)
                automatically from escrow, and their tickets are burned.{' '}
              </>
            ) : (
              'No tickets have been sold yet. '
            )}
            This cannot be undone and the session will no longer be bookable.
          </p>
          <div className="mt-5 flex gap-3">
            <button type="button" className="btn btn-ghost flex-1" onClick={() => setConfirmCancel(false)}>
              Keep session
            </button>
            <button
              type="button"
              className="btn btn-danger-solid flex-1"
              disabled={busy === 'cancel'}
              onClick={() =>
                void run('cancel', () => actions.cancelSession(s.id, setRefundsLeft), 'Session cancelled and buyers refunded').then(() => setConfirmCancel(false))
              }
            >
              {busy === 'cancel' && <Spinner />}
              {busy === 'cancel' ? (refundsLeft ? `Refunding (${refundsLeft} left)` : 'Cancelling...') : 'Cancel and refund'}
            </button>
          </div>
        </Modal>
      )}

      {linkOpen && (
        <Modal title="Event link" onClose={() => setLinkOpen(false)}>
          <p className="text-sm leading-relaxed text-dim">
            Saved onchain with a transaction. The app shows it only to ticket holders, but anyone reading the blockchain can see it. You can change it until the session ends.
          </p>
          <input
            className="input mt-4"
            type="url"
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            placeholder="https://zoom.us/j/..."
            aria-label="Event link"
          />
          <button
            type="button"
            className="btn btn-primary mt-4 w-full"
            disabled={busy === 'link' || !isValidEventLink(linkValue.trim())}
            onClick={() =>
              void run('link', () => actions.setEventLink(s.id, linkValue.trim()), 'Event link updated').then(() => setLinkOpen(false))
            }
          >
            {busy === 'link' && <Spinner />} Save link
          </button>
        </Modal>
      )}

      {certs && <CertificatePanel session={s} onClose={() => setCerts(false)} />}
    </Card>
  )
}
