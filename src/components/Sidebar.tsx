import { useEffect, useState } from 'react'
import { Compass, LayoutDashboard, Moon, Plus, Sun, Ticket } from 'lucide-react'
import clsx from 'clsx'
import { Logo } from './Logo'
import { CATEGORIES, CATEGORY_HUE, IS_MAINNET, NETWORK_NAME } from '@/lib/constants'
import { Link, setExploreParams, usePath, useQueryParam } from '@/lib/router'

export const NAV = [
  { to: '/', label: 'Explore', icon: Compass, match: (p: string) => p === '/' || p.startsWith('/session/') || p.startsWith('/expert/') },
  { to: '/tickets', label: 'My Tickets', icon: Ticket, match: (p: string) => p.startsWith('/tickets') },
  { to: '/dashboard', label: 'Expert Dashboard', icon: LayoutDashboard, match: (p: string) => p.startsWith('/dashboard') },
]

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem('expertpass-theme', dark ? 'dark' : 'light')
    } catch {
      /* storage unavailable */
    }
  }, [dark])
  return (
    <button
      type="button"
      className={clsx('btn btn-ghost !min-h-[42px] !w-[42px] !px-0', className)}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setDark((d) => !d)}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}

/** Desktop navigation rail. Hidden below the xl breakpoint (the top bar carries a compact nav there). */
export function Sidebar() {
  const path = usePath()
  const activeCat = useQueryParam('cat')
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] flex-col border-r border-line bg-side xl:flex">
      <div className="px-6 pb-6 pt-7">
        <Link to="/" aria-label="ExpertPass home">
          <Logo />
        </Link>
      </div>

      <nav className="px-4" aria-label="Primary">
        <p className="eyebrow !text-dim px-3 pb-3">Menu</p>
        <ul className="space-y-1">
          {NAV.map((n) => {
            const active = n.match(path)
            return (
              <li key={n.to}>
                <Link
                  to={n.to}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'group relative flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-[15px] font-semibold transition-colors',
                    active ? 'bg-brand/15 text-ink' : 'text-dim hover:bg-muted/60 hover:text-ink',
                  )}
                >
                  {active && <span className="absolute -left-4 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-brand to-brand2" aria-hidden />}
                  <n.icon size={19} className={clsx('transition-colors', active ? 'text-brand' : 'group-hover:text-ink')} aria-hidden />
                  {n.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <nav className="mt-8 min-h-0 flex-1 overflow-y-auto px-4 pb-4" aria-label="Categories">
        <p className="eyebrow !text-dim px-3 pb-3">Categories</p>
        <ul className="space-y-0.5">
          {CATEGORIES.map((c) => {
            const active = path === '/' && activeCat === String(c.id)
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setExploreParams({ cat: active ? null : String(c.id) })}
                  aria-pressed={active}
                  className={clsx(
                    'flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm font-medium transition-colors',
                    active ? 'bg-muted text-ink' : 'text-dim hover:bg-muted/50 hover:text-ink',
                  )}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `hsl(${CATEGORY_HUE[c.id] ?? 200} 80% 62%)` }} aria-hidden />
                  <span className="truncate">{c.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="space-y-3 border-t border-line p-4">
        <Link to="/dashboard/new" className="btn btn-primary w-full">
          <Plus size={18} /> Host a session
        </Link>
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-dim">
            <span className={IS_MAINNET ? 'h-2 w-2 rounded-full bg-brand' : 'h-2 w-2 rounded-full bg-good'} aria-hidden /> {NETWORK_NAME}
          </span>
          <ThemeToggle className="!min-h-[38px] !w-[38px]" />
        </div>
      </div>
    </aside>
  )
}
