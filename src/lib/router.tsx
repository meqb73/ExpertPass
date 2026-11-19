import { useEffect, useState, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react'

const NAV_EVENT = 'expertpass:navigate'

/**
 * Static hosts such as a Hugging Face static Space serve no fallback page for deep links, so a refresh on
 * "/session/1" would 404. On those hosts the route lives in the URL hash ("#/session/1") instead.
 */
const HASH_MODE =
  typeof window !== 'undefined' && (/\.hf\.space$/.test(window.location.hostname) || import.meta.env.VITE_HASH_ROUTER === 'true')

function readLocation(): { pathname: string; search: string } {
  if (!HASH_MODE) return { pathname: window.location.pathname, search: window.location.search }
  const raw = window.location.hash.slice(1) || '/'
  const q = raw.indexOf('?')
  return q === -1 ? { pathname: raw, search: '' } : { pathname: raw.slice(0, q), search: raw.slice(q) }
}

/** Current route path ("/session/1"), whichever routing mode is active. */
export const currentPath = () => readLocation().pathname

function subscribe(cb: () => void) {
  window.addEventListener('popstate', cb)
  window.addEventListener('hashchange', cb)
  window.addEventListener(NAV_EVENT, cb)
  return () => {
    window.removeEventListener('popstate', cb)
    window.removeEventListener('hashchange', cb)
    window.removeEventListener(NAV_EVENT, cb)
  }
}

export const usePath = () => useSyncExternalStore(subscribe, () => readLocation().pathname)

/** Read one query-string parameter, re-rendering when the URL changes. */
export function useQueryParam(name: string): string {
  const search = useSyncExternalStore(subscribe, () => readLocation().search)
  return new URLSearchParams(search).get(name) ?? ''
}

/** Update query parameters on the Explore page (path "/"), keeping the others. */
export function setExploreParams(patch: Record<string, string | null>, opts: { replace?: boolean } = {}) {
  const params = new URLSearchParams(readLocation().pathname === '/' ? readLocation().search : '')
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '') params.delete(k)
    else params.set(k, v)
  }
  const qs = params.toString()
  navigate(qs ? `/?${qs}` : '/', opts)
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const here = readLocation()
  if (to === here.pathname + here.search) return
  const url = HASH_MODE ? `${window.location.pathname}${window.location.search}#${to}` : to
  if (opts.replace) window.history.replaceState({}, '', url)
  else window.history.pushState({}, '', url)
  window.dispatchEvent(new Event(NAV_EVENT))
  window.scrollTo({ top: 0 })
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string
  children: ReactNode
}

export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
  return (
    <a href={HASH_MODE ? `#${to}` : to} onClick={handle} {...rest}>
      {children}
    </a>
  )
}

/** Match "/session/:id" style patterns. Returns params or null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean)
  const a = path.split('/').filter(Boolean)
  if (p.length !== a.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    const seg = p[i]
    const val = a[i]
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(val)
    else if (seg !== val) return null
  }
  return params
}

/** Re-render once per `intervalMs`, returning the current unix time in seconds. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
