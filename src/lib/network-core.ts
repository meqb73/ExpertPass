import { arc, arcTestnet } from 'viem/chains'

/** Networks the app can run on. Pick one with VITE_CHAIN_ID (5042002 = Arc Testnet, 5042 = Arc Mainnet). */
export const SUPPORTED_CHAINS = [arcTestnet, arc] as const
export type AppChain = (typeof SUPPORTED_CHAINS)[number]

export interface ResolvedChain {
  chain: AppChain
  /** Set when VITE_CHAIN_ID holds an unsupported value; the app refuses to run instead of guessing a network. */
  error: string | null
}

/** Pure so the browser (import.meta.env) and the Node API (process env) read the setting the same way. */
export function resolveChain(raw: string | undefined): ResolvedChain {
  const value = (raw ?? '').trim()
  if (value === '') return { chain: arcTestnet, error: null }
  const match = SUPPORTED_CHAINS.find((c) => String(c.id) === value)
  if (match) return { chain: match, error: null }
  return {
    chain: arcTestnet,
    error: `VITE_CHAIN_ID="${value}" is not supported. Use ${SUPPORTED_CHAINS.map((c) => `${c.id} (${c.name})`).join(' or ')}.`,
  }
}
