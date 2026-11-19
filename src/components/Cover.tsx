import { useState } from 'react'
import clsx from 'clsx'
import { BookOpen, Briefcase, Code2, HeartPulse, Megaphone, Palette, Scale, Sparkles, type LucideIcon } from 'lucide-react'
import { CATEGORY_HUE } from '@/lib/constants'

const ICONS: LucideIcon[] = [Code2, HeartPulse, Briefcase, Palette, Megaphone, BookOpen, Scale, Sparkles]

/** Images this close to the frame's 16:9 shape are shown edge to edge; others are shown whole. */
const FRAME_RATIO = 16 / 9
const COVER_TOLERANCE = 0.14

interface CoverImageProps {
  src: string
  onError?: () => void
  className?: string
}

/**
 * Shows an uploaded image without awkward cropping.
 * - Close to 16:9: fills the frame (object-cover).
 * - Any other shape (portrait, square, ultrawide): the whole image is shown (object-contain) on top of a
 *   blurred copy of itself, so there are no empty bars and nothing important is cut off.
 */
export function CoverImage({ src, onError, className }: CoverImageProps) {
  const [ratio, setRatio] = useState<number | null>(null)
  const fits = ratio === null || Math.abs(ratio - FRAME_RATIO) / FRAME_RATIO <= COVER_TOLERANCE

  return (
    <div className={clsx('relative h-full w-full overflow-hidden bg-muted', className)}>
      {!fits && (
        <img
          src={src}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-2xl"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={(e) => setRatio(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))}
        onError={onError}
        className={clsx('relative h-full w-full', fits ? 'object-cover' : 'object-contain')}
      />
    </div>
  )
}

interface Props {
  category: number
  /** Public https image URL for the cover, if the host set one. */
  url: string | null | undefined
  className?: string
  iconSize?: number
}

/** Host-provided cover image when one exists, otherwise a category-tinted placeholder. Fills its parent. */
export function Cover({ category, url, className, iconSize = 40 }: Props) {
  const [failed, setFailed] = useState(false)
  const hue = CATEGORY_HUE[category] ?? 220
  const Icon = ICONS[category] ?? Sparkles
  if (url && !failed) {
    return <CoverImage src={url} onError={() => setFailed(true)} className={className} />
  }
  return (
    <div
      className={clsx('flex h-full w-full items-center justify-center', className)}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 38%) 0%, hsl(${(hue + 40) % 360} 65% 24%) 100%)`,
      }}
    >
      <Icon size={iconSize} className="text-white/85" strokeWidth={1.5} aria-hidden />
    </div>
  )
}
