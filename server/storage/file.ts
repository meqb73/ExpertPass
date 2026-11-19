import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { assertValidKey, type BlobStore } from './types'

/** Stores blobs as files under one directory. Writes go to a temp file first, then rename (atomic on POSIX). */
export class FileBlobStore implements BlobStore {
  readonly kind = 'file'

  constructor(private readonly dir: string) {}

  private path(key: string): string {
    assertValidKey(key)
    return join(this.dir, key)
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.path(key)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const target = this.path(key)
    await mkdir(dirname(target), { recursive: true })
    const tmp = `${target}.${randomBytes(6).toString('hex')}.tmp`
    await writeFile(tmp, bytes, { mode: 0o600 })
    await rename(tmp, target)
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true })
  }

  async list(prefix: string): Promise<string[]> {
    const out: string[] = []
    const walk = async (rel: string): Promise<void> => {
      let entries
      try {
        entries = await readdir(join(this.dir, rel), { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const next = rel ? `${rel}/${entry.name}` : entry.name
        if (entry.isDirectory()) await walk(next)
        else if (!entry.name.endsWith('.tmp') && next.startsWith(prefix)) out.push(next)
      }
    }
    await walk('')
    return out.sort()
  }
}
