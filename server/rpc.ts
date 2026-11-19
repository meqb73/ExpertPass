import { getChain } from '../src/onchain-facts'

/**
 * RPC endpoints in priority order. On Arc Testnet, Arc Studio's keyed proxy comes first when it covers the
 * chain (its token is short-lived, so it is only a first choice). Arc Mainnet always uses the public endpoints
 * from the facts registry.
 */
export function resolveRpcUrls(env: Record<string, string | undefined>, chainId: number): string[] {
  const urls: string[] = []
  const chains = (env.RPC_PROXY_CHAINS ?? '').split(',')
  if (chainId === 5042002 && env.RPC_PROXY_BASE_URL && env.RPC_PROXY_TOKEN && chains.indexOf('Arc_Testnet') !== -1) {
    urls.push(`${env.RPC_PROXY_BASE_URL}/api/rpc/Arc_Testnet?_rpc_token=${env.RPC_PROXY_TOKEN}`)
  }
  urls.push(...(getChain(chainId)?.rpcUrls ?? []))
  if (urls.length === 0) throw new Error(`No RPC endpoint is registered for chain ${chainId}`)
  return urls
}
