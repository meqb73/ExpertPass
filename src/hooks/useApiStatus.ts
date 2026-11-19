import { useQuery } from '@tanstack/react-query'

/**
 * Whether the offchain API (profile photos) is reachable.
 * `null` while checking, `false` on hosts that serve only static files (such as a free static Space).
 */
export function useApiAvailable(): boolean | null {
  const q = useQuery({
    queryKey: ['api-available'],
    queryFn: async (): Promise<boolean> => {
      try {
        const res = await fetch('/api/health', { headers: { accept: 'application/json' } })
        if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return false
        return ((await res.json()) as { ok?: boolean }).ok === true
      } catch {
        return false
      }
    },
    staleTime: 5 * 60_000,
    retry: 0,
  })
  return q.data ?? null
}
