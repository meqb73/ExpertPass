import { formatUsdc } from '@/onchain-money'

/** "Free" or "12.50 USDC". Always at least two decimals, never rounds the real price. */
export function formatPrice(raw: bigint, withUnit = true): string {
  if (raw === 0n) return 'Free'
  const s = formatUsdc(raw)
  const [whole, frac = ''] = s.split('.')
  const text = `${whole}.${frac.padEnd(2, '0')}`
  return withUnit ? `${text} USDC` : text
}

/** A USDC total ("0.00" for zero, never "Free"). Use for revenue and payouts, not ticket prices. */
export function formatAmount(raw: bigint): string {
  const [whole, frac = ''] = formatUsdc(raw).split('.')
  return `${whole}.${frac.padEnd(2, '0')}`
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`

export function formatDateTime(startSec: bigint | number): string {
  return new Date(Number(startSec) * 1000).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDay(startSec: bigint | number): string {
  return new Date(Number(startSec) * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return `${d} day${d > 1 ? 's' : ''}`
  }
  return rem ? `${h}h ${rem}m` : `${h}h`
}

export function relativeTime(targetSec: number, nowSec: number): string {
  const diff = targetSec - nowSec
  const abs = Math.abs(diff)
  const unit =
    abs < 3600 ? `${Math.max(1, Math.round(abs / 60))}m` : abs < 86400 ? `${Math.round(abs / 3600)}h` : `${Math.round(abs / 86400)}d`
  return diff >= 0 ? `in ${unit}` : `${unit} ago`
}

/** Convert a value for <input type="datetime-local"> (local time) to unix seconds. */
export const localInputToUnix = (value: string) => Math.floor(new Date(value).getTime() / 1000)

export function unixToLocalInput(sec: number): string {
  const d = new Date(sec * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Short, user-facing text for a failed wallet/contract call. */
export function parseTxError(error: unknown): string | null {
  const e = error as { code?: number; shortMessage?: string; message?: string; cause?: { data?: { errorName?: string }; shortMessage?: string } } | null
  if (!e) return 'Something went wrong. Please try again.'
  const message = `${e.shortMessage ?? ''} ${e.message ?? ''}`.toLowerCase()
  if (e.code === 4001 || message.includes('user rejected') || message.includes('user denied')) return null
  const name = e.cause?.data?.errorName
  const known: Record<string, string> = {
    SoldOut: 'This session is sold out.',
    AlreadyPurchased: 'This wallet already bought a ticket for this session.',
    ExpertCannotPurchase: 'Experts cannot buy tickets to their own sessions.',
    SessionAlreadyStarted: 'Ticket sales and edits close when the session starts.',
    SessionCancelled: 'This session was cancelled.',
    SessionNotEnded: 'This action is available once the session has ended.',
    ScheduleLocked: 'The date and duration are locked once tickets have sold.',
    SoulboundToken: 'This ticket is non-transferable.',
    ExpertNotRegistered: 'Create your expert profile first.',
  }
  if (name && known[name]) return known[name]
  if (message.includes('insufficient') || message.includes('exceeds balance')) return 'Insufficient USDC balance.'
  if (message.includes('network') || message.includes('timeout')) return 'Network issue. Please try again.'
  if (message.includes('reverted')) return 'The transaction was rejected by the contract.'
  return e.shortMessage ?? 'Something went wrong. Please try again.'
}
