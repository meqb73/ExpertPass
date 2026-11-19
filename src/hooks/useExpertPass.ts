import { useMemo } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { useQuery } from '@tanstack/react-query'
import { expertPassAbi } from '@/contracts/expertPassAbi'
import { CHAIN_ID, EXPERT_PASS_ADDRESS, USDC_ADDRESS } from '@/lib/constants'
import { fetchAvatarMeta } from '@/lib/api'
import type { ExpertProfile, Session, SessionMeta } from '@/lib/types'

const POLL = 15_000
const PAGE = 200n
export const CERT_OFFSET = 1n << 128n
export const certificateId = (sessionId: bigint) => CERT_OFFSET + sessionId

const contract = { address: EXPERT_PASS_ADDRESS as Address, abi: expertPassAbi, chainId: CHAIN_ID } as const

export function useSessions() {
  const count = useReadContract({
    ...contract,
    functionName: 'sessionCount',
    query: { enabled: Boolean(EXPERT_PASS_ADDRESS), refetchInterval: POLL },
  })
  const total = count.data ?? 0n
  const from = total > PAGE ? total - PAGE + 1n : 1n
  const list = useReadContract({
    ...contract,
    functionName: 'getSessions',
    args: [from, PAGE],
    query: { enabled: Boolean(EXPERT_PASS_ADDRESS) && total > 0n, refetchInterval: POLL },
  })

  const sessions = useMemo<Session[]>(() => {
    if (!list.data) return []
    return list.data
      .map((s, i) => ({ ...s, id: from + BigInt(i) }))
      .reverse() // newest first
  }, [list.data, from])

  return {
    sessions,
    isLoading: count.isLoading || (total > 0n && list.isLoading),
    isError: count.isError || list.isError,
    refetch: async () => {
      await count.refetch()
      await list.refetch()
    },
  }
}

export function useSession(id: bigint | null) {
  const res = useReadContract({
    ...contract,
    functionName: 'getSession',
    args: id === null ? undefined : [id],
    query: { enabled: id !== null && Boolean(EXPERT_PASS_ADDRESS), refetchInterval: POLL },
  })
  const session = useMemo<Session | null>(() => (res.data && id !== null ? { ...res.data, id } : null), [res.data, id])
  return { session, isLoading: res.isLoading, isError: res.isError, refetch: res.refetch }
}

export function useExperts(addresses: Address[]) {
  const unique = useMemo(() => Array.from(new Set(addresses.map((a) => a.toLowerCase()))) as Address[], [addresses])
  const res = useReadContracts({
    contracts: unique.map((a) => ({ ...contract, functionName: 'getExpert' as const, args: [a] as const })),
    query: { enabled: unique.length > 0 && Boolean(EXPERT_PASS_ADDRESS), refetchInterval: 60_000 },
  })
  return useMemo(() => {
    const map = new Map<string, ExpertProfile>()
    unique.forEach((a, i) => {
      const r = res.data?.[i]
      if (r?.status === 'success') map.set(a, r.result)
    })
    return map
  }, [res.data, unique])
}

export function useMyExpertProfile() {
  const { address } = useAccount()
  const res = useReadContract({
    ...contract,
    functionName: 'getExpert',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && Boolean(EXPERT_PASS_ADDRESS) },
  })
  return { profile: (res.data) ?? null, isLoading: res.isLoading, refetch: res.refetch }
}

/**
 * Cover image URL per session, read from the contract (public https URL, or none).
 * Returned as `meta[id].cover` (string or null) so cards can pass it straight to <Cover />.
 */
export function useSessionMeta(ids: bigint[]) {
  const q = useReadContracts({
    contracts: ids.map((id) => ({ ...contract, functionName: 'getCoverUrl', args: [id] }) as const),
    query: { enabled: ids.length > 0 && Boolean(EXPERT_PASS_ADDRESS), refetchInterval: 30_000 },
  })
  const meta: Record<string, SessionMeta> = {}
  ids.forEach((id, i) => {
    const r = q.data?.[i]
    const url = r?.status === 'success' && typeof r.result === 'string' ? r.result : ''
    meta[id.toString()] = { cover: url || null }
  })
  return { meta, refetch: q.refetch }
}

/** One session's current cover URL, for the edit form. */
export function useCoverUrl(id: bigint | null) {
  const q = useReadContract({
    ...contract,
    functionName: 'getCoverUrl',
    args: id === null ? undefined : [id],
    query: { enabled: id !== null && Boolean(EXPERT_PASS_ADDRESS), staleTime: 30_000 },
  })
  return { coverUrl: q.data ?? '', isLoading: q.isLoading }
}

/** Avatar versions (lowercase address -> version). Missing entries mean "no uploaded avatar". */
export function useAvatars(addresses: string[]) {
  const unique = useMemo(() => Array.from(new Set(addresses.map((a) => a.toLowerCase()))).sort(), [addresses])
  const q = useQuery({
    queryKey: ['avatar-meta', unique.join(',')],
    queryFn: () => fetchAvatarMeta(unique),
    enabled: unique.length > 0,
    refetchInterval: 60_000,
    retry: 1,
  })
  return (q.data ?? {})
}

/** Ticket and certificate balances of the connected wallet for the given sessions. */
export function useMyBalances(sessionIds: bigint[]) {
  const { address } = useAccount()
  const ids = useMemo(() => [...sessionIds, ...sessionIds.map(certificateId)], [sessionIds])
  const res = useReadContract({
    ...contract,
    functionName: 'balanceOfBatch',
    args: address ? [ids.map(() => address), ids] : undefined,
    query: { enabled: Boolean(address) && ids.length > 0 && Boolean(EXPERT_PASS_ADDRESS), refetchInterval: POLL },
  })
  return useMemo(() => {
    const tickets = new Map<string, bigint>()
    const certs = new Map<string, bigint>()
    if (res.data) {
      sessionIds.forEach((id, i) => {
        tickets.set(id.toString(), res.data?.[i] ?? 0n)
        certs.set(id.toString(), res.data?.[sessionIds.length + i] ?? 0n)
      })
    }
    return { tickets, certs, isLoading: res.isLoading, refetch: res.refetch }
  }, [res.data, res.isLoading, res.refetch, sessionIds])
}

export function useUsdc() {
  const { address } = useAccount()
  const balance = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(address), refetchInterval: POLL },
  })
  const allowance = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && EXPERT_PASS_ADDRESS ? [address, EXPERT_PASS_ADDRESS] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(address) && Boolean(EXPERT_PASS_ADDRESS), refetchInterval: POLL },
  })
  return {
    balance: balance.data,
    allowance: allowance.data,
    refetch: async () => {
      await Promise.all([balance.refetch(), allowance.refetch()])
    },
  }
}

export function useParticipants(sessionId: bigint | null, enabled: boolean) {
  const count = useReadContract({
    ...contract,
    functionName: 'participantCount',
    args: sessionId === null ? undefined : [sessionId],
    query: { enabled: enabled && sessionId !== null },
  })
  const n = count.data ?? 0n
  const list = useReadContract({
    ...contract,
    functionName: 'getParticipants',
    args: sessionId === null ? undefined : [sessionId, 0n, n > 100n ? 100n : n],
    query: { enabled: enabled && sessionId !== null && n > 0n },
  })
  return { participants: (list.data as Address[] | undefined) ?? [], total: Number(n) }
}

/** Refund status of the connected wallet for the given (cancelled) sessions. */
export function useMyRefunds(sessionIds: bigint[]) {
  const { address } = useAccount()
  const res = useReadContracts({
    contracts: sessionIds.flatMap((id) => [
      { ...contract, functionName: 'refundedAmount' as const, args: [id, address as Address] as const },
      { ...contract, functionName: 'purchased' as const, args: [id, address as Address] as const },
    ]),
    query: { enabled: Boolean(address) && sessionIds.length > 0 && Boolean(EXPERT_PASS_ADDRESS), refetchInterval: POLL },
  })
  return useMemo(() => {
    const map = new Map<string, { refunded: bigint; purchased: boolean }>()
    sessionIds.forEach((id, i) => {
      const r = res.data?.[i * 2]
      const p = res.data?.[i * 2 + 1]
      map.set(id.toString(), {
        refunded: r?.status === 'success' ? (r.result as bigint) : 0n,
        purchased: p?.status === 'success' ? (p.result as boolean) : false,
      })
    })
    return { refunds: map, isLoading: res.isLoading }
  }, [res.data, res.isLoading, sessionIds])
}

/** How many participants a cancelled session has not yet examined for automatic refunds. */
export function useRefundsPending(sessionId: bigint, enabled: boolean) {
  const res = useReadContract({
    ...contract,
    functionName: 'refundsPending',
    args: [sessionId],
    query: { enabled: enabled && Boolean(EXPERT_PASS_ADDRESS), refetchInterval: POLL },
  })
  return Number(res.data ?? 0n)
}

/**
 * The session's event link, read from the contract. It is public chain data; the app only shows it to ticket
 * holders and the host.
 */
export function useEventLink(id: bigint | null, enabled = true) {
  const q = useReadContract({
    ...contract,
    functionName: 'getEventLink',
    args: id === null ? undefined : [id],
    query: { enabled: enabled && id !== null && Boolean(EXPERT_PASS_ADDRESS), staleTime: 30_000 },
  })
  return { link: q.data ?? null, isLoading: q.isLoading }
}
