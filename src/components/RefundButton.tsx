import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Spinner } from './ui'
import { useActions } from '@/hooks/useActions'
import { formatPrice, parseTxError } from '@/lib/format'
import type { Session } from '@/lib/types'

export function RefundButton({ session }: { session: Session }) {
  const actions = useActions()
  const [busy, setBusy] = useState(false)
  const onClick = async () => {
    setBusy(true)
    try {
      await actions.refund(session.id)
      toast.success('Refunded')
    } catch (e) {
      const msg = parseTxError(e)
      if (msg) toast.error(msg)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-warn">
        Cancelled by the expert. Your refund is sent automatically; if it has not arrived yet you can claim it here.
      </p>
      <button type="button" className="btn btn-primary w-full" onClick={() => void onClick()} disabled={busy}>
        {busy ? <Spinner /> : <Undo2 size={16} />}
        Claim refund{session.price > 0n ? ` · ${formatPrice(session.price)}` : ''}
      </button>
    </div>
  )
}
