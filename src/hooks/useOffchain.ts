import { useCallback } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { putAvatar, sha256Hex } from '@/lib/api'
import { CHAIN_ID, EXPERT_PASS_ADDRESS } from '@/lib/constants'
import { avatarSetMessage } from '@/lib/messages'

const now = () => Math.floor(Date.now() / 1000)

/** Wallet-signed calls to the offchain API (profile photos). */
export function useOffchain() {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const contract = EXPERT_PASS_ADDRESS as string

  const setAvatar = useCallback(
    async (blob: Blob) => {
      if (!address) throw new Error('Connect your wallet first')
      const ts = now()
      const sha256 = await sha256Hex(blob)
      const signature = await signMessageAsync({
        message: avatarSetMessage({ chainId: CHAIN_ID, contract, address, issuedAt: ts, sha256 }),
      })
      await putAvatar(address, { blob, ts, signature })
    },
    [address, contract, signMessageAsync],
  )

  return { setAvatar }
}
