import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { ArrowLeft, Check, Lock, Repeat2 } from 'lucide-react'
import clsx from 'clsx'
import { toast } from 'sonner'
import { CoverImage } from '@/components/Cover'
import { ExpertGate } from '@/components/ExpertGate'
import { MAX_DESCRIPTION_BYTES, RichTextEditor, byteLength } from '@/components/RichTextEditor'
import { Card, Field, Spinner } from '@/components/ui'
import { useActions } from '@/hooks/useActions'
import { useCoverUrl, useEventLink, useSession } from '@/hooks/useExpertPass'
import { CATEGORIES } from '@/lib/constants'
import { localInputToUnix, parseTxError, unixToLocalInput } from '@/lib/format'
import { isValidCoverUrl, isValidEventLink } from '@/lib/messages'
import { Link, navigate, useNow } from '@/lib/router'
import { formatUsdc, parseUsdc } from '@/onchain-money'
import { sessionPhase, type Session } from '@/lib/types'

const DURATIONS = [
  { label: '30 minutes', value: 30 },
  { label: '45 minutes', value: 45 },
  { label: '1 hour', value: 60 },
  { label: '90 minutes', value: 90 },
  { label: '2 hours', value: 120 },
  { label: '3 hours', value: 180 },
  { label: 'Half day (4 hours)', value: 240 },
  { label: 'Full day (8 hours)', value: 480 },
]

type StepState = 'pending' | 'active' | 'done' | 'skipped'

export function SessionForm({ editId }: { editId: bigint | null }) {
  return (
    <div className="mx-auto max-w-3xl px-5 sm:px-6 py-8 sm:py-12">
      <Link to="/dashboard" className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-dim hover:text-ink">
        <ArrowLeft size={16} /> Dashboard
      </Link>
      <h1 className="display mt-2 text-4xl font-semibold">{editId === null ? 'Host a session' : 'Edit session'}</h1>{' '}
      <p className="mt-2 text-dim">
        {editId === null
          ? 'Set the details, price, and ticket supply. Ticket holders see your event link on the session page.'
          : 'Update the details learners see. Price, supply and ticket type cannot change after creation.'}
      </p>
      <div className="mt-8">
        <ExpertGate>{() => <Editor editId={editId} />}</ExpertGate>
      </div>
    </div>
  )
}

function Editor({ editId }: { editId: bigint | null }) {
  const { address } = useAccount()
  const now = useNow(30_000)
  const { session, isLoading } = useSession(editId)
  const eventLink = useEventLink(editId)
  const cover = useCoverUrl(editId)

  if (editId === null) return <EditorForm editId={null} session={null} initialLink="" initialCover="" />
  if (isLoading || eventLink.isLoading || cover.isLoading || !session) {
    return (
      <div className="flex justify-center py-24 text-dim">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  const notOwner = address && session.expert.toLowerCase() !== address.toLowerCase()
  if (notOwner || sessionPhase(session, now) !== 'upcoming') {
    return (
      <Card className="p-8 text-center">
        <h2 className="display text-xl font-semibold">{notOwner ? 'Not your session' : 'This session can no longer be edited'}</h2>{' '}
        <p className="mt-1 text-sm text-dim">
          {notOwner ? 'Only the host can edit it.' : 'Sessions can only be edited before they start, and never after cancellation.'}
        </p>
      </Card>
    )
  }
  return <EditorForm key={editId.toString()} editId={editId} session={session} initialLink={eventLink.link ?? ''} initialCover={cover.coverUrl} />
}

function EditorForm({
  editId,
  session,
  initialLink,
  initialCover,
}: {
  editId: bigint | null
  session: Session | null
  initialLink: string
  initialCover: string
}) {
  const actions = useActions()
  const editing = editId !== null

  const [title, setTitle] = useState(session?.title ?? '')
  const [description, setDescription] = useState(session?.description ?? '')
  const [category, setCategory] = useState(session?.category ?? 0)
  const [price, setPrice] = useState(session ? formatUsdc(session.price) : '10')
  const [supply, setSupply] = useState(session ? String(session.supply) : '25')
  const [start, setStart] = useState(() =>
    session ? unixToLocalInput(Number(session.startTime)) : unixToLocalInput(Math.ceil((Date.now() / 1000 + 86400) / 900) * 900),
  )
  const [duration, setDuration] = useState(session ? Math.round(session.duration / 60) : 60)
  const [link, setLink] = useState(initialLink)
  const [transferable, setTransferable] = useState(session?.transferable ?? true)
  const [coverInput, setCoverInput] = useState(initialCover)
  const [coverBroken, setCoverBroken] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [steps, setSteps] = useState<{ label: string; state: StepState }[] | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const locked = editing && (session?.sold ?? 0) > 0
  const coverTrim = coverInput.trim()
  const coverValid = coverTrim === '' || isValidCoverUrl(coverTrim)
  const durationOptions = useMemo(
    () => (DURATIONS.some((d) => d.value === duration) ? DURATIONS : [...DURATIONS, { label: `${duration} minutes`, value: duration }]),
    [duration],
  )

  const validate = () => {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Add a title.'
    else if (byteLength(title) > 120) e.title = 'Keep the title under 120 characters.'
    if (byteLength(description) > MAX_DESCRIPTION_BYTES) e.description = 'Description is too long.'
    if (!editing) {
      try {
        if (parseUsdc(price || '0') < 0n) throw new Error()
      } catch {
        e.price = 'Enter a valid USDC amount, up to 6 decimals.'
      }
      const n = Number(supply)
      if (!Number.isInteger(n) || n < 1 || n > 100000) e.supply = 'Choose between 1 and 100,000 tickets.'
    }
    if (!locked) {
      const ts = localInputToUnix(start)
      if (!Number.isFinite(ts) || ts <= Math.floor(Date.now() / 1000) + 60) e.start = 'Pick a start time in the future.'
    }
    if (!coverValid) e.cover = 'Use a public image link that starts with https:// (up to 512 characters).'
    if (!isValidEventLink(link.trim())) e.link = 'Enter a valid https:// event link (up to 512 characters).'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const mark = (list: { label: string; state: StepState }[], index: number, state: StepState) =>
    list.map((s, i) => (i === index ? { ...s, state } : s))

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setSubmitError(null)
    if (!validate()) return
    const startTime = BigInt(locked && session ? session.startTime : localInputToUnix(start))
    const durationSec = locked && session ? session.duration : duration * 60
    const linkChanged = editing && link.trim() !== initialLink
    const coverChanged = editing && coverTrim !== initialCover
    let list: { label: string; state: StepState }[] = editing
      ? [
          { label: 'Save changes onchain', state: 'active' },
          { label: 'Update event link onchain', state: linkChanged ? 'pending' : 'skipped' },
          { label: 'Update cover image link onchain', state: coverChanged ? 'pending' : 'skipped' },
        ]
      : [{ label: 'Create session onchain (event link and cover included)', state: 'active' }]
    setSteps(list)
    try {
      if (editing && editId !== null && session) {
        const changed =
          title.trim() !== session.title ||
          description !== session.description ||
          category !== session.category ||
          startTime !== session.startTime ||
          durationSec !== session.duration
        if (changed) {
          await actions.updateSession(editId, { title: title.trim(), description, category, startTime, duration: durationSec })
        }
        list = mark(list, 0, 'done')
        if (linkChanged) {
          list = mark(list, 1, 'active')
          setSteps(list)
          await actions.setEventLink(editId, link.trim())
          list = mark(list, 1, 'done')
        }
        if (coverChanged) {
          list = mark(list, 2, 'active')
          setSteps(list)
          await actions.setCoverUrl(editId, coverTrim)
          list = mark(list, 2, 'done')
        }
      } else {
        await actions.createSession({
          title: title.trim(),
          description,
          category,
          price: parseUsdc(price || '0'),
          supply: Number(supply),
          startTime,
          duration: durationSec,
          transferable,
          eventLink: link.trim(),
          coverUrl: coverTrim,
        })
        list = mark(list, 0, 'done')
      }
      setSteps(list)
      toast.success(editing ? 'Session updated' : 'Session published')
      navigate('/dashboard')
    } catch (e) {
      const msg = parseTxError(e) ?? 'Cancelled in wallet.'
      setSubmitError(msg)
      setSteps(null)
    }
  }

  const busy = steps !== null && !submitError

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-6" noValidate>
      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="display text-xl font-semibold">Basics</h2>
        <Field label="Title" hint={errors.title ? undefined : 'Be specific. Learners search by title.'}>
          <input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Designing resilient payment systems" />
          {errors.title && <FieldError>{errors.title}</FieldError>}
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-semibold">Description</span>
          <RichTextEditor value={description} onChange={setDescription} />
          {errors.description && <FieldError>{errors.description}</FieldError>}
        </div>
        <Field label="Category">
          <select className="input" value={category} onChange={(e) => setCategory(Number(e.target.value))}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="display text-xl font-semibold">Schedule</h2>
        {locked && (
          <p className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm text-dim">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
            Tickets have sold, so the date and duration are locked to protect buyers. You can still cancel and refund everyone.
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Date and time" hint="Shown in your local time zone.">
            <input type="datetime-local" className="input" value={start} disabled={locked} onChange={(e) => setStart(e.target.value)} />
            {errors.start && <FieldError>{errors.start}</FieldError>}
          </Field>
          <Field label="Duration">
            <select className="input" value={duration} disabled={locked} onChange={(e) => setDuration(Number(e.target.value))}>
              {durationOptions.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="display text-xl font-semibold">Tickets</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Price (USDC)" hint={editing ? 'Fixed after creation.' : 'Use 0 for a free session.'}>
            <input className="input num" inputMode="decimal" value={price} disabled={editing} onChange={(e) => setPrice(e.target.value)} />
            {errors.price && <FieldError>{errors.price}</FieldError>}
          </Field>
          <Field label="Total tickets" hint={editing ? 'Fixed after creation.' : 'Maximum NFT supply.'}>
            <input className="input num" inputMode="numeric" value={supply} disabled={editing} onChange={(e) => setSupply(e.target.value)} />
            {errors.supply && <FieldError>{errors.supply}</FieldError>}
          </Field>
        </div>
        <fieldset disabled={editing}>
          <legend className="mb-1.5 text-sm font-semibold">Ticket type</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { v: true, icon: Repeat2, title: 'Transferable', body: 'Learners can gift or resell their ticket.' },
              { v: false, icon: Lock, title: 'Soulbound', body: 'Locked to the buyer. Cannot be transferred.' },
            ].map((o) => (
              <label
                key={String(o.v)}
                className={clsx(
                  'flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors',
                  transferable === o.v ? 'border-brand bg-brand/10' : 'border-line',
                  editing && 'cursor-not-allowed opacity-60',
                )}
              >
                <input type="radio" name="ticket-type" className="sr-only" checked={transferable === o.v} onChange={() => setTransferable(o.v)} />
                <o.icon size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                <span>
                  <span className="block font-semibold">{o.title}</span>{' '}
                  <span className="block text-sm text-dim">{o.body}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="display text-xl font-semibold">Event link and cover</h2>
        <Field
          label="Event link"
          hint="Zoom, Google Meet, or any livestream URL. It is saved onchain with the session. The app shows it only to ticket holders, but anyone who reads the blockchain can see it, so protect the meeting itself with a passcode or waiting room."
        >
          <input className="input" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/abc-defg-hij" />
          {errors.link && <FieldError>{errors.link}</FieldError>}
        </Field>
        <Field
          label="Cover image link (optional)"
          hint="Paste a public image link that starts with https://. It is saved onchain and shown on session cards and the session page. Best at 16:9 (for example 1280 x 720); other shapes are shown whole. Only use images you are allowed to share."
        >
          <input
            className="input"
            type="url"
            inputMode="url"
            value={coverInput}
            onChange={(e) => {
              setCoverInput(e.target.value)
              setCoverBroken(false)
            }}
            placeholder="https://example.com/my-cover.jpg"
          />
          {errors.cover && <FieldError>{errors.cover}</FieldError>}
        </Field>
        <div className="flex aspect-video w-72 max-w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-muted text-center">
          {coverTrim && coverValid && !coverBroken ? (
            <CoverImage key={coverTrim} src={coverTrim} onError={() => setCoverBroken(true)} />
          ) : (
            <span className="px-4 text-xs text-dim">
              {coverTrim && coverValid && coverBroken ? 'That link did not load as an image. Check it opens in a browser.' : 'Preview appears here'}
            </span>
          )}
        </div>
      </Card>

      {steps && (
        <Card className="p-5" aria-live="polite">
          <ul className="space-y-2.5">
            {steps.map((s) => (
              <li key={s.label} className={clsx('flex items-center gap-3 text-sm', s.state === 'skipped' && 'hidden')}>
                <span
                  className={clsx(
                    'flex h-6 w-6 items-center justify-center rounded-full',
                    s.state === 'done' ? 'bg-good text-black' : s.state === 'active' ? 'bg-brand/20 text-brand' : 'bg-muted text-dim',
                  )}
                >
                  {s.state === 'done' ? <Check size={14} /> : s.state === 'active' ? <Spinner className="h-3.5 w-3.5" /> : null}
                </span>
                <span className={s.state === 'pending' ? 'text-dim' : 'font-medium'}>{s.label}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {submitError && (
        <p role="alert" className="text-sm text-bad">
          {submitError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link to="/dashboard" className="btn btn-ghost">
          Cancel
        </Link>
        <button type="submit" className="btn btn-primary sm:min-w-[200px]" disabled={busy}>
          {busy && <Spinner />}
          {busy ? 'Working...' : editing ? 'Save changes' : 'Publish session'}
        </button>
      </div>
    </form>
  )
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <span role="alert" className="mt-1.5 block text-xs font-medium text-bad">
      {children}
    </span>
  )
}
