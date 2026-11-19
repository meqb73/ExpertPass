import type { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import type { Plugin } from 'vite'
import type { Address } from 'viem'
import { resolveChain } from '../src/lib/network-core'
import { createApi } from './app'
import { resolveRpcUrls } from './rpc'
import { createStorage } from './storage'

/** Mounts the ExpertPass offchain API at /api inside the Vite dev/preview server. */
export function expertPassApi(env: Record<string, string>, legacyDataDir: string): Plugin {
  const contractAddress = env.VITE_EXPERTPASS_ADDRESS as Address | undefined
  const { chain, error: chainError } = resolveChain(env.VITE_CHAIN_ID)
  if (chainError) console.error(`[expertpass-api] ${chainError}`)
  const api =
    contractAddress && !chainError
      ? createApi({
          contractAddress,
          chain,
          rpcUrls: resolveRpcUrls(env, chain.id),
          storage: createStorage({ ...env, NODE_ENV: process.env.NODE_ENV }, { legacyDir: legacyDataDir }),
        })
      : null

  const toRequest = (req: IncomingMessage): Request => {
    const host = req.headers.host ?? 'localhost'
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers.set(k, v)
    }
    return new Request(`http://${host}${req.url ?? '/'}`, {
      method: req.method,
      headers,
      body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
      // @ts-expect-error duplex is required by Node for streamed bodies
      duplex: hasBody ? 'half' : undefined,
    })
  }

  const mount = (middlewares: { use: (path: string, fn: (req: IncomingMessage, res: import('node:http').ServerResponse) => void) => void }) => {
    middlewares.use('/api', (req, res) => {
      if (!api) {
        res.statusCode = 503
        res.end(JSON.stringify({ error: chainError ?? 'VITE_EXPERTPASS_ADDRESS is not set' }))
        return
      }
      const original = req.url ?? '/'
      const key = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'local')
      // connect strips the mount path; the API expects the /api prefix.
      req.url = `/api${original}`
      api
        .handle(toRequest(req), key)
        .then(async (response) => {
          res.statusCode = response.status
          response.headers.forEach((value, name) => res.setHeader(name, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        })
        .catch((error: unknown) => {
          console.error('[expertpass-api]', error)
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'Internal error' }))
        })
    })
  }

  return {
    name: 'expertpass-api',
    configureServer(server) {
      mount(server.middlewares)
    },
    configurePreviewServer(server) {
      mount(server.middlewares)
    },
  }
}
