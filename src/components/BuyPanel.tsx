import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useReadContract } from 'wagmi'
import { CheckCircle2, ExternalLink, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { Spinner } from './ui'
import { AccessPanel } from './AccessPanel'
import { RefundButton } from './RefundButton'
import { expertPassAbi } from '@/contracts/expertPassAbi'
import { useActions } from '@/hooks/useActions'
import { useUsdc } from '@/hooks/useExpertPass'
import { CHAIN_ID, EXPERT_PASS_ADDRESS, IS_MAINNET } from '@/lib/constants'
import { formatPrice, parseTxError } from '@/lib/format'
import { remaining, sessionPhase, type Session } from '@/lib/types'
import type { Address } from 'viem'

type Step = 'idle' | 'approving' | 'buying'

interface Props {
  session: Session
  now: number
  balance: bigint
}

export function BuyPanel({ session, now, balance }: Props) {
  const { address, isConnected } = useAccount()
  const actions = useActions()
  const usdc = useUsdc()
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const phase = sessionPhase(session, now)
  const owns = balance > 0n

  const purchased = useReadContract({
    address: EXPERT_PASS_ADDRESS as Address,
    abi: expertPassAbi,
    chainId: CHAIN_ID,
    functionName: 'purchased',
    args: address ? [session.id, address] : undefined,
    query: { enabled: Boolean(address) },
  })

  if (owns) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl bg-good/15 px-4 py-3 text-good">
          <CheckCircle2 size={18} />
          <span className="font-semibold">You own this ticket</span>
        </div>
        {session.cancelled ? <RefundButton session={session} /> : <AccessPanel session={session} now={now} />}
      </div>
    )
  }

  const isExpert = address?.toLowerCase() === session.expert.toLowerCase()
  const soldOut = remaining(session) === 0
  const blocked =
    phase === 'cancelled'
      ? 'This session was cancelled.'
      : phase !== 'upcoming'
        ? 'Ticket sales closed when the session started.'
        : isExpert
          ? 'You are hosting this session.'
          : soldOut
            ? 'Sold out.'
            : purchased.data
              ? 'This wallet already bought a ticket for this session.'
              : null

  const short = usdc.balance !== undefined && usdc.balance < session.price

  const closed = phase === 'cancelled' ? 'This session was cancelled. Any tickets were refunded.' : phase !== 'upcoming' ? 'Ticket sales closed when the session started.' : soldOut ? 'This session is sold out.' : null
  if (closed) {
    return <p className="rounded-xl bg-muted px-4 py-3 text-sm font-medium text-ink-2">{closed}</p>
  }

  const onBuy = async () => {
    setError(null)
    try {
      const allowance = usdc.allowance ?? 0n
      if (session.price > 0n && allowance < session.price) {
        setStep('approving')
        await actions.approveUsdc(session.price)
        await usdc.refetch()
      }
      setStep('buying')
      await actions.buyTicket(session.id)
      toast.success('Ticket purchased. See you at the session!')
    } catch (e) {
      const msg = parseTxError(e)
      if (msg) {
        setError(msg)
        toast.error(msg)
      }
    } finally {
      setStep('idle')
      void usdc.refetch()
    }
  }

  return (
    <div className="space-y-3">
      {!isConnected ? (
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button type="button" className="btn btn-primary w-full !min-h-[52px] text-base" onClick={show}>
              Connect wallet to buy
            </button>
          )}
        </ConnectKitButton.Custom>
      ) : (
        <button
          type="button"
          className="btn btn-primary w-full !min-h-[52px] text-base"
          disabled={Boolean(blocked) || step !== 'idle' || short}
          onClick={() => void onBuy()}
        >
          {step === 'approving' ? (
            <>
              <Spinner /> Step 1 of 2: approve USDC
            </>
          ) : step === 'buying' ? (
            <>
              <Spinner /> Step 2 of 2: confirm purchase
            </>
          ) : (
            <>
              <Ticket size={18} />
              {session.price === 0n ? 'Claim free ticket' : `Buy ticket · ${formatPrice(session.price)}`}
            </>
          )}
        </button>
      )}
      {blocked && <p className="text-sm text-dim">{blocked}</p>}
      {isConnected && !blocked && short && (
        <p role="alert" className="text-sm text-bad">
          You need {formatPrice(session.price)} plus a little USDC for gas.{' '}
          {!IS_MAINNET && (
            <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
              Get test USDC <ExternalLink size={12} />
            </a>
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
      {!blocked && session.price > 0n && (
        <p className="text-xs text-dim">
          Your USDC is held by the contract until the session ends, then paid to the expert. If the expert cancels before the start, you get a full refund.
        </p>
      )}
    </div>
  )
}
