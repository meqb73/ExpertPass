import type { Address } from 'viem'

export interface Session {
  id: bigint
  expert: Address
  category: number
  transferable: boolean
  cancelled: boolean
  paidOut: boolean
  feeBps: number
  duration: number
  startTime: bigint
  supply: number
  sold: number
  refunded: number
  price: bigint
  title: string
  description: string
}

export type SessionPhase = 'cancelled' | 'upcoming' | 'live' | 'ended'

export function sessionPhase(s: Session, nowSec: number): SessionPhase {
  if (s.cancelled) return 'cancelled'
  const start = Number(s.startTime)
  if (nowSec < start) return 'upcoming'
  if (nowSec < start + s.duration) return 'live'
  return 'ended'
}

export const remaining = (s: Session) => Math.max(0, s.supply - s.sold)

export interface ExpertProfile {
  name: string
  bio: string
  registered: boolean
}

export interface SessionMeta {
  /** Public https image URL stored onchain with the session, or null. */
  cover: string | null
}
