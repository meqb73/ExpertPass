/**
 * Minimal contract every storage backend must satisfy. Keys look like "covers/3.jpg" or "meta/store.json"
 * (lowercase letters, digits, "/", "_", "-", "."). Backends must make `put` atomic: a reader never sees a
 * half-written value.
 *
 * To move off local disk (S3, R2, GCS, a database blob column...) implement this interface and register it in
 * `createBlobStore` in ./index.ts. Nothing else in the API needs to change.
 */
export interface BlobStore {
  /** Short name, reported by /api/health (never contains credentials). */
  readonly kind: string
  get(key: string): Promise<Uint8Array | null>
  put(key: string, bytes: Uint8Array): Promise<void>
  delete(key: string): Promise<void>
  /** Keys under a prefix, used by backup/export. */
  list(prefix: string): Promise<string[]>
}

export const KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]{0,200}$/i

export function assertValidKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes('..') || key.includes('//') || key.endsWith('/')) {
    throw new Error(`Invalid storage key: ${key}`)
  }
}
