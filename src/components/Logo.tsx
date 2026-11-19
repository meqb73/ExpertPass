import { useId } from 'react'
import clsx from 'clsx'

/**
 * ExpertPass mark: a rounded ticket with side notches and a bold "E", on a blue to violet gradient.
 * The notches are real cut-outs (mask), so the mark works on any background.
 */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={clsx('shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38BDF8" />
          <stop offset="0.55" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id={`s${id}`} x1="24" y1="0" x2="24" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`m${id}`}>
          <rect width="48" height="48" rx="13" fill="#fff" />
          <circle cx="0" cy="24" r="5" fill="#000" />
          <circle cx="48" cy="24" r="5" fill="#000" />
        </mask>
      </defs>
      <g mask={`url(#m${id})`}>
        <rect width="48" height="48" fill={`url(#g${id})`} />
        <rect width="48" height="48" fill={`url(#s${id})`} />
      </g>
      <path
        d="M16 13h17a2 2 0 0 1 0 4H20v4h11a2 2 0 0 1 0 4H20v4h13a2 2 0 0 1 0 4H16a2 2 0 0 1-2-2V15a2 2 0 0 1 2-2Z"
        fill="#fff"
      />
      <path d="M38 14v2.5M38 20.5V23M38 27v2.5M38 33.5V36" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ size = 40, className, compact }: { size?: number; className?: string; compact?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-3', className)}>
      <LogoMark size={size} className="drop-shadow-[0_6px_18px_rgba(56,189,248,0.35)]" />{' '}
      <span className={clsx('display text-[1.4rem] font-bold leading-none tracking-tight', compact && 'max-[430px]:hidden')}>
        Expert<span className="gradient-text">Pass</span>
      </span>
    </span>
  )
}
