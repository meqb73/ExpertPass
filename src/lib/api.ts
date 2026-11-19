import type { Address, Hex } from 'viem'

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (body === null) throw new Error(res.ok ? 'The server returned an unexpected response' : `Request failed (${res.status})`)
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body
}

export async function fetchAvatarMeta(addresses: string[]): Promise<Record<string, number>> {
  if (addresses.length === 0) return {}
  const res = await fetch(`/api/avatar-meta?addresses=${addresses.join(',')}`)
  return (await parse<{ meta: Record<string, number> }>(res)).meta
}

export const avatarUrl = (address: string, version: number) => `/api/avatars/${address.toLowerCase()}?v=${version}`

export async function putAvatar(address: Address, p: { blob: Blob; ts: number; signature: Hex }) {
  const q = new URLSearchParams({ ts: String(p.ts), signature: p.signature })
  const res = await fetch(`/api/avatars/${address}?${q.toString()}`, { method: 'PUT', body: p.blob })
  await parse<{ ok: true }>(res)
}

/** Centre-crop to a square and downscale to 256px JPEG. */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file')
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process the image')
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  if (!blob) throw new Error('Could not process the image')
  return blob
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Downscale and re-encode an image so covers stay small (max 1280px wide, JPEG). */
