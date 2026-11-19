import { randomBytes } from 'node:crypto'
import { accessSync, constants, existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { LinkCipher, parseKey } from './crypto'
import { FileBlobStore } from './file'
import { BlobMetaRepo, type MetaRepo } from './meta'
import { PgMetaRepo } from './postgres'
import { S3BlobStore } from './s3'
import type { BlobStore } from './types'

export type Env = Record<string, string | undefined>

export interface StorageInfo {
  /** "<metadata>+<files>", for example "postgres+s3" or "json+file". */
  backend: string
  encryption: 'aes-256-gcm'
  /** Where the encryption key comes from: a secret in the environment (recommended) or a local key file. */
  keySource: 'env' | 'file'
  /** True when data lives on a mounted persistent volume (or a remote backend) and survives restarts. */
  durable: boolean
}

export interface Storage {
  blobs: BlobStore
  meta: MetaRepo
  cipher: LinkCipher
  info: StorageInfo
}

function writable(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Data directory, in priority order:
 *  1. EXPERTPASS_DATA_DIR
 *  2. /data when it exists and is writable (where Hugging Face mounts persistent storage)
 *  3. ~/.expertpass (outside the project, so it is never committed or uploaded with the source)
 */
export function resolveDataDir(env: Env): { dir: string; persistentVolume: boolean } {
  if (env.EXPERTPASS_DATA_DIR) return { dir: env.EXPERTPASS_DATA_DIR, persistentVolume: env.EXPERTPASS_DURABLE === '1' }
  if (existsSync('/data') && writable('/data')) return { dir: '/data/expertpass', persistentVolume: true }
  return { dir: join(homedir(), '.expertpass'), persistentVolume: env.EXPERTPASS_DURABLE === '1' }
}

async function createBlobStore(env: Env, dataDir: string): Promise<BlobStore> {
  if (env.S3_BUCKET) {
    if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error('S3_BUCKET is set but S3_ACCESS_KEY_ID or S3_SECRET_ACCESS_KEY is missing.')
    }
    return S3BlobStore.connect({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION || 'auto',
      endpoint: env.S3_ENDPOINT || undefined,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE ? env.S3_FORCE_PATH_STYLE !== 'false' : undefined,
      prefix: env.S3_PREFIX || undefined,
    })
  }
  return new FileBlobStore(join(dataDir, 'blobs'))
}

async function loadCipher(env: Env, dataDir: string): Promise<{ cipher: LinkCipher; keySource: 'env' | 'file' }> {
  const previous = (env.EXPERTPASS_ENCRYPTION_KEY_PREVIOUS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
    .map(parseKey)
  if (env.EXPERTPASS_ENCRYPTION_KEY) {
    return { cipher: new LinkCipher(parseKey(env.EXPERTPASS_ENCRYPTION_KEY), previous), keySource: 'env' }
  }
  // Development fallback: a random key kept in a local file next to (but outside) the blobs.
  await mkdir(dataDir, { recursive: true })
  const keyFile = join(dataDir, 'encryption.key')
  let raw: string
  try {
    raw = await readFile(keyFile, 'utf8')
  } catch {
    raw = randomBytes(32).toString('base64')
    await writeFile(keyFile, raw, { mode: 0o600 })
  }
  return { cipher: new LinkCipher(parseKey(raw), previous), keySource: 'file' }
}

/** One-time move of the old in-project ./data folder into the blob store, then delete it from the project. */
async function migrateLegacy(legacyDir: string, blobs: BlobStore): Promise<void> {
  if (!existsSync(join(legacyDir, 'store.json'))) return
  if (await blobs.get('meta/store.json')) {
    console.warn(`[expertpass] ${legacyDir} still exists but the new store already has data; leaving it untouched. Remove it by hand if it is stale.`)
    return
  }
  const copies: [string, Uint8Array][] = [['meta/store.json', new Uint8Array(await readFile(join(legacyDir, 'store.json')))]]
  for (const folder of ['covers', 'avatars']) {
    let names: string[] = []
    try {
      names = await readdir(join(legacyDir, folder))
    } catch {
      /* folder missing */
    }
    for (const name of names) {
      if (name.endsWith('.tmp')) continue
      copies.push([`${folder}/${name.toLowerCase()}`, new Uint8Array(await readFile(join(legacyDir, folder, name)))])
    }
  }
  for (const [key, bytes] of copies) await blobs.put(key, bytes)
  for (const [key, bytes] of copies) {
    const back = await blobs.get(key)
    if (!back || back.length !== bytes.length) throw new Error(`Migration check failed for ${key}; legacy data kept.`)
  }
  await rm(legacyDir, { recursive: true, force: true })
  console.warn(`[expertpass] Moved ${copies.length} stored files out of the project into the data directory.`)
}

export interface CreateStorageOptions {
  /** Old in-project data folder to move into the store (file backend only). */
  legacyDir?: string
}

/**
 * Picks the storage backends from environment variables:
 *  - DATABASE_URL            -> links and image records in Postgres (otherwise a JSON file in the blob store)
 *  - S3_BUCKET (+ S3_*)      -> image files in an S3-compatible bucket (otherwise local files)
 *  - EXPERTPASS_ENCRYPTION_KEY is required whenever either of the above is set, because a key kept on a local
 *    disk would be lost in the same reset the remote storage is meant to survive.
 */
export async function createStorage(env: Env, opts: CreateStorageOptions = {}): Promise<Storage> {
  const { dir, persistentVolume } = resolveDataDir(env)
  const remote = Boolean(env.DATABASE_URL || env.S3_BUCKET)
  if (remote && !env.EXPERTPASS_ENCRYPTION_KEY) {
    throw new Error('EXPERTPASS_ENCRYPTION_KEY is required when DATABASE_URL or S3_BUCKET is set. Generate one with: openssl rand -base64 32')
  }
  const blobs = await createBlobStore(env, dir)
  const { cipher, keySource } = await loadCipher(env, dir)
  const meta: MetaRepo = env.DATABASE_URL
    ? await PgMetaRepo.connect(env.DATABASE_URL, { ssl: env.DATABASE_SSL !== 'disable' })
    : new BlobMetaRepo(blobs, cipher)
  if (meta.kind === 'json' && blobs.kind === 'file' && opts.legacyDir) await migrateLegacy(opts.legacyDir, blobs)
  await meta.ping()
  const durable = blobs.kind !== 'file' || persistentVolume
  const info: StorageInfo = { backend: `${meta.kind}+${blobs.kind}`, encryption: 'aes-256-gcm', keySource, durable }
  if (meta.kind === 'postgres' && !durable) {
    console.warn('[expertpass] Links are in Postgres, but images are on local disk and will be lost on reset. Set S3_BUCKET to keep them.')
  }
  if (keySource === 'file' && env.NODE_ENV === 'production') {
    console.warn('[expertpass] EXPERTPASS_ENCRYPTION_KEY is not set; using a local key file. Set it as a secret so links stay readable after a reset.')
  }
  return { blobs, meta, cipher, info }
}
