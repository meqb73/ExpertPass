# How ExpertPass stores data

> **Superseded for event links:** links are now stored onchain with the session (`getEventLink`; current contract `0xdec618bb277e4ab5857dfdd4dfc7ae645a7c6148`, which also stores cover image URLs). They are public chain data that the app shows only to ticket holders and the host. The offchain server now keeps only expert avatars. Sections below that describe server-side link storage are historical.

> **Update:** the first storage steps from this report are now implemented. Data lives outside the project (`EXPERTPASS_DATA_DIR`, `/data/expertpass`, or `~/.expertpass`), private links are encrypted with AES-256-GCM, storage sits behind a `BlobStore` interface, and `bun run storage:export / import / rotate` handle backups and key changes. Paths below that say `data/` describe the earlier layout (now under `<data dir>/blobs/`).

ExpertPass keeps **money, ownership and public facts onchain** (Arc Testnet) and **private or bulky files offchain** (the app's small server). This page lists exactly what goes where, what survives a Hugging Face Space restart, and how to harden it.

## 1. Onchain (Arc Testnet): contract `0x0fd4e61144e630c5ea002fe604474d243e576dff`

| Data | Where in the contract | Why it is onchain |
| --- | --- | --- |
| Expert profile: display name (max 64 bytes), bio (max 280 bytes), registered flag | `experts[address]` | Public identity that every learner can verify; anyone can read it without trusting the app. |
| Session: title, description (max 4000 bytes, Markdown), category, price (USDC, 6 decimals), total supply, tickets sold, tickets refunded, start time, duration, transferable flag, cancelled flag, paid-out flag, fee snapshot, expert address | `Session` struct, ids start at 1 | Price, supply and schedule are promises to buyers. Keeping them in the contract means the expert cannot change them silently (price, supply and ticket type are immutable; date and duration lock once a ticket sells). |
| Ticket NFTs (ERC-1155): token id = session id, balance per wallet | ERC-1155 balances | Ownership of a ticket is the access right. The wallet is the pass. |
| Attendance certificates (soulbound ERC-1155): token id = 2^128 + session id | ERC-1155 balances | Permanent proof of attendance that cannot be transferred. |
| Escrowed USDC | Contract's USDC balance | Funds are held by the contract until the session ends (then released to the expert) or the session is cancelled (then refunded). Neither the app server nor the expert can take it early. |
| Purchase and refund records: who bought, who was refunded and how much, list of ticket holders, refund progress | `purchased`, `refundedAmount`, `participants`, `refundCursor` | Lets the app show "Refunded" status and lets anyone finish refunds. |
| Platform fees owed | `accruedFees` (currently 0 bps) | Accounting for the optional fee. |
| Events (SessionCreated, TicketPurchased, TicketRefunded, ...) | Chain logs | Audit trail. |

Everything above is public and permanent on the chain. It survives any server or Space restart.

## 2. Offchain (the app server, `server/app.ts`)

Stored on the server's disk under `data/` (override with `EXPERTPASS_DATA_DIR`):

| Data | File | Why it is offchain |
| --- | --- | --- |
| **Private event link** (Zoom, Meet, livestream URL), one per session | `data/store.json` under `links` | A secret. Anything onchain is readable by everyone forever, which would defeat "only ticket holders can see it". |
| Cover image per session (JPEG/PNG/WebP/GIF, max 2 MB, resized in the browser to 1280 px wide) | `data/covers/<sessionId>.<ext>`, index in `store.json` under `covers` | Images are too large and too costly to store onchain. |
| Expert avatar (square 256 px JPEG, max 512 KB) | `data/avatars/<address>.<ext>`, index in `store.json` under `avatars` | Same reason. |

The server does not store any money, balances or ticket ownership. It always asks the contract.

## 3. What survives a Hugging Face Space restart or redeploy

A Docker Space has an **ephemeral disk**. Every restart, rebuild or redeploy starts from a clean container.

| Data | Survives? |
| --- | --- |
| Everything in section 1 (profiles, sessions, tickets, certificates, escrowed USDC, refund records) | **Yes.** It lives on the chain. |
| Private event links | **No. Lost.** Sessions then show "No event link" and ticket holders cannot unlock anything until the expert re-adds the link. |
| Cover images | **No. Lost.** Cards fall back to the generated category placeholder. |
| Expert avatars | **No. Lost.** Profiles fall back to the initial-letter avatar. |
| Name and bio of experts | **Yes** (onchain). |
| Anything the browser caches (revealed links in `sessionStorage`, theme choice) | Only in that browser tab or browser; not a backup. |

Nobody loses money or tickets in a restart. What is lost is convenience data and, importantly, **access to the event link**.

## 4. How links, covers and avatars are handled today

**Private event links**
1. The expert enters the link when creating or editing a session (or from the dashboard "Add link / Change link").
2. The browser asks the expert's wallet to sign a message that includes the chain, contract, session id, the link itself and a timestamp. No gas is spent.
3. The server checks the signature, confirms from the contract that the signer is the session's expert, and writes the link to `store.json`.
4. A learner clicks **Unlock event link**. Their wallet signs a different message (chain, contract, session id, timestamp). The server verifies the signature, then calls the contract's `hasAccess(sessionId, wallet)` (ticket balance above zero and session not cancelled). Only then does it return the link. The session's expert can also reveal their own link while the session is not cancelled.
5. The link is cached in the browser's `sessionStorage` for that tab so the learner does not have to sign again.
6. Signed messages are accepted for 10 minutes. Write requests are rate limited per client.

**Cover images**: the expert's wallet signs a message containing the image's SHA-256, so the upload cannot be swapped. Stored on disk, served publicly at `/api/covers/<id>` (anyone can view covers; they are not secret).

**Avatars**: same pattern, but the signer must be the avatar's own address and a registered expert. Served publicly at `/api/avatars/<address>`.

Served images carry `nosniff` and a sandbox content-security-policy, and only PNG, JPEG, WebP and GIF are accepted (no SVG), so an uploaded file cannot run script.

## 5. Limitations and risks of the current design

1. **Ephemeral disk loses links, covers and avatars on every restart** (section 3). This is the biggest gap. Learners who paid cannot get in until the expert re-adds the link.
2. **Links are stored in plain text** in `store.json`. Anyone with access to the server's disk or a backup can read every link. Wallet signatures protect the API, not the file.
3. **Local data can leak through the deploy.** The folder `data/` is git-ignored, but a Hugging Face Docker Space receives the project source tree. If `data/` is in that tree, the Space repository (which is public) would contain real links, covers and avatars. Keep `data/` out of the upload (see improvement 1).
4. **Single server, single disk.** There is no replication; running two instances would give each its own data.
5. **Trust in the server operator.** The operator can read all links. This is inherent to any design where the server must hand links to ticket holders.
6. **A revealed link can be shared.** Once a ticket holder sees the link they can pass it on. Wallet gating limits who gets it from the app, not who they tell. Soulbound tickets and per-session links reduce but do not remove this.
7. **Replay window.** A captured reveal signature is valid for 10 minutes. It only returns the link to the signer's own wallet, so the practical risk is low, but a nonce would remove it.
8. **Experts must act after data loss.** There is a "No event link" badge on the dashboard, but nothing notifies them automatically.
9. **Rate limiting is in memory** and resets on restart.
10. **Onchain text is permanent.** Titles, descriptions, names and bios cannot be deleted once written (they can be edited only as the contract allows).

## 6. Recommended improvements (links stay offchain)

In order of effort versus benefit:

1. **Keep `data/` out of the deploy and out of git.** Move the default data directory outside the project folder (or add an ignore file for `data/`). Do this before any public deploy. Small change.
2. **Persistent disk.** Point `EXPERTPASS_DATA_DIR` at a persistent volume. On Hugging Face this means enabling the Space's persistent storage option (a paid add-on at the time of writing; confirm current terms) and using its mount path. This alone fixes restarts.
3. **Encrypt links at rest.** Encrypt each link with AES-256-GCM before writing, using a key kept as a Space secret (for example `LINK_ENCRYPTION_KEY`), never in the repo. A leaked disk or backup then reveals nothing. Rotate by re-encrypting.
4. **Move to a managed store.** Put links in a small Postgres database (Neon, Supabase or similar, with `DATABASE_URL` as a Space secret) and images in object storage (S3, R2, or IPFS pinning for the public covers and avatars). This survives any redeploy and allows more than one server instance.
5. **Encrypted backups to a private Hugging Face Dataset repo.** If you stay on the free ephemeral disk, the server can periodically upload an encrypted copy of `data/` to a private dataset repository and restore it on startup. Use a Space secret for the Hugging Face token. This is a common pattern for Spaces.
6. **Make recovery easy for experts.** After a restart, show a banner on the dashboard ("2 of your sessions have no event link") with a one-click "Re-add link" for each, and email or wallet-notification hooks if you add them. Cheap and does not depend on any infrastructure.
7. **Expert-held recovery copy.** Let the expert download an encrypted backup of their links (encrypted with a key derived from a wallet signature) and re-upload it after a reset. This keeps a copy under the expert's control without the server ever storing a plain copy.
8. **Add a nonce to reveal signatures** (server-issued, single use) to close the replay window, and persist rate limits.
9. **Optional, larger change: a stateless server.** Store each link encrypted to the server's public key in an onchain event or on IPFS, and have the server decrypt on demand after checking `hasAccess`. Nothing is lost on restart because the data is public ciphertext. The tradeoffs: it needs a contract update to emit the ciphertext, and if the server key ever leaks, every link ever stored is exposed with no way to revoke it. Use it only with a hardware-backed or well-protected key.

**Suggested path:** do 1 now; then 2 (or 4) for durability plus 3 for confidentiality; add 6 as the user-visible safety net.
