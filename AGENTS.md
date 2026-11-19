# ExpertPass

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

Onchain expert session marketplace on Arc Testnet. Experts host sessions with limited ERC-1155 NFT tickets bought in USDC; the event link is stored onchain (`getEventLink`, public chain data, shown in the app only to holders); cover images are public https URLs stored onchain (`getCoverUrl`); the offchain API (`server/`) keeps expert avatars only.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```


## Deployed contracts

- Network: `VITE_CHAIN_ID` (5042002 Arc Testnet default, 5042 Arc Mainnet) + `VITE_EXPERTPASS_ADDRESS`, resolved in `src/lib/network.ts` (shared logic `network-core.ts`, also used by `server/`). Currently set to Arc Mainnet with the Remix-deployed contract `0x8Fe79B3311497CFc3e6b7130A36c8a210671EE1C` (owner `0x2F7CAcB450982fe7C7e8DDE29c4d7943a15fB638`, feeBps 500, USDC `0x3600…0000`; read-only checks done, never deployed by Arc Studio).
- ExpertPass (Arc Testnet): `0xdec618bb277e4ab5857dfdd4dfc7ae645a7c6148` (v4: event link and cover URL onchain; earlier deployments 0xc195f68ba9bc2cbbe299f42746e500a92d71c071, 0x0fd4e61144e630c5ea002fe604474d243e576dff and 0xe4aa43714502725f3d391fe45d2154f3a13cd62b are abandoned), USDC `0x3600000000000000000000000000000000000000`, owner = platform deployer wallet, platform fee 0 bps. Address lives in `.env` as `VITE_EXPERTPASS_ADDRESS`.

## Architecture notes

- Contract: `contracts/ExpertPass.sol`; ABI mirrored in `src/contracts/expertPassAbi.ts` (regenerate from `contracts/out` after any contract change).
- Offchain API: `server/app.ts` mounted at `/api` by the Vite plugin in `server/vite-plugin.ts` (dev) or run standalone with `bun run server`. Storage layer in `server/storage/`: `MetaRepo` (JSON file or Postgres via `DATABASE_URL`) + `BlobStore` (local files or S3-compatible bucket via `S3_BUCKET`), AES-256-GCM link encryption (`EXPERTPASS_ENCRYPTION_KEY`, required with remote storage). Setup in `docs/persistent-storage.md`; tests `bun run storage:test` and `storage:test:remote`. Data lives outside the project: `EXPERTPASS_DATA_DIR`, else `/data/expertpass`, else `~/.expertpass`. The old `./data` folder is migrated automatically and removed.
- Signed-message formats for covers and avatars are shared in `src/lib/messages.ts` (browser and server must agree). Event links need no signature: they are read from the contract.
- Schedule (date and duration) is locked once a ticket is sold. Payout is available only after the session ends. Sales close at the start time.
- Routing is a tiny History API router in `src/lib/router.tsx`.
- Expert profiles: name and bio live onchain (`registerExpert`); avatars are stored by the offchain API (`/api/avatars/:address`, signed by the expert wallet, max 512 KB). Public page route: `/expert/:address`.
