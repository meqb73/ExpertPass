import type { LinkCipher } from './crypto'
import type { BlobStore } from './types'

export interface ImageEntry {
  mime: string
  ext: string
  updatedAt: number
}

export interface StoredLink {
  /** Encrypted link ("enc:v1:..."). The plain URL is never stored. */
  enc: string
  updatedAt: number
}

/**
 * Index of what exists for each session / expert: encrypted event links and image records.
 * Image bytes themselves live in a BlobStore. Implementations: JSON file in a blob store (default)
 * and Postgres (set DATABASE_URL).
 */
export interface MetaRepo {
  readonly kind: string
  /** Throws when the backend is unreachable. */
  ping(): Promise<void>
  getLink(id: string): Promise<StoredLink | null>
  setLink(id: string, enc: string): Promise<void>
  linkIds(ids: string[]): Promise<Set<string>>
  listLinks(): Promise<Array<StoredLink & { id: string }>>
  getCover(id: string): Promise<ImageEntry | null>
  setCover(id: string, entry: ImageEntry): Promise<void>
  coverVersions(ids: string[]): Promise<Record<string, number>>
  listCovers(): Promise<Array<ImageEntry & { id: string }>>
  getAvatar(address: string): Promise<ImageEntry | null>
  setAvatar(address: string, entry: ImageEntry): Promise<void>
  avatarVersions(addresses: string[]): Promise<Record<string, number>>
  listAvatars(): Promise<Array<ImageEntry & { id: string }>>
}

interface Meta {
  version: 1
  links: Record<string, StoredLink>
  covers: Record<string, ImageEntry>
  avatars: Record<string, ImageEntry>
}

const META_KEY = 'meta/store.json'

/** MetaRepo that keeps one JSON document in the blob store. Fine for one server instance. */
export class BlobMetaRepo implements MetaRepo {
  readonly kind = 'json'
  private cached: Promise<Meta> | null = null
  private writeChain: Promise<void> = Promise.resolve()

  constructor(
    private readonly blobs: BlobStore,
    private readonly cipher: LinkCipher,
  ) {}

  private load(): Promise<Meta> {
    this.cached ??= this.read()
    return this.cached
  }

  private async read(): Promise<Meta> {
    const raw = await this.blobs.get(META_KEY)
    const parsed = raw ? (JSON.parse(new TextDecoder().decode(raw)) as Partial<Meta> & { links?: Record<string, Record<string, unknown>> }) : {}
    const meta: Meta = { version: 1, links: {}, covers: parsed.covers ?? {}, avatars: parsed.avatars ?? {} }
    let migrated = false
    for (const [id, entry] of Object.entries(parsed.links ?? {})) {
      const updatedAt = typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now()
      if (typeof entry.enc === 'string') {
        meta.links[id] = { enc: entry.enc, updatedAt }
      } else if (typeof entry.link === 'string') {
        // Older versions stored the link as plain text. Encrypt it now.
        meta.links[id] = { enc: this.cipher.encrypt(entry.link, `link:${id}`), updatedAt }
        migrated = true
      }
    }
    if (migrated) await this.write(meta)
    return meta
  }

  private async write(meta: Meta): Promise<void> {
    await this.blobs.put(META_KEY, new TextEncoder().encode(JSON.stringify(meta)))
  }

  private async save(): Promise<void> {
    const meta = await this.load()
    this.writeChain = this.writeChain.then(() => this.write(meta))
    return this.writeChain
  }

  async ping(): Promise<void> {
    await this.load()
  }
  async getLink(id: string) {
    return (await this.load()).links[id] ?? null
  }
  async setLink(id: string, enc: string) {
    ;(await this.load()).links[id] = { enc, updatedAt: Date.now() }
    await this.save()
  }
  async linkIds(ids: string[]) {
    const links = (await this.load()).links
    return new Set(ids.filter((id) => links[id]))
  }
  async listLinks() {
    return Object.entries((await this.load()).links).map(([id, v]) => ({ id, ...v }))
  }
  async getCover(id: string) {
    return (await this.load()).covers[id] ?? null
  }
  async setCover(id: string, entry: ImageEntry) {
    ;(await this.load()).covers[id] = entry
    await this.save()
  }
  async coverVersions(ids: string[]) {
    const covers = (await this.load()).covers
    return Object.fromEntries(ids.flatMap((id) => (covers[id] ? [[id, covers[id].updatedAt] as const] : [])))
  }
  async listCovers() {
    return Object.entries((await this.load()).covers).map(([id, v]) => ({ id, ...v }))
  }
  async getAvatar(address: string) {
    return (await this.load()).avatars[address] ?? null
  }
  async setAvatar(address: string, entry: ImageEntry) {
    ;(await this.load()).avatars[address] = entry
    await this.save()
  }
  async avatarVersions(addresses: string[]) {
    const avatars = (await this.load()).avatars
    return Object.fromEntries(addresses.flatMap((a) => (avatars[a] ? [[a, avatars[a].updatedAt] as const] : [])))
  }
  async listAvatars() {
    return Object.entries((await this.load()).avatars).map(([id, v]) => ({ id, ...v }))
  }
}
