import { useApiAvailable } from '@/hooks/useApiStatus'
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, X } from 'lucide-react'
import { toast } from 'sonner'
import { ExpertAvatar } from './ExpertAvatar'
import { Modal } from './Modal'
import { Field, Spinner } from './ui'
import { useActions } from '@/hooks/useActions'
import { useOffchain } from '@/hooks/useOffchain'
import { prepareAvatar } from '@/lib/api'
import { parseTxError } from '@/lib/format'

interface Props {
  initialName: string
  initialBio: string
  avatarVersion?: number | null
  onClose: () => void
}

/** Edit display name and bio (onchain) and the avatar (stored offchain, signed by the expert wallet). */
export function EditProfileModal({ initialName, initialBio, avatarVersion, onClose }: Props) {
  const apiAvailable = useApiAvailable()
  const { address } = useAccount()
  const actions = useActions()
  const offchain = useOffchain()
  const queryClient = useQueryClient()
  const [name, setName] = useState(initialName)
  const [bio, setBio] = useState(initialBio)
  const [avatar, setAvatar] = useState<{ blob: Blob; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return
    try {
      const blob = await prepareAvatar(file)
      setAvatar((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return { blob, url: URL.createObjectURL(blob) }
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not use that image')
    }
  }

  const textChanged = name.trim() !== initialName || bio.trim() !== initialBio

  const save = async () => {
    setError(null)
    if (!name.trim()) return setError('Enter the name learners will see.')
    if (new TextEncoder().encode(name.trim()).length > 64) return setError('Keep the name under 64 characters.')
    if (!textChanged && !avatar) return onClose()
    setBusy(true)
    try {
      if (textChanged) await actions.registerExpert(name.trim(), bio.trim())
      if (avatar) {
        await offchain.setAvatar(avatar.blob)
        await queryClient.invalidateQueries({ queryKey: ['avatar-meta'] })
      }
      toast.success('Profile updated')
      onClose()
    } catch (e) {
      const msg = parseTxError(e) ?? (e instanceof Error && e.message ? null : 'Cancelled in wallet.')
      setError(msg ?? (e instanceof Error ? e.message : 'Something went wrong.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Edit your profile" onClose={onClose}>
      <div className="flex items-center gap-5">
        {avatar ? (
          <img src={avatar.url} alt="New avatar preview" className="h-20 w-20 rounded-full object-cover ring-1 ring-line" />
        ) : (
          <ExpertAvatar name={name || initialName} address={address ?? ''} version={avatarVersion} size={80} />
        )}
        <div className="flex flex-wrap gap-2">
          {apiAvailable === false ? (
            <p className="max-w-[16rem] text-xs leading-relaxed text-dim">Profile photos are unavailable on the free demo. Your name and bio still save onchain.</p>
          ) : (
            <label className="btn btn-ghost btn-sm cursor-pointer">
              <Camera size={15} /> {avatar || avatarVersion ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => void pickAvatar(e.target.files?.[0])} />
            </label>
          )}
          {avatar && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                URL.revokeObjectURL(avatar.url)
                setAvatar(null)
              }}
            >
              <X size={15} /> Remove
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-5">
        <Field label="Display name">
          <input className="input" value={name} maxLength={64} onChange={(e) => setName(e.target.value)} placeholder="Dr. Maya Chen" />
        </Field>
        <Field label="Bio" hint={`${bio.length}/280`}>
          <textarea className="input !min-h-[110px] resize-y" value={bio} maxLength={280} onChange={(e) => setBio(e.target.value)} placeholder="Tell learners who you are and what you teach." />
        </Field>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-dim">
        Name and bio are public and stored onchain, so saving them needs a wallet transaction. Your photo is stored with the app and needs one free signature.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <button type="button" className="btn btn-ghost flex-1" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary flex-1" onClick={() => void save()} disabled={busy}>
          {busy && <Spinner />}
          {busy ? 'Saving...' : 'Save profile'}
        </button>
      </div>
    </Modal>
  )
}
