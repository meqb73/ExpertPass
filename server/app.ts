/**
 * ExpertPass offchain API.
 *
 * Stores what is too personal for the chain: expert avatars.
 * (Event links and cover image URLs live onchain with the session; see ExpertPass.getEventLink / getCoverUrl.)
 *
 * Web-standard Request/Response so it runs both inside the Vite dev server and under Bun.
 */
import { createHash } from 'node:crypto'
import { createPublicClient, fallback, getAddress, http, isAddress, type Address, type Chain, type Hex, type PublicClient } from 'viem'
import { arcTestnet } from 'viem/chains'
import { expertPassAbi } from '../src/contracts/expertPassAbi'
import type { Storage } from './storage'
import {
  MAX_AVATAR_BYTES,
  avatarSetMessage,
  MESSAGE_TTL_SECONDS,
} from '../src/lib/messages'

export interface ApiOptions {
  contractAddress: Address
  rpcUrls: string[]
  /** Where avatars live. See server/storage. */
  storage: Storage | Promise<Storage>
  /** Chain the contract is deployed on. Signed messages are bound to its id. Defaults to Arc Testnet. */
  chain?: Chain
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  })

const fail = (status: number, error: string) => json({ error }, status)

function detectImage(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length > 12) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mime: 'image/png', ext: 'png' }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return { mime: 'image/gif', ext: 'gif' }
    const riff = String.fromCharCode(...bytes.slice(0, 4))
    const webp = String.fromCharCode(...bytes.slice(8, 12))
    if (riff === 'RIFF' && webp === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  }
  return null
}

export function createApi(opts: ApiOptions) {
  const chain = opts.chain ?? arcTestnet
  const client: PublicClient = createPublicClient({ chain, transport: fallback(opts.rpcUrls.map((u) => http(u))) })

  // Tiny in-memory limiter for write/auth endpoints.
  const hits = new Map<string, { count: number; reset: number }>()
  function limited(key: string): boolean {
    const now = Date.now()
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
    }
    const entry = hits.get(key)
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + 60_000 })
      return false
    }
    entry.count += 1
    return entry.count > 40
  }

  async function signatureValid(address: Address, message: string, signature: Hex) {
    try {
      return await client.verifyMessage({ address, message, signature })
    } catch {
      return false
    }
  }

  const freshTimestamp = (ts: unknown): ts is number => {
    if (typeof ts !== 'number' || !Number.isInteger(ts)) return false
    const now = Math.floor(Date.now() / 1000)
    return ts <= now + 60 && now - ts <= MESSAGE_TTL_SECONDS
  }

  async function handle(req: Request, clientKey: string): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname.replace(/^\/api/, '') || '/'
    const parts = path.split('/').filter(Boolean)
    let st: Storage
    try {
      st = await opts.storage
    } catch (error) {
      console.error('[expertpass] storage is not available:', error instanceof Error ? error.message : error)
      return fail(503, 'Storage is not configured correctly. Check the server logs.')
    }
    const chainId = chain.id
    const imageHeaders = (mime: string) => ({
      'content-type': mime,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': 'public, max-age=31536000, immutable',
    })

    if (req.method === 'GET' && path === '/health') {
      const reachable = await st.meta.ping().then(() => true, () => false)
      return json({ ok: reachable, contract: opts.contractAddress, storage: st.info }, reachable ? 200 : 503)
    }

    // GET /avatar-meta?addresses=a,b -> { meta: { "0xlower": updatedAt } }
    if (req.method === 'GET' && path === '/avatar-meta') {
      const list = (url.searchParams.get('addresses') ?? '').split(',').filter(Boolean).slice(0, 300)
      const keys = list.filter((a) => isAddress(a)).map((a) => a.toLowerCase())
      try {
        return json({ meta: await st.meta.avatarVersions(keys) })
      } catch (error) {
        console.error('[expertpass] avatar lookup failed:', error instanceof Error ? error.message : error)
        return fail(503, 'Storage is temporarily unavailable')
      }
    }

    // GET /avatars/:address
    if (req.method === 'GET' && parts[0] === 'avatars' && parts.length === 2) {
      const key = (parts[1] ?? '').toLowerCase()
      const entry = isAddress(key) ? await st.meta.getAvatar(key).catch(() => null) : null
      if (!entry) return fail(404, 'No avatar')
      const data = await st.blobs.get(`avatars/${key}.${entry.ext}`).catch(() => null)
      return data ? new Response(new Uint8Array(data), { headers: imageHeaders(entry.mime) }) : fail(404, 'No avatar')
    }

    if (limited(clientKey) && req.method !== 'GET') return fail(429, 'Too many requests')

    // PUT /avatars/:address?ts=...&signature=...   body: image bytes. Signer must be the address itself, a registered expert.
    if (req.method === 'PUT' && parts[0] === 'avatars' && parts.length === 2) {
      const address = parts[1] ?? ''
      const signature = (url.searchParams.get('signature') ?? '') as Hex
      const ts = Number(url.searchParams.get('ts'))
      if (!isAddress(address) || !freshTimestamp(ts)) return fail(400, 'Bad request')
      const bytes = new Uint8Array(await req.arrayBuffer())
      if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) return fail(413, 'Avatar must be under 512 KB')
      const image = detectImage(bytes)
      if (!image) return fail(415, 'Avatar must be a PNG, JPEG, WebP or GIF image')
      const checksummed = getAddress(address)
      let registered = false
      try {
        const profile = await client.readContract({ address: opts.contractAddress, abi: expertPassAbi, functionName: 'getExpert', args: [checksummed] })
        registered = profile.registered
      } catch {
        return fail(502, 'Could not verify the expert profile. Try again.')
      }
      if (!registered) return fail(403, 'Create your expert profile first')
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const message = avatarSetMessage({ chainId, contract: opts.contractAddress, address: checksummed, issuedAt: ts, sha256 })
      if (!(await signatureValid(checksummed, message, signature))) return fail(401, 'Invalid signature')
      const key = checksummed.toLowerCase()
      const entry = { ...image, updatedAt: Date.now() }
      try {
        const previousAvatar = await st.meta.getAvatar(key)
        await st.blobs.put(`avatars/${key}.${image.ext}`, bytes)
        await st.meta.setAvatar(key, entry)
        if (previousAvatar && previousAvatar.ext !== image.ext) await st.blobs.delete(`avatars/${key}.${previousAvatar.ext}`).catch(() => undefined)
      } catch (error) {
        console.error('[expertpass] could not save avatar:', error instanceof Error ? error.message : error)
        return fail(503, 'Could not save the avatar. Try again.')
      }
      return json({ ok: true, version: entry.updatedAt })
    }

    return fail(404, 'Not found')
  }

  return { handle }
}
