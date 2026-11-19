import { resolveChain } from './network-core'

const resolved = resolveChain(import.meta.env.VITE_CHAIN_ID as string | undefined)

/** The one network this build talks to. Everything (reads, writes, USDC, explorer links) follows it. */
export const APP_CHAIN = resolved.chain
export const CHAIN_ERROR = resolved.error
export const CHAIN_ID = APP_CHAIN.id
export const IS_MAINNET = !('testnet' in APP_CHAIN && APP_CHAIN.testnet) && APP_CHAIN.id === 5042
export const NETWORK_NAME = IS_MAINNET ? 'Arc Mainnet' : 'Arc Testnet'
