/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 *
 * The network is chosen by VITE_CHAIN_ID (see src/lib/network.ts and .env.example).
 */

import { fallback, http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { arc, arcTestnet } from 'viem/chains'
import { APP_CHAIN } from './lib/network'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(APP_CHAIN.id, APP_CHAIN.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [APP_CHAIN, mainnet], // Ethereum mainnet is only needed for ENS resolution
  connectors: [injected()],
  transports: {
    // Try each public endpoint in turn so one slow or down RPC does not break the app.
    [arcTestnet.id]: fallback(arcTestnet.rpcUrls.default.http.map((url) => http(url))),
    [arc.id]: fallback(arc.rpcUrls.default.http.map((url) => http(url))),
    [mainnet.id]: http(), // ENS resolution uses Ethereum mainnet
  },
})
