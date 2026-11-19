/**
 * Backup, restore, key rotation and migration for ExpertPass offchain data. Works with any storage backend.
 *
 *   bun run storage:export backup.json     write all links (still encrypted), image records and image files to one bundle
 *   bun run storage:import backup.json     restore a bundle into the configured storage
 *   bun run storage:rotate                 re-encrypt every link with the active EXPERTPASS_ENCRYPTION_KEY
 *   bun run storage:migrate                copy data from local disk into the configured Postgres / S3 storage
 *
 * A bundle holds links only as ciphertext, so it is useless without the encryption key. Keep the key and the
 * bundle in different places.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { createStorage, type Storage } from '../server/storage'
import type { ImageEntry } from '../server/storage/meta'

interface Bundle {
  version: 2
  createdAt: string
  links: Array<{ id: string; enc: string; updatedAt: number }>
  covers: Array<ImageEntry & { id: string }>
  avatars: Array<ImageEntry & { id: string }>
  files: Record<string, string>
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

async function snapshot(storage: Storage): Promise<Bundle> {
  const [links, covers, avatars] = await Promise.all([storage.meta.listLinks(), storage.meta.listCovers(), storage.meta.listAvatars()])
  const files: Record<string, string> = {}
  for (const c of covers) {
    const bytes = await storage.blobs.get(`covers/${c.id}.${c.ext}`)
    if (bytes) files[`covers/${c.id}.${c.ext}`] = b64(bytes)
  }
  for (const a of avatars) {
    const bytes = await storage.blobs.get(`avatars/${a.id}.${a.ext}`)
    if (bytes) files[`avatars/${a.id}.${a.ext}`] = b64(bytes)
  }
  return { version: 2, createdAt: new Date().toISOString(), links, covers, avatars, files }
}

async function restore(storage: Storage, bundle: Bundle, reencrypt?: (id: string, enc: string) => string) {
  for (const [key, data] of Object.entries(bundle.files)) await storage.blobs.put(key, new Uint8Array(Buffer.from(data, 'base64')))
  for (const c of bundle.covers) await storage.meta.setCover(c.id, { mime: c.mime, ext: c.ext, updatedAt: c.updatedAt })
  for (const a of bundle.avatars) await storage.meta.setAvatar(a.id, { mime: a.mime, ext: a.ext, updatedAt: a.updatedAt })
  for (const l of bundle.links) await storage.meta.setLink(l.id, reencrypt ? reencrypt(l.id, l.enc) : l.enc)
}

const [command, file] = process.argv.slice(2)

if (command === 'export' && file) {
  const storage = await createStorage(process.env)
  const bundle = await snapshot(storage)
  await writeFile(file, JSON.stringify(bundle, null, 2), { mode: 0o600 })
  console.log(`Exported ${bundle.links.length} links, ${bundle.covers.length} covers, ${bundle.avatars.length} avatars to ${file}`)
} else if (command === 'import' && file) {
  const bundle = JSON.parse(await readFile(file, 'utf8')) as Bundle
  if (bundle.version !== 2) throw new Error('Not an ExpertPass backup bundle (version 2 expected)')
  const storage = await createStorage(process.env)
  await restore(storage, bundle)
  console.log(`Imported ${bundle.links.length} links, ${bundle.covers.length} covers, ${bundle.avatars.length} avatars.`)
} else if (command === 'rotate') {
  const storage = await createStorage(process.env)
  let rotated = 0
  for (const entry of await storage.meta.listLinks()) {
    if (!storage.cipher.needsRotation(entry.enc)) continue
    const aad = `link:${entry.id}`
    await storage.meta.setLink(entry.id, storage.cipher.encrypt(storage.cipher.decrypt(entry.enc, aad), aad))
    rotated++
  }
  console.log(`Re-encrypted ${rotated} links with key ${storage.cipher.activeId}`)
} else if (command === 'migrate') {
  // Source: local disk, using its own key (EXPERTPASS_SOURCE_ENCRYPTION_KEY, or the generated key file).
  // Target: whatever DATABASE_URL / S3_* / EXPERTPASS_ENCRYPTION_KEY point at.
  const target = await createStorage(process.env)
  if (target.info.backend === 'json+file') throw new Error('Nothing to migrate to: set DATABASE_URL and/or S3_BUCKET (and EXPERTPASS_ENCRYPTION_KEY) first.')
  const sourceEnv = {
    EXPERTPASS_DATA_DIR: process.env.EXPERTPASS_DATA_DIR,
    EXPERTPASS_DURABLE: process.env.EXPERTPASS_DURABLE,
    EXPERTPASS_ENCRYPTION_KEY: process.env.EXPERTPASS_SOURCE_ENCRYPTION_KEY,
  }
  const source = await createStorage(sourceEnv)
  const bundle = await snapshot(source)
  await restore(target, bundle, (id, enc) => target.cipher.encrypt(source.cipher.decrypt(enc, `link:${id}`), `link:${id}`))
  console.log(`Migrated ${bundle.links.length} links, ${bundle.covers.length} covers, ${bundle.avatars.length} avatars to ${target.info.backend}.`)
  console.log('The local copy was left in place. Delete it once you have checked the new storage.')
} else {
  console.error('Usage: storage-backup <export FILE | import FILE | rotate | migrate>')
  process.exit(1)
}
process.exit(0)
