# ExpertPass

Book live expert sessions with NFT tickets paid in USDC on Arc Testnet. Experts host sessions with a limited number of tickets; learners buy a ticket and ticket holders see the event link on the session page (Zoom, Google Meet, or any livestream).

Built with [Arc Studio](https://studio.arc.io)

## Features

- Experts: create a profile, host sessions (title, rich-text description, category, price, ticket supply, date, duration, event link, optional cover image link, transferable or soulbound tickets), edit upcoming sessions, cancel and refund, withdraw earnings after a session ends, and mint attendance certificates.
- Learners: browse in grid or list view, filter by category, price and date, search by title or expert, buy a ticket in one click, see "My Tickets", see the event link and join.
- Expert profiles: public pages with name, bio, avatar, stats (sessions hosted, tickets sold) and their sessions. Experts edit their profile from the dashboard; expert names across the app link to the profile.
- Eight categories: Technology & Engineering, Medicine & Health, Business & Finance, Design & Creative, Marketing & Growth, Education & Skills, Legal & Compliance, Other.
- Dark and light themes, a sidebar layout with category shortcuts and a global search bar, and a responsive layout that collapses to a top bar on phones.

## Tech stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, wagmi, viem, ConnectKit
- Contract: Solidity 0.8.28 (ERC-1155 tickets and certificates), OpenZeppelin 5, Foundry
- Offchain API: small Bun/Node service for expert profile photos
- Network: Arc Testnet, USDC

## Development

Prerequisites: Bun, Foundry, a browser wallet (MetaMask or similar) with Arc Testnet USDC (it is also the gas token on Arc).

```bash
bun install
bun run dev
```

The dev server also serves the offchain API under `/api`, so one command runs everything.

### Environment variables

| Name | Purpose |
| --- | --- |
| `VITE_CHAIN_ID` | Network the app uses: `5042002` for Arc Testnet (default if empty) or `5042` for Arc Mainnet. Any other value shows a configuration error. Public. |
| `VITE_EXPERTPASS_ADDRESS` | Address of the ExpertPass contract deployed on that network. Required. Public. |
| `DATABASE_URL` | Postgres connection string (Supabase, Neon, ...). Stores image records durably. Optional. |
| `DATABASE_SSL` | Set to `disable` for a local Postgres without TLS. Optional. |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | S3-compatible bucket (Supabase Storage, Cloudflare R2, AWS S3, MinIO) for avatar files. Optional. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_PREFIX`, `S3_FORCE_PATH_STYLE` | Endpoint and options for non-AWS buckets (R2 uses region `auto`). Optional. |
| `EXPERTPASS_ENCRYPTION_KEY` | Secret key (32 bytes, 64 hex characters or base64) kept for the storage layer's link encryption (event links now live onchain, so this matters only for older stored data). Required when `DATABASE_URL` or `S3_BUCKET` is set. Generate with `openssl rand -base64 32`. |
| `EXPERTPASS_ENCRYPTION_KEY_PREVIOUS` | Comma-separated old keys kept so links written before a key change stay readable. Run `bun run storage:rotate` afterwards. Optional. |
| `EXPERTPASS_SOURCE_ENCRYPTION_KEY` | Key of the old local data when running `bun run storage:migrate`. Optional. |
| `EXPERTPASS_DATA_DIR` | Local data folder when no database or bucket is configured. Defaults to `/data/expertpass` if a volume is mounted at `/data`, otherwise `~/.expertpass` (outside the project). Optional. |
| `EXPERTPASS_DURABLE` | Set to `1` if the local data folder is on storage that survives restarts. Only changes the notice shown to experts. Optional. |

### Switching between Arc Testnet and Arc Mainnet

Two settings in `.env` choose the network and the contract (see `.env.example`):

```
VITE_CHAIN_ID=5042          # 5042 = Arc Mainnet, 5042002 = Arc Testnet
VITE_EXPERTPASS_ADDRESS=0x... # the ExpertPass contract on that same network
```

Everything else follows from them: the wallet network prompt, RPC endpoints, USDC address, explorer links, the network label in the sidebar, and the signing messages for profile photos. Restart the dev server (or rebuild) after changing them. A contract address only works on the network it was deployed to, so always change both together. The testnet "Get test USDC" hint is hidden on mainnet.

### Offchain data and backups

Avatars are public images. (Event links and cover image links are no longer stored here; they live onchain.) Commands:

- `bun run storage:test` runs the local storage checks; `TEST_DATABASE_URL=... bun run storage:test:remote` runs the Postgres and S3 checks.
- `bun run storage:export backup.json` and `bun run storage:import backup.json` copy everything to and from one file. Links stay encrypted in the file, so keep it apart from the key.
- `bun run storage:rotate` re-encrypts all links with the current key after you change `EXPERTPASS_ENCRYPTION_KEY`.

Without `DATABASE_URL` and `S3_BUCKET`, data sits on local disk, which a host such as a free Hugging Face Space resets on restart. Set them (see `docs/persistent-storage.md` for Supabase and Cloudflare R2 steps) and links, covers and avatars survive restarts and redeploys. `bun run storage:migrate` moves existing local data over.

### Contracts

```bash
bun run contracts:build   # forge build
bun run contracts:test    # forge test (unit, fuzz and invariant tests)
```

### Deploy the contract yourself

```bash
export PRIVATE_KEY=<your deployer key>
export OWNER=<address that can set the platform fee and withdraw fees>

forge create contracts/ExpertPass.sol:ExpertPass \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --constructor-args 0x3600000000000000000000000000000000000000 $OWNER 250
```

Constructor arguments: the Arc Testnet USDC address, the owner, and the platform fee in basis points (250 = 2.5%, maximum 1000). The fee is snapshotted per session at creation and collected when an expert withdraws. Use `0` for no fee. The owner calls `withdrawFees(to)` to collect it.

Then put the deployed address in `.env`:

```bash
echo "VITE_EXPERTPASS_ADDRESS=0xYourContract" >> .env
```

### Free static demo

The app also runs as plain static files (for example a free Hugging Face static Space) with no server. In that mode everything onchain works: browsing, buying tickets, refunds, certificates and expert names and bios. Profile photos are turned off, and the app says so where they would appear. Routes use the URL hash (`#/session/1`) on `*.hf.space` hosts, or when `VITE_HASH_ROUTER=true` is set at build time, so refreshing a page works without server rules.

### Production build

```bash
bun run build                 # static frontend in dist/
bun run server                # offchain API on :3001
```

Serve `dist/` and forward `/api/*` to the API (stripping nothing: the API expects the `/api` prefix). Keep the API's data directory on persistent storage.

## How ticket access works

- Tickets are ERC-1155 tokens, one token id per session. Buying pulls USDC into the contract, which holds it until the session ends.
- After the session ends, the expert withdraws the proceeds (minus the platform fee, if any). If the expert cancels before the start, every ticket holder is refunded in full automatically from escrow and their ticket NFTs are burned. The first 40 holders are refunded in the cancel transaction itself; for larger sessions the dashboard sends the rest in follow-up transactions (anyone can trigger them), and any holder whose payment could not be pushed can claim it from My Tickets.
- Once any ticket is sold, the date and duration are locked so buyers cannot be stranded.
- A session's cover is a public https image link saved onchain with the session (`getCoverUrl`); the app loads it directly from that address without sending a referrer, so only use images you may share. Profile photos are the one thing still stored by the offchain API.
- The event link is stored onchain with the session (`getEventLink`). **It is public chain data:** the app shows it only to ticket holders and the host, but anyone who reads the blockchain can see it. Protect the meeting itself with a passcode or waiting room, and use this for sessions where that is acceptable.
- Certificates are soulbound ERC-1155 tokens minted by the expert after the session.
