/**
 * Standalone server for production: `bun run server`.
 * In development the same API is mounted inside the Vite dev server (see vite.config.ts).
 */
import { join } from 'node:path'
import type { Address } from 'viem'
import { resolveChain } from '../src/lib/network-core'
import { createApi } from './app'
import { resolveRpcUrls } from './rpc'
import { createStorage } from './storage'

const contractAddress = process.env.VITE_EXPERTPASS_ADDRESS as Address | undefined
if (!contractAddress) {
  console.error('VITE_EXPERTPASS_ADDRESS is not set')
  process.exit(1)
}

const { chain, error: chainError } = resolveChain(process.env.VITE_CHAIN_ID)
if (chainError) {
  console.error(chainError)
  process.exit(1)
}

const api = createApi({
  contractAddress,
  chain,
  rpcUrls: resolveRpcUrls(process.env, chain.id),
  storage: createStorage(process.env, { legacyDir: join(process.cwd(), 'data') }),
})

const port = Number(process.env.PORT ?? 3001)

console.log(`ExpertPass API listening on :${port}`)

// Bun serves a default export that has `port` and `fetch`.
export default {
  port,
  fetch(req: Request, srv: { requestIP(r: Request): { address: string } | null }) {
    const key = req.headers.get('x-forwarded-for') ?? srv.requestIP(req)?.address ?? 'local'
    return api.handle(req, key)
  },
}
