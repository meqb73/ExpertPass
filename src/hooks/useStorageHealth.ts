import { useQuery } from '@tanstack/react-query'

export interface StorageHealth {
  backend: string
  encryption: string
  keySource: 'env' | 'file'
  durable: boolean
}

/** Reports how the offchain server keeps profile photos (never any secrets). */
export function useStorageHealth() {
  const q = useQuery({
    queryKey: ['storage-health'],
    queryFn: async (): Promise<StorageHealth | null> => {
      const res = await fetch('/api/health')
      if (!res.ok) return null
      return ((await res.json()) as { storage?: StorageHealth }).storage ?? null
    },
    staleTime: 60_000,
    retry: 0,
  })
  return q.data ?? null
}
