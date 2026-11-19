import { useState, type ReactNode } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { GraduationCap, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Card, EmptyState, Field, Spinner } from './ui'
import { useActions } from '@/hooks/useActions'
import { useMyExpertProfile } from '@/hooks/useExpertPass'
import { parseTxError } from '@/lib/format'

/** Renders children only for a connected wallet that has an expert profile; otherwise guides them there. */
export function ExpertGate({ children }: { children: (profileName: string) => ReactNode }) {
  const { isConnected } = useAccount()
  const { profile, isLoading } = useMyExpertProfile()

  if (!isConnected) {
    return (
      <EmptyState
        icon={<Wallet />}
        title="Connect your wallet"
        body="Your wallet is your expert account. Connect it to host sessions and get paid in USDC."
        action={
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button type="button" onClick={show} className="btn btn-primary">
                Connect wallet
              </button>
            )}
          </ConnectKitButton.Custom>
        }
      />
    )
  }
  if (isLoading) {
    return (
      <div className="flex justify-center py-24 text-dim">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (!profile?.registered) return <BecomeExpert />
  return <>{children(profile.name)}</>
}

function BecomeExpert() {
  const actions = useActions()
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Enter the name learners will see.')
    setBusy(true)
    try {
      await actions.registerExpert(name.trim(), bio.trim())
      toast.success('Expert profile created')
    } catch (err) {
      const msg = parseTxError(err)
      if (msg) setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mx-auto max-w-lg p-6 sm:p-8">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/15 text-brand">
        <GraduationCap size={24} />
      </span>
      <h2 className="display mt-4 text-2xl font-semibold">Become an expert</h2>{' '}
      <p className="mt-1 text-sm text-dim">Create your public profile once. It is stored onchain and shown on every session you host.</p>
      <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
        <Field label="Display name">
          <input className="input" value={name} maxLength={64} onChange={(e) => setName(e.target.value)} placeholder="Dr. Maya Chen" />
        </Field>
        <Field label="Short bio" hint={`${bio.length}/280`}>
          <textarea
            className="input !min-h-[96px] resize-y"
            value={bio}
            maxLength={280}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Staff engineer at a payments company. 10 years building distributed systems."
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy && <Spinner />}
          {busy ? 'Confirm in wallet...' : 'Create expert profile'}
        </button>
      </form>
    </Card>
  )
}
