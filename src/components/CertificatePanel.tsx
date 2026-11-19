import { useMemo, useState } from 'react'
import { useReadContracts } from 'wagmi'
import { Award } from 'lucide-react'
import { toast } from 'sonner'
import type { Address } from 'viem'
import { Modal } from './Modal'
import { Spinner } from './ui'
import { expertPassAbi } from '@/contracts/expertPassAbi'
import { useActions } from '@/hooks/useActions'
import { certificateId, useExperts, useParticipants } from '@/hooks/useExpertPass'
import { CHAIN_ID, EXPERT_PASS_ADDRESS } from '@/lib/constants'
import { parseTxError, shortAddress } from '@/lib/format'
import type { Session } from '@/lib/types'

export function CertificatePanel({ session, onClose }: { session: Session; onClose: () => void }) {
  const actions = useActions()
  const { participants, total } = useParticipants(session.id, true)
  const names = useExperts(participants)
  const [busy, setBusy] = useState(false)

  const base = { address: EXPERT_PASS_ADDRESS as Address, abi: expertPassAbi, chainId: CHAIN_ID } as const
  const balances = useReadContracts({
    contracts: participants.flatMap((p) => [
      { ...base, functionName: 'balanceOf' as const, args: [p, session.id] as const },
      { ...base, functionName: 'balanceOf' as const, args: [p, certificateId(session.id)] as const },
    ]),
    query: { enabled: participants.length > 0 },
  })

  const rows = useMemo(
    () =>
      participants.map((p, i) => {
        const t = balances.data?.[i * 2]
        const c = balances.data?.[i * 2 + 1]
        const holds = t?.status === 'success' && (t.result) > 0n
        const certified = c?.status === 'success' && (c.result) > 0n
        return { address: p, holds, certified, eligible: holds && !certified }
      }),
    [participants, balances.data],
  )
  const eligible = rows.filter((r) => r.eligible).map((r) => r.address)
  const loading = balances.isLoading

  const mint = async () => {
    setBusy(true)
    try {
      await actions.mintCertificates(session.id, eligible.slice(0, 100))
      toast.success(`Minted ${Math.min(eligible.length, 100)} attendance certificates`)
      await balances.refetch()
    } catch (e) {
      const msg = parseTxError(e)
      if (msg) toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Attendance certificates" onClose={onClose}>
      <p className="text-sm text-dim">
        Mint a soulbound certificate NFT to everyone who still holds a ticket for <strong className="text-ink">{session.title}</strong>. Certificates cannot be transferred.
      </p>
      <div className="mt-4 max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
        {total === 0 ? (
          <p className="p-4 text-sm text-dim">No ticket holders yet.</p>
        ) : (
          rows.map((r) => (
            <div key={r.address} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 truncate">
                {names.get(r.address.toLowerCase())?.registered ? names.get(r.address.toLowerCase())?.name : <span className="mono">{shortAddress(r.address)}</span>}
              </span>
              <span className={r.certified ? 'text-good' : r.holds ? 'text-ink-2' : 'text-dim'}>
                {loading ? '...' : r.certified ? 'Certified' : r.holds ? 'Eligible' : 'Ticket transferred or refunded'}
              </span>
            </div>
          ))
        )}
      </div>
      {total > 100 && <p className="mt-2 text-xs text-dim">Showing the first 100 of {total} holders.</p>}
      <button type="button" className="btn btn-primary mt-5 w-full" disabled={busy || eligible.length === 0} onClick={() => void mint()}>
        {busy ? <Spinner /> : <Award size={16} />}
        {eligible.length === 0 ? 'Nobody left to certify' : `Mint to ${eligible.length} attendee${eligible.length === 1 ? '' : 's'}`}
      </button>
    </Modal>
  )
}
