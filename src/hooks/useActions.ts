import { useCallback } from 'react'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { erc20Abi, parseEventLogs, type Address, type Hash, type TransactionReceipt } from 'viem'
import { expertPassAbi } from '@/contracts/expertPassAbi'
import { CHAIN_ID, EXPERT_PASS_ADDRESS, USDC_ADDRESS } from '@/lib/constants'

export interface SessionInput {
  title: string
  description: string
  category: number
  price: bigint
  supply: number
  startTime: bigint
  duration: number
  transferable: boolean
  /** Stored onchain with the session. Public chain data; the app shows it only to ticket holders. */
  eventLink: string
  /** Public https image URL, or empty for none. Stored onchain with the session. */
  coverUrl: string
}

/** Typed wrappers around every state-changing call. Each waits for a successful receipt. */
export function useActions() {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const queryClient = useQueryClient()

  const exec = useCallback(
    async (send: () => Promise<Hash>): Promise<TransactionReceipt> => {
      if (!publicClient) throw new Error('RPC not ready')
      if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
      const hash = await send()
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Transaction reverted')
      await queryClient.invalidateQueries()
      return receipt
    },
    [chainId, publicClient, queryClient, switchChainAsync],
  )

  const address = EXPERT_PASS_ADDRESS as Address
  const base = { address, abi: expertPassAbi, chainId: CHAIN_ID } as const

  return {
    approveUsdc: (amount: bigint) =>
      exec(() =>
        writeContractAsync({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [address, amount], chainId: CHAIN_ID }),
      ),
    registerExpert: (name: string, bio: string) =>
      exec(() => writeContractAsync({ ...base, functionName: 'registerExpert', args: [name, bio] })),
    createSession: async (i: SessionInput) => {
      const receipt = await exec(() =>
        writeContractAsync({
          ...base,
          functionName: 'createSession',
          args: [i.title, i.description, i.category, i.price, i.supply, i.startTime, i.duration, i.transferable, i.eventLink, i.coverUrl],
        }),
      )
      const logs = parseEventLogs({ abi: expertPassAbi, logs: receipt.logs, eventName: 'SessionCreated' })
      const id = logs[0]?.args.id
      if (id === undefined) throw new Error('Session created but its id could not be read')
      return id
    },
    updateSession: (id: bigint, i: Pick<SessionInput, 'title' | 'description' | 'category' | 'startTime' | 'duration'>) =>
      exec(() =>
        writeContractAsync({
          ...base,
          functionName: 'updateSession',
          args: [id, i.title, i.description, i.category, i.startTime, i.duration],
        }),
      ),
    setCoverUrl: (id: bigint, coverUrl: string) =>
      exec(() => writeContractAsync({ ...base, functionName: 'setCoverUrl', args: [id, coverUrl] })),
    setEventLink: (id: bigint, eventLink: string) =>
      exec(() => writeContractAsync({ ...base, functionName: 'setEventLink', args: [id, eventLink] })),
    /**
     * Cancels the session; the contract refunds the first batch of holders in the same transaction.
     * If more holders remain, keeps calling processRefunds until everyone is refunded.
     */
    cancelSession: async (id: bigint, onProgress?: (pending: number) => void) => {
      await exec(() => writeContractAsync({ ...base, functionName: 'cancelSession', args: [id] }))
      for (let round = 0; round < 50; round++) {
        const pending = await publicClient?.readContract({ ...base, functionName: 'refundsPending', args: [id] })
        const left = Number(pending ?? 0n)
        onProgress?.(left)
        if (left === 0) return
        await exec(() => writeContractAsync({ ...base, functionName: 'processRefunds', args: [id, 100n] }))
      }
    },
    processRefunds: (id: bigint) => exec(() => writeContractAsync({ ...base, functionName: 'processRefunds', args: [id, 100n] })),
    buyTicket: (id: bigint) => exec(() => writeContractAsync({ ...base, functionName: 'buyTicket', args: [id] })),
    refund: (id: bigint) => exec(() => writeContractAsync({ ...base, functionName: 'refund', args: [id] })),
    withdrawProceeds: (id: bigint) => exec(() => writeContractAsync({ ...base, functionName: 'withdrawProceeds', args: [id] })),
    mintCertificates: (id: bigint, recipients: Address[]) =>
      exec(() => writeContractAsync({ ...base, functionName: 'mintCertificates', args: [id, recipients] })),
  }
}
