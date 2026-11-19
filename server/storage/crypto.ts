import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const PREFIX = 'enc:v1:'

/** Short, non-secret fingerprint of a key, stored next to each ciphertext so the right key can be picked. */
export const keyId = (key: Buffer) => createHash('sha256').update(key).digest('hex').slice(0, 8)

/** Accepts a 32-byte key as 64 hex characters or base64/base64url. */
export function parseKey(raw: string): Buffer {
  const value = raw.trim()
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64')
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes (64 hex characters or base64).')
  return key
}

/**
 * AES-256-GCM for private event links. Each value gets a fresh random IV, and the session id is bound in as
 * authenticated data, so a ciphertext cannot be copied onto another session without detection.
 * Previous keys stay readable for rotation; new writes always use the active key.
 */
export class LinkCipher {
  readonly activeId: string
  private readonly keys = new Map<string, Buffer>()

  constructor(
    private readonly active: Buffer,
    previous: Buffer[] = [],
  ) {
    this.activeId = keyId(active)
    this.keys.set(this.activeId, active)
    for (const key of previous) this.keys.set(keyId(key), key)
  }

  encrypt(plain: string, aad: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.active, iv)
    cipher.setAAD(Buffer.from(aad))
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `${PREFIX}${this.activeId}:${Buffer.concat([iv, tag, data]).toString('base64url')}`
  }

  decrypt(token: string, aad: string): string {
    if (!token.startsWith(PREFIX)) throw new Error('Not an encrypted value')
    const [id, body] = token.slice(PREFIX.length).split(':')
    const key = id ? this.keys.get(id) : undefined
    if (!key || !body) throw new Error(`No key available for key id ${id ?? '?'}`)
    const raw = Buffer.from(body, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
    decipher.setAAD(Buffer.from(aad))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
  }

  /** True when the value was written with a key other than the active one. */
  needsRotation(token: string): boolean {
    return token.startsWith(PREFIX) && token.slice(PREFIX.length).split(':')[0] !== this.activeId
  }
}

export const isEncrypted = (value: string) => value.startsWith(PREFIX)
