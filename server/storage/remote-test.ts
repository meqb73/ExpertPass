/**
 * Integration checks for the Postgres + S3 storage. Run with: bun run storage:test:remote
 *
 * Needs a throwaway Postgres: TEST_DATABASE_URL=postgres://user:pw@127.0.0.1:55432/expertpass
 * The S3 side runs against an in-process fake S3 server (s3rver) that validates request signatures.
 * It creates and empties the expertpass_* tables, so never point it at a real database.
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import S3rver from 's3rver'
import { createApi } from '../app'
import { createStorage } from './index'

const dbUrl = process.env.TEST_DATABASE_URL
if (!dbUrl) throw new Error('Set TEST_DATABASE_URL to a throwaway Postgres database.')

const root = await mkdtemp(join(tmpdir(), 'expertpass-remote-'))
const s3 = new S3rver({ port: 4569, address: '127.0.0.1', silent: true, directory: join(root, 's3'), configureBuckets: [{ name: 'expertpass-test', configs: [] }] })
await s3.run()

const env = {
  DATABASE_URL: dbUrl,
  DATABASE_SSL: 'disable',
  S3_BUCKET: 'expertpass-test',
  S3_ENDPOINT: 'http://127.0.0.1:4569',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'S3RVER',
  S3_SECRET_ACCESS_KEY: 'S3RVER',
  S3_PREFIX: 'prod/',
  EXPERTPASS_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  EXPERTPASS_DATA_DIR: join(root, 'unused-local'),
}
const bytes = (s: string) => new TextEncoder().encode(s)
const text = (b: Uint8Array | null) => (b ? new TextDecoder().decode(b) : null)
let passed = 0
const test = async (name: string, fn: () => Promise<void>) => {
  await fn()
  passed++
  console.log(`ok  ${name}`)
}

try {
  const first = await createStorage(env)
  await first.meta.listLinks() // ensure tables exist
  const postgres = (await import('postgres')).default
  const sql = postgres(dbUrl, { ssl: false, max: 1 })
  await sql`truncate expertpass_links, expertpass_images`

  await test('selects postgres + s3 and reports durable storage', async () => {
    assert.equal(first.info.backend, 'postgres+s3')
    assert.equal(first.info.durable, true)
    assert.equal(first.info.keySource, 'env')
  })

  await test('s3: put, get, overwrite, missing key, list, delete', async () => {
    const b = first.blobs
    assert.equal(await b.get('covers/1.jpg'), null)
    await b.put('covers/1.jpg', bytes('first'))
    await b.put('covers/2.png', bytes('second'))
    await b.put('covers/1.jpg', bytes('replaced'))
    assert.equal(text(await b.get('covers/1.jpg')), 'replaced')
    assert.deepEqual(await b.list('covers/'), ['covers/1.jpg', 'covers/2.png'])
    await b.delete('covers/2.png')
    assert.equal(await b.get('covers/2.png'), null)
    await assert.rejects(() => b.put('../escape', bytes('x')), /Invalid storage key/)
  })

  const address = '0x2f7cacb450982fe7c7e8dde29c4d7943a15fb638'
  await test('postgres: links, covers, avatars round trip and upsert', async () => {
    const m = first.meta
    await m.setLink('1', first.cipher.encrypt('https://meet.google.com/aaa-bbbb-ccc', 'link:1'))
    await m.setLink('1', first.cipher.encrypt('https://meet.google.com/new-link', 'link:1'))
    await m.setLink('2', first.cipher.encrypt('https://zoom.us/j/2', 'link:2'))
    await m.setCover('1', { mime: 'image/jpeg', ext: 'jpg', updatedAt: 111 })
    await m.setAvatar(address, { mime: 'image/png', ext: 'png', updatedAt: 222 })
    assert.equal(first.cipher.decrypt((await m.getLink('1'))?.enc ?? '', 'link:1'), 'https://meet.google.com/new-link')
    assert.deepEqual([...(await m.linkIds(['1', '2', '3']))].sort(), ['1', '2'])
    assert.deepEqual(await m.coverVersions(['1', '2']), { '1': 111 })
    assert.deepEqual(await m.avatarVersions([address]), { [address]: 222 })
    assert.equal((await m.listLinks()).length, 2)
    assert.equal(await m.getLink('9'), null)
    assert.deepEqual(await m.linkIds([]), new Set())
  })

  await test('database never contains a readable link', async () => {
    const rows = await sql<{ enc: string }[]>`select enc from expertpass_links`
    assert.equal(rows.length, 2)
    for (const row of rows) assert.ok(row.enc.startsWith('enc:v1:') && !/meet\.google|zoom\.us/.test(row.enc))
  })

  await first.blobs.put('covers/1.jpg', new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
  await first.blobs.put(`avatars/${address}.png`, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9]))

  await test('after a restart (fresh connections) everything is still served by the API', async () => {
    const restarted = await createStorage(env)
    const api = createApi({ contractAddress: '0xdec618bb277e4ab5857dfdd4dfc7ae645a7c6148', rpcUrls: ['http://127.0.0.1:1'], storage: restarted })
    const get = (path: string) => api.handle(new Request(`http://localhost/api${path}`), 'test')
    const health = await get('/health')
    assert.equal(health.status, 200)
    assert.equal(((await health.json()) as { storage: { backend: string } }).storage.backend, 'postgres+s3')
    const avatar = await get(`/avatars/${address}`)
    assert.equal(avatar.status, 200)
    assert.equal(avatar.headers.get('content-type'), 'image/png')
    assert.equal((await get('/avatars/0x000000000000000000000000000000000000dead')).status, 404)
    assert.equal(restarted.cipher.decrypt((await restarted.meta.getLink('2'))?.enc ?? '', 'link:2'), 'https://zoom.us/j/2')
  })

  await test('a different encryption key cannot read stored links', async () => {
    const other = await createStorage({ ...env, EXPERTPASS_ENCRYPTION_KEY: randomBytes(32).toString('base64') })
    const stored = await other.meta.getLink('2')
    assert.throws(() => other.cipher.decrypt(stored?.enc ?? '', 'link:2'))
  })

  await test('a misconfigured database gives a clear API error instead of a crash', async () => {
    const api = createApi({
      contractAddress: '0xdec618bb277e4ab5857dfdd4dfc7ae645a7c6148',
      rpcUrls: ['http://127.0.0.1:1'],
      storage: createStorage({ ...env, DATABASE_URL: 'postgres://nobody:wrong@127.0.0.1:1/none' }),
    })
    const res = await api.handle(new Request('http://localhost/api/meta?ids=1'), 'test')
    assert.equal(res.status, 503)
  })

  await sql.end()
  console.log(`\n${passed} remote storage checks passed`)
} finally {
  await s3.close()
  await rm(root, { recursive: true, force: true })
}
process.exit(0)
