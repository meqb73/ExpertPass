# Deploy ExpertPass with Remix

This is for you to run yourself, outside Arc Studio. Arc Studio does not deploy to, sign for, or fund mainnet. Re-read the mainnet warning in the chat before you spend real funds, and get an independent audit first.

## Files

- `docs/ExpertPass.flattened.sol`: one self-contained file (about 6,600 lines, including OpenZeppelin 5.6.1). Paste or upload this into Remix. It needs no imports and no network access.
- `contracts/ExpertPass.sol`: the readable source (636 lines) that the tests and reviews ran against. It imports OpenZeppelin by path, so use the flattened file in Remix.

The flattened file compiles to exactly the same runtime code as the tested build (checked, ignoring the compiler's metadata hash).

## Remix compiler settings (must match)

| Setting | Value |
|---|---|
| Compiler | 0.8.28 |
| EVM version | cancun |
| Optimization | enabled, 200 runs |
| Via IR ("Use Yul") | off |
| Contract to deploy | `ExpertPass` (not any OpenZeppelin contract) |

### If Remix says the contract is too large (about 36,996 bytes)

That number is the size with the optimizer **off**, which is Remix's default. The Ethereum size limit is 24,576 bytes, and the contract only fits with the optimizer on. Measured on the flattened file:

| Remix setting | Runtime size | Deployable |
|---|---|---|
| Optimization **off** | 36,996 bytes | No, over the 24,576 limit |
| Optimization on, 200 runs | 22,858 bytes | Yes |
| Optimization on, 1 run | 22,619 bytes | Yes |

In Remix, open the Solidity compiler tab, tick **Enable optimization**, set it to **200**, set **EVM Version** to **cancun**, and compile again. Or, under Advanced Configurations, choose "Use configuration file" and load `docs/compiler_config.json` from this project. Remix does not remember the setting between workspaces, so check it before every compile. The contract is already deployed on Arc Testnet using the optimized build, so the same build fits.

## Constructor arguments

`constructor(address usdc_, address initialOwner, uint16 initialFeeBps)`

| Argument | Value |
|---|---|
| `usdc_` | USDC ERC-20 address on the network you deploy to. Arc (testnet and mainnet) lists `0x3600000000000000000000000000000000000000` with 6 decimals in Arc Studio's registry. Confirm it on the Arc explorer and Circle's docs before deploying. |
| `initialOwner` | YOUR wallet address. The owner can set the platform fee (0 to 10%) for future sessions and withdraw accrued fees. Ownership transfer is two-step. Never use the Arc Studio platform deployer wallet. |
| `initialFeeBps` | Platform fee in basis points, 0 to 1000. `0` = no fee, `250` = 2.5%. Applies to sessions created afterwards, and each session keeps the fee it was created with. |

Example: `0x3600000000000000000000000000000000000000, 0xYourWallet, 0`

## Networks (from Arc Studio's registry; verify against Arc's official docs)

| | Arc Testnet | Arc Mainnet |
|---|---|---|
| Chain ID | 5042002 | 5042 |
| RPC | https://rpc.testnet.arc.io | https://rpc.mainnet.arc.io |
| Explorer | https://explorer.testnet.arc.io | https://explorer.arc.io |
| Gas token | USDC (the same pool as the ERC-20 USDC, 18 decimals natively) | same |

In Remix choose "Injected Provider" and connect a wallet on the right network. The deploying wallet pays gas in USDC.

## After deploying

1. Copy the contract address.
2. Read `usdc()`, `owner()` and `feeBps()` in Remix and check they match what you intended.
3. Verify the source on the explorer (use the flattened file and the same compiler settings).
4. Create one small test session and buy and refund one ticket from a second wallet before any real use.
5. Tell Arc Studio the new address so the app can be pointed at it.

## Things to know about the design

- Event links and cover image links are stored onchain and are public chain data. The app only shows the event link to ticket holders and the host.
- Ticket sales close at the session start. The expert is paid after the session ends. If the host cancels before the start, holders are refunded from escrow.
- The contract holds ticket money until the payout or refund, so a bug here puts real funds at risk. The testnet reviews and tests are not a substitute for an independent audit.

## Point the app at your contract

After deploying, set these two values in `.env` (see `.env.example`) and restart the dev server or rebuild:

```
VITE_CHAIN_ID=5042
VITE_EXPERTPASS_ADDRESS=0xYourDeployedAddress
```

Use `5042` for Arc Mainnet and `5042002` for Arc Testnet. Both values are public in the built app. The static Hugging Face Space bakes them in at build time, so redeploy it after changing them.
