import { useState } from 'react'
import clsx from 'clsx'
import { avatarUrl } from '@/lib/api'

interface Props {
  name: string
  address: string
  version?: number | null
  size?: number
  className?: string
}

/** Uploaded avatar when present, otherwise a gradient tile with the expert's initial. */
export function ExpertAvatar({ name, address, version, size = 32, className }: Props) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.42)) }
  if (version && !failed) {
    return (
      <img
        src={avatarUrl(address, version)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        style={style}
        className={clsx('shrink-0 rounded-full object-cover ring-1 ring-line', className)}
      />
    )
  }
  return (
    <span
      style={style}
      className={clsx('display flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand2 font-bold text-accent-ink', className)}
      aria-hidden
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}
