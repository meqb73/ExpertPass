import { ExternalLink, Video } from 'lucide-react'
import { Spinner } from './ui'
import { useEventLink } from '@/hooks/useExpertPass'
import { sessionPhase, type Session } from '@/lib/types'

interface Props {
  session: Session
  now: number
  /** compact layout for ticket cards */
  compact?: boolean
}

/**
 * Shows the event link to ticket holders and the host. The link is read from the contract (public chain data),
 * so this is a convenience gate in the app, not a secret.
 */
export function AccessPanel({ session, now, compact }: Props) {
  const { link, isLoading } = useEventLink(session.id)
  const phase = sessionPhase(session, now)

  if (phase === 'cancelled') return null

  if (isLoading) {
    return (
      <div className="flex justify-center py-2 text-dim">
        <Spinner />
      </div>
    )
  }

  if (!link) return <p className="text-sm text-dim">The host has not added an event link.</p>

  return (
    <div className="space-y-2">
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className={phase === 'ended' ? 'btn btn-ghost w-full' : 'btn btn-primary w-full'}
      >
        <Video size={16} />
        {phase === 'live' ? 'Join session now' : phase === 'ended' ? 'Open link' : 'Join session'}
        <ExternalLink size={14} />
      </a>
      {!compact && <p className="break-all text-xs text-dim mono">{link}</p>}
    </div>
  )
}
