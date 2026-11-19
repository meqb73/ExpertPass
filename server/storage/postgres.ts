import type { Sql } from 'postgres'
import type { ImageEntry, MetaRepo, StoredLink } from './meta'

type ImageRow = { key: string; mime: string; ext: string; updated_at: string | number }
const toEntry = (row: ImageRow): ImageEntry => ({ mime: row.mime, ext: row.ext, updatedAt: Number(row.updated_at) })

/** MetaRepo on Postgres (Supabase, Neon, RDS, ...). Tables are created on first use. */
export class PgMetaRepo implements MetaRepo {
  readonly kind = 'postgres'

  private constructor(private readonly sql: Sql) {}

  static async connect(url: string, opts: { ssl?: boolean } = {}): Promise<PgMetaRepo> {
    const { default: postgres } = await import('postgres')
    // prepare:false keeps this compatible with pooled connections (Supabase pooler, PgBouncer).
    const sql = postgres(url, { max: 5, prepare: false, ssl: opts.ssl === false ? false : 'require', idle_timeout: 30, connect_timeout: 15, onnotice: () => undefined })
    const repo = new PgMetaRepo(sql)
    await sql`create table if not exists expertpass_links (
      session_id text primary key,
      enc text not null,
      updated_at bigint not null
    )`
    await sql`create table if not exists expertpass_images (
      kind text not null,
      key text not null,
      mime text not null,
      ext text not null,
      updated_at bigint not null,
      primary key (kind, key)
    )`
    return repo
  }

  async ping() {
    await this.sql`select 1`
  }

  async getLink(id: string): Promise<StoredLink | null> {
    const [row] = await this.sql<{ enc: string; updated_at: string }[]>`select enc, updated_at from expertpass_links where session_id = ${id}`
    return row ? { enc: row.enc, updatedAt: Number(row.updated_at) } : null
  }
  async setLink(id: string, enc: string) {
    const now = Date.now()
    await this.sql`insert into expertpass_links (session_id, enc, updated_at) values (${id}, ${enc}, ${now})
      on conflict (session_id) do update set enc = excluded.enc, updated_at = excluded.updated_at`
  }
  async linkIds(ids: string[]) {
    if (ids.length === 0) return new Set<string>()
    const rows = await this.sql<{ session_id: string }[]>`select session_id from expertpass_links where session_id in ${this.sql(ids)}`
    return new Set(rows.map((r) => r.session_id))
  }
  async listLinks() {
    const rows = await this.sql<{ session_id: string; enc: string; updated_at: string }[]>`select session_id, enc, updated_at from expertpass_links order by session_id`
    return rows.map((r) => ({ id: r.session_id, enc: r.enc, updatedAt: Number(r.updated_at) }))
  }

  private async getImage(kind: string, key: string): Promise<ImageEntry | null> {
    const [row] = await this.sql<ImageRow[]>`select key, mime, ext, updated_at from expertpass_images where kind = ${kind} and key = ${key}`
    return row ? toEntry(row) : null
  }
  private async setImage(kind: string, key: string, entry: ImageEntry) {
    await this.sql`insert into expertpass_images (kind, key, mime, ext, updated_at) values (${kind}, ${key}, ${entry.mime}, ${entry.ext}, ${entry.updatedAt})
      on conflict (kind, key) do update set mime = excluded.mime, ext = excluded.ext, updated_at = excluded.updated_at`
  }
  private async imageVersions(kind: string, keys: string[]) {
    if (keys.length === 0) return {}
    const rows = await this.sql<ImageRow[]>`select key, mime, ext, updated_at from expertpass_images where kind = ${kind} and key in ${this.sql(keys)}`
    return Object.fromEntries(rows.map((r) => [r.key, Number(r.updated_at)]))
  }
  private async listImages(kind: string) {
    const rows = await this.sql<ImageRow[]>`select key, mime, ext, updated_at from expertpass_images where kind = ${kind} order by key`
    return rows.map((r) => ({ id: r.key, ...toEntry(r) }))
  }

  getCover = (id: string) => this.getImage('cover', id)
  setCover = (id: string, entry: ImageEntry) => this.setImage('cover', id, entry)
  coverVersions = (ids: string[]) => this.imageVersions('cover', ids)
  listCovers = () => this.listImages('cover')
  getAvatar = (address: string) => this.getImage('avatar', address)
  setAvatar = (address: string, entry: ImageEntry) => this.setImage('avatar', address, entry)
  avatarVersions = (addresses: string[]) => this.imageVersions('avatar', addresses)
  listAvatars = () => this.listImages('avatar')

  async close() {
    await this.sql.end({ timeout: 5 })
  }
}
