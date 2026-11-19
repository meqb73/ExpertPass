import type { S3Client } from '@aws-sdk/client-s3'
import { assertValidKey, type BlobStore } from './types'

export interface S3Config {
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  /** Custom endpoint for Cloudflare R2, Supabase Storage (S3 protocol), MinIO, ... Omit for AWS S3. */
  endpoint?: string
  /** Path-style addressing (bucket in the path). Needed by Supabase and MinIO; R2 accepts both. Default true with an endpoint. */
  forcePathStyle?: boolean
  /** Optional key prefix so several apps can share a bucket, e.g. "expertpass/". */
  prefix?: string
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  json: 'application/json',
}

/** BlobStore on any S3-compatible bucket (Cloudflare R2, Supabase Storage, AWS S3, MinIO, Backblaze B2). */
export class S3BlobStore implements BlobStore {
  readonly kind = 's3'

  private constructor(
    private readonly client: S3Client,
    private readonly sdk: typeof import('@aws-sdk/client-s3'),
    private readonly cfg: S3Config,
  ) {}

  static async connect(cfg: S3Config): Promise<S3BlobStore> {
    const sdk = await import('@aws-sdk/client-s3')
    const client = new sdk.S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle ?? Boolean(cfg.endpoint),
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      // Newer SDK versions add checksum headers that several S3-compatible services reject.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
    const store = new S3BlobStore(client, sdk, cfg)
    // Fail fast on bad credentials, endpoint or bucket name.
    await client.send(new sdk.HeadBucketCommand({ Bucket: cfg.bucket }))
    return store
  }

  private key(key: string): string {
    assertValidKey(key)
    return `${this.cfg.prefix ?? ''}${key}`
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const out = await this.client.send(new this.sdk.GetObjectCommand({ Bucket: this.cfg.bucket, Key: this.key(key) }))
      return out.Body ? await out.Body.transformToByteArray() : null
    } catch (error) {
      const e = error as { name?: string; $metadata?: { httpStatusCode?: number } }
      if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null
      throw error
    }
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const ext = key.split('.').pop() ?? ''
    await this.client.send(
      new this.sdk.PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: this.key(key),
        Body: bytes,
        ContentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
      }),
    )
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new this.sdk.DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: this.key(key) }))
  }

  async list(prefix: string): Promise<string[]> {
    const base = this.cfg.prefix ?? ''
    const out: string[] = []
    let token: string | undefined
    do {
      const page = await this.client.send(
        new this.sdk.ListObjectsV2Command({ Bucket: this.cfg.bucket, Prefix: `${base}${prefix}`, ContinuationToken: token }),
      )
      for (const obj of page.Contents ?? []) if (obj.Key) out.push(obj.Key.slice(base.length))
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    return out.sort()
  }
}
