/**
 * Self-contained checks for the storage layer. Run with: bun run storage:test
 * Uses a temporary directory and never touches real data.
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LinkCipher, parseKey } from './crypto'
import { FileBlobStore } from './file'
import { createStorage } from './index'

let passed = 0
const test = async (name: string, fn: () => Promise<void> | void) => {
  await fn()
  passed++
  console.log(`ok  ${name}`)
}

const root = await mkdtemp(join(tmpdir(), 'expertpass-storage-'))
const bytes = (s: string) => new TextEncoder().encode(s)
const text = (b: Uint8Array | null) => (b ? new TextDecoder().decode(b) : null)

try {
  await test('blob store: put, get, overwrite, delete, list', async () => {
    const store = new FileBlobStore(join(root, 'a'))
    assert.equal(await store.get('covers/1.jpg'), null)
    await store.put('covers/1.jpg', bytes('one'))
    await store.put('covers/2.png', bytes('two'))
    await store.put('covers/1.jpg', bytes('uno'))
    assert.equal(text(await store.get('covers/1.jpg')), 'uno')
    assert.deepEqual(await store.list('covers/'), ['covers/1.jpg', 'covers/2.png'])
    await store.delete('covers/1.jpg')
    assert.equal(await store.get('covers/1.jpg'), null)
  })

  await test('blob store: rejects path traversal and odd keys', async () => {
    const store = new FileBlobStore(join(root, 'b'))
    for (const key of ['../x', 'a/../../x', '/etc/passwd', 'a//b', 'a/', '', 'a b']) {
      await assert.rejects(() => store.put(key, bytes('x')), /Invalid storage key/, key)
    }
  })

  await test('cipher: round trip, unique ciphertexts, bound to the session id', () => {
    const cipher = new LinkCipher(randomBytes(32))
    const a = cipher.encrypt('https://meet.google.com/abc', 'link:1')
    const b = cipher.encrypt('https://meet.google.com/abc', 'link:1')
    assert.notEqual(a, b)
    assert.equal(cipher.decrypt(a, 'link:1'), 'https://meet.google.com/abc')
    assert.ok(!a.includes('meet.google.com'))
    assert.throws(() => cipher.decrypt(a, 'link:2'))
  })

  await test('cipher: tampering and wrong keys are rejected', () => {
    const cipher = new LinkCipher(randomBytes(32))
    const token = cipher.encrypt('https://zoom.us/j/1', 'link:1')
    const flipped = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA')
    assert.throws(() => cipher.decrypt(flipped, 'link:1'))
    assert.throws(() => new LinkCipher(randomBytes(32)).decrypt(token, 'link:1'))
  })

  await test('cipher: key rotation keeps old links readable', () => {
    const oldKey = randomBytes(32)
    const newKey = randomBytes(32)
    const token = new LinkCipher(oldKey).encrypt('https://zoom.us/j/9', 'link:9')
    const rotated = new LinkCipher(newKey, [oldKey])
    assert.equal(rotated.decrypt(token, 'link:9'), 'https://zoom.us/j/9')
    assert.ok(rotated.needsRotation(token))
    assert.ok(!rotated.needsRotation(rotated.encrypt('x', 'link:9')))
  })

  await test('cipher: key parsing accepts hex and base64, rejects bad lengths', () => {
    const key = randomBytes(32)
    assert.deepEqual(parseKey(key.toString('hex')), key)
    assert.deepEqual(parseKey(key.toString('base64')), key)
    assert.throws(() => parseKey('short'))
  })

  await test('storage: legacy ./data folder is moved, links are encrypted, folder removed', async () => {
    const legacy = join(root, 'project', 'data')
    await mkdir(join(legacy, 'covers'), { recursive: true })
    await mkdir(join(legacy, 'avatars'), { recursive: true })
    await writeFile(
      join(legacy, 'store.json'),
      JSON.stringify({
        links: { '7': { link: 'https://meet.google.com/old-link', updatedAt: 1 } },
        covers: { '7': { mime: 'image/jpeg', ext: 'jpg', updatedAt: 2 } },
        avatars: {},
      }),
    )
    await writeFile(join(legacy, 'covers', '7.jpg'), bytes('image-bytes'))
    const dataDir = join(root, 'durable')
    const storage = await createStorage({ EXPERTPASS_DATA_DIR: dataDir }, { legacyDir: legacy })
    const link = await storage.meta.getLink('7')
    assert.equal(storage.cipher.decrypt(link?.enc ?? '', 'link:7'), 'https://meet.google.com/old-link')
    assert.equal((await storage.meta.getCover('7'))?.ext, 'jpg')
    assert.equal(text(await storage.blobs.get('covers/7.jpg')), 'image-bytes')
    const onDisk = await readFile(join(dataDir, 'blobs', 'meta', 'store.json'), 'utf8')
    assert.ok(!onDisk.includes('old-link') && !onDisk.includes('meet.google.com'))
    await assert.rejects(() => readFile(join(legacy, 'store.json')), /ENOENT/)
  })

  await test('storage: env key is used and reported; same key reads data after a restart', async () => {
    const dataDir = join(root, 'env-key')
    const env = { EXPERTPASS_DATA_DIR: dataDir, EXPERTPASS_ENCRYPTION_KEY: randomBytes(32).toString('base64') }
    const first = await createStorage(env)
    assert.equal(first.info.keySource, 'env')
    await first.meta.setLink('3', first.cipher.encrypt('https://zoom.us/j/3', 'link:3'))
    const second = await createStorage(env)
    assert.equal(second.cipher.decrypt((await second.meta.getLink('3'))?.enc ?? '', 'link:3'), 'https://zoom.us/j/3')
    assert.deepEqual([...(await second.meta.linkIds(['3', '4']))], ['3'])
  })

  await test('storage: remote backends refuse to start without an encryption key', async () => {
    const dir = { EXPERTPASS_DATA_DIR: join(root, 'x') }
    await assert.rejects(() => createStorage({ ...dir, DATABASE_URL: 'postgres://u:p@localhost/db' }), /EXPERTPASS_ENCRYPTION_KEY is required/)
    await assert.rejects(() => createStorage({ ...dir, S3_BUCKET: 'b' }), /EXPERTPASS_ENCRYPTION_KEY is required/)
    const key = randomBytes(32).toString('base64')
    await assert.rejects(() => createStorage({ ...dir, EXPERTPASS_ENCRYPTION_KEY: key, S3_BUCKET: 'b' }), /S3_ACCESS_KEY_ID/)
  })

  console.log(`\n${passed} storage checks passed`)
} finally {
  await rm(root, { recursive: true, force: true })
}
