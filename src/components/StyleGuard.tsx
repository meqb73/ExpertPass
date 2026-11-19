import { useEffect, useState } from 'react'

/**
 * Safety net: if the Tailwind utility stylesheet is missing (for example the dev server was started from the
 * wrong folder), the layout collapses. Detect that, reload once, and otherwise show a clear message.
 * The console error is also captured in console.jsonl so the cause can be diagnosed.
 */
export function StyleGuard() {
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => {
      const probe = document.createElement('div')
      probe.className = 'hidden'
      document.body.appendChild(probe)
      const ok = getComputedStyle(probe).display === 'none'
      probe.remove()
      if (ok) {
        try {
          sessionStorage.removeItem('expertpass-style-reload')
        } catch {
          /* storage unavailable */
        }
        return
      }
      console.error('[expertpass] Tailwind utility styles are missing. Restart the dev server from the project root.')
      let retried = false
      try {
        retried = sessionStorage.getItem('expertpass-style-reload') === '1'
        if (!retried) sessionStorage.setItem('expertpass-style-reload', '1')
      } catch {
        retried = true
      }
      if (!retried) window.location.reload()
      else setBroken(true)
    }, 1200)
    return () => window.clearTimeout(t)
  }, [])

  if (!broken) return null
  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        inset: '16px 16px auto 16px',
        zIndex: 10000,
        padding: '14px 18px',
        borderRadius: 14,
        background: '#3a1620',
        color: '#ffd9df',
        border: '1px solid #8a2c3e',
        font: '14px/1.5 system-ui, sans-serif',
      }}
    >
      The page styles did not load, so the layout looks broken. Restart the dev server from the project folder and reload.
    </div>
  )
}
