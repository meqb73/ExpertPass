# Persistent storage setup

By default ExpertPass keeps private event links, covers and avatars on local disk. That is fine for development and is lost whenever a hosted server (for example a free Hugging Face Space) restarts. To keep everything across restarts and redeploys, point the server at a database and a storage bucket with environment variables. No code changes are needed.

| What | Where it goes | Variables |
|---|---|---|
| Private event links (always encrypted first) and image records | Postgres | `DATABASE_URL` |
| Cover and avatar image files | S3-compatible bucket (Supabase Storage, Cloudflare R2, AWS S3, MinIO, Backblaze B2) | `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, plus `S3_ENDPOINT` and `S3_REGION` for non-AWS services |
| Encryption key for links | A secret, never stored beside the data | `EXPERTPASS_ENCRYPTION_KEY` |

The server refuses to start the storage layer if `DATABASE_URL` or `S3_BUCKET` is set without `EXPERTPASS_ENCRYPTION_KEY`, because a key kept on a local disk would be lost in the same reset.

Tables are created automatically on first start (`expertpass_links`, `expertpass_images`).

## Option A: Supabase (database and bucket in one project)

1. Create a project at supabase.com.
2. Database: Project Settings, Database, Connection string. Copy the URI (the pooled "Transaction" string works) into `DATABASE_URL`, with your database password filled in.
3. Storage: create a **private** bucket named `expertpass`. Then Project Settings, Storage, S3 Connection: generate an access key.
4. Set:

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@<pooler-host>:6543/postgres
S3_BUCKET=expertpass
S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
S3_REGION=<region shown on the S3 Connection page>
S3_ACCESS_KEY_ID=<access key id>
S3_SECRET_ACCESS_KEY=<secret>
EXPERTPASS_ENCRYPTION_KEY=<output of: openssl rand -base64 32>
```

## Option B: Cloudflare R2 for images, any Postgres for links

```
DATABASE_URL=<Neon, Supabase, RDS, ...>
S3_BUCKET=expertpass
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=<R2 API token access key>
S3_SECRET_ACCESS_KEY=<R2 API token secret>
EXPERTPASS_ENCRYPTION_KEY=<openssl rand -base64 32>
```

Create the bucket as private. The app serves images itself, so the bucket never needs public access.

Optional: `S3_PREFIX=expertpass/` shares one bucket between apps, `S3_FORCE_PATH_STYLE=false` switches to virtual-hosted addressing, `DATABASE_SSL=disable` is for a local Postgres without TLS.

## Hugging Face Space

Add the variables above under the Space's Settings, Variables and secrets, as **secrets** (all of them are credentials). When Arc Studio deploys, it only uploads `.env` values with your explicit consent. Never put them in the code or in `VITE_` variables, which are public.

## Moving existing data over

With the variables set in your shell or `.env`:

```bash
bun run storage:migrate
```

It reads the local disk copy, decrypts each link with the local key (set `EXPERTPASS_SOURCE_ENCRYPTION_KEY` if the old data used a key from the environment), re-encrypts with `EXPERTPASS_ENCRYPTION_KEY`, and uploads covers and avatars. The local copy is left in place until you delete it.

## Everyday operations

- `bun run storage:export backup.json` and `storage:import backup.json`: portable backup (links stay encrypted).
- `bun run storage:rotate`: after changing `EXPERTPASS_ENCRYPTION_KEY`, keep the old key in `EXPERTPASS_ENCRYPTION_KEY_PREVIOUS` and run this to re-encrypt everything.
- `bun run storage:test`: local checks. `TEST_DATABASE_URL=... bun run storage:test:remote`: Postgres and S3 checks against a throwaway database.
- `GET /api/health` reports `backend` (for example `postgres+s3`) and `durable`, never any credentials.

## Keep safe

- Losing `EXPERTPASS_ENCRYPTION_KEY` makes stored links unreadable. Store it in a password manager as well as the host's secret store.
- Use a database user and bucket keys that can only touch this app's data.
