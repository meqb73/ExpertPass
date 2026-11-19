# Set up persistent storage, step by step

Goal: event links, covers and avatars survive every restart and redeploy. You need one free Supabase project (it provides both the Postgres database and the image bucket). About 10 minutes.

Recommended option: **Supabase**, because one account covers everything. Cloudflare R2 is an alternative for the images only (see "Using Cloudflare R2 instead" below).

## Step 1. Create the Supabase project

1. Go to supabase.com and sign in (a free account is enough).
2. Click **New project**. Pick an organization, name it `expertpass`, choose a region close to your users, and set a **database password**. Save that password in a password manager, you need it in step 3.
3. Wait until the project finishes setting up (about a minute).

## Step 2. Create a private image bucket

1. In the project, open **Storage** in the left menu.
2. Click **New bucket**, name it `expertpass`, and leave **Public bucket** switched **off**. The app serves images itself, so the bucket never needs to be public.
3. Open the Storage **S3 Connection** settings (Storage settings, or Project Settings, Storage). Note two values shown there:
   - the **Endpoint**, which looks like `https://<project-ref>.storage.supabase.co/storage/v1/s3`
   - the **Region**, for example `eu-west-1`
4. Click **New access key** on that same page. Copy the **Access key ID** and the **Secret access key** right away, the secret is shown only once.

## Step 3. Get the database connection string

1. Click **Connect** at the top of the project page.
2. Choose **Session pooler**. (It works from IPv4-only hosts such as most Hugging Face Spaces. The Direct connection only works on IPv6.)
3. Copy the string. It looks like `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@<pooler-host>:5432/postgres`.
4. Replace `[YOUR-PASSWORD]` with your database password. If the password contains characters such as `&`, `#`, `?`, `@`, `/` or a space, percent-encode them (for example `@` becomes `%40`), or reset the password to letters and numbers only.

## Step 4. Create the encryption key

Run this in any terminal (Mac, Linux, or the terminal in the Code panel):

```
openssl rand -base64 32
```

Copy the result. This key encrypts every event link. **If you lose it, the stored links cannot be read again.** Save it in a password manager now, separate from the database password.

## Step 5. The values you need

| Name | Where it comes from | Example |
|---|---|---|
| `DATABASE_URL` | Step 3, with your password filled in | `postgresql://postgres.abcd:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres` |
| `S3_BUCKET` | Step 2, the bucket name | `expertpass` |
| `S3_ENDPOINT` | Step 2, Endpoint | `https://abcd.storage.supabase.co/storage/v1/s3` |
| `S3_REGION` | Step 2, Region | `eu-west-1` |
| `S3_ACCESS_KEY_ID` | Step 2, new access key | |
| `S3_SECRET_ACCESS_KEY` | Step 2, new access key | |
| `EXPERTPASS_ENCRYPTION_KEY` | Step 4 | |

You do not need `EXPERTPASS_DATA_DIR`, `EXPERTPASS_DURABLE` or any `VITE_` variable for this. Never put these values in a `VITE_` variable, those are public.

## Step 6. Add them here and check

1. In Arc Studio, open the **Code** panel, click `.env` in the file tree, add the seven lines from step 5 as `NAME=value` (no quotes, no spaces), and save. Do not paste them into the chat.
2. Tell me when it is saved. I will restart the dev server (changes to `.env` need a restart) and open `/api/health`. It should report `"backend":"postgres+s3"` and `"durable":true`.

## Step 7. Move the existing test data

Once step 6 works, I run:

```
bun run storage:migrate
```

It copies the event link, cover and avatar that are on the local disk into Supabase. Links are decrypted with the old local key and re-encrypted with your new key, so nothing readable is stored. The local copy stays in place until you delete it. If you prefer to run it yourself, put the same variables in your shell or `.env` first.

Afterwards check in Supabase: **Table Editor** shows `expertpass_links` and `expertpass_images`, and **Storage**, bucket `expertpass`, shows `covers/` and `avatars/`. The `enc` column should start with `enc:v1:` and never contain a readable link.

## Step 8. Before you deploy to Hugging Face Spaces

Hugging Face Spaces are always public and upload your source code, so confirm this checklist:

1. Step 6 health check shows `postgres+s3` and `durable: true`.
2. Step 7 migration finished (skip if you do not need the test data).
3. The encryption key and database password are saved outside this project.
4. You accept that the Space and its source are public. The variables are **not** public: they go in as encrypted Space secrets.
5. When I deploy, I will ask you for consent to push the non-`VITE_` values from `.env` as Space secrets. Say yes, otherwise the Space would start without them and fall back to temporary disk. You can instead add the seven names by hand under the Space's **Settings, Variables and secrets, New secret**.
6. After the deploy, open `https://<your-space>/api/health` and confirm it again shows `postgres+s3`, `durable: true`. Then create a test event link, restart the Space from its Settings menu, and check the link is still there.

If the health check shows `json+file`, the secrets did not reach the Space. If the app shows a "storage is not configured correctly" error, one value is wrong, most often the database password (step 3.4) or the region.

## Using Cloudflare R2 instead (images only)

You still need a Postgres for links (Supabase works, or Neon). For the images:

1. In the Cloudflare dashboard open **R2 object storage**, **Create bucket**, name it `expertpass` (keep it private).
2. **Manage API tokens**, **Create API token** with **Object Read & Write** on that bucket. Copy the **Access Key ID** and **Secret Access Key**.
3. Your **account ID** is on the R2 overview page. The endpoint is `https://<account-id>.r2.cloudflarestorage.com`.
4. Set `S3_BUCKET=expertpass`, `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `S3_REGION=auto`, plus the two keys, `DATABASE_URL` and `EXPERTPASS_ENCRYPTION_KEY`.

## Everyday notes

- Changing `EXPERTPASS_ENCRYPTION_KEY` later: put the old value in `EXPERTPASS_ENCRYPTION_KEY_PREVIOUS`, set the new one, and run `bun run storage:rotate`.
- Backup anytime: `bun run storage:export backup.json` (links stay encrypted inside).
- Free Supabase projects pause after a period of inactivity. Open the dashboard and restore the project if the app reports a storage error after a long quiet period.
