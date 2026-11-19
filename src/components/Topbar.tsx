import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Search, Wallet, X } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import clsx from 'clsx'
import { Logo } from './Logo'
import { NAV, ThemeToggle } from './Sidebar'
import { useUsdc } from '@/hooks/useExpertPass'
import { formatPrice, shortAddress } from '@/lib/format'
import { Link, currentPath, setExploreParams, usePath, useQueryParam } from '@/lib/router'

function SearchBox({ className }: { className?: string }) {
  const q = useQueryParam('q')
  return (
    <div
      className={clsx(
        'group flex items-center gap-2 rounded-2xl border border-line bg-card/80 px-4 transition-all focus-within:border-brand focus-within:shadow-glow hover:border-brand/40',
        className,
      )}
      role="search"
    >
      <Search size={18} className="shrink-0 text-dim transition-colors group-focus-within:text-brand" aria-hidden />{' '}
      <input
        value={q}
        onChange={(e) => setExploreParams({ q: e.target.value }, { replace: currentPath() === '/' })}
        placeholder="Search sessions, topics, or experts"
        aria-label="Search sessions or experts"
        className="min-h-[48px] w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-dim"
      />
      {q && (
        <button type="button" aria-label="Clear search" onClick={() => setExploreParams({ q: null }, { replace: true })} className="rounded-md p-1 text-dim hover:text-ink">
          <X size={16} />
        </button>
      )}
    </div>
  )
}

function Balance() {
  const { isConnected } = useAccount()
  const { balance } = useUsdc()
  if (!isConnected || balance === undefined) return null
  return (
    <span className="num hidden items-center gap-2 rounded-xl border border-line bg-card/70 px-3.5 py-2.5 text-sm font-semibold sm:inline-flex">
      <TokenUSDC variant="branded" size={16} />
      {formatPrice(balance, false)}
    </span>
  )
}

export function Topbar() {
  const path = usePath()
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 backdrop-blur-xl">
      <div className="flex h-[72px] items-center gap-3 px-5 sm:gap-4 sm:px-8">
        <Link to="/" className="shrink-0 xl:hidden" aria-label="ExpertPass home">
          <Logo size={34} compact />
        </Link>
        <SearchBox className="hidden max-w-xl flex-1 md:flex" />
        <div className="ml-auto flex items-center gap-3">
          <Balance />
          <ThemeToggle className="xl:hidden" />
          <ConnectKitButton.Custom>
            {({ isConnected, show, address }) => (
              <button type="button" onClick={show} className={isConnected ? 'btn btn-ghost !min-h-[44px]' : 'btn btn-primary !min-h-[44px]'}>
                <Wallet size={16} />
                {isConnected && address ? (
                  shortAddress(address)
                ) : (
                  <>
                    <span className="hidden sm:inline">Connect wallet</span>
                    <span className="sm:hidden">Connect</span>
                  </>
                )}
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </div>
      <div className="space-y-3 px-5 pb-3 sm:px-8 md:hidden">
        <SearchBox />
      </div>
      <nav className="flex gap-2 overflow-x-auto px-5 pb-3 sm:px-8 xl:hidden" aria-label="Primary mobile">
        {NAV.map((n) => {
          const active = n.match(path)
          return (
            <Link
              key={n.to}
              to={n.to}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-semibold',
                active ? 'border-brand/40 bg-brand/15 text-ink' : 'border-line text-dim',
              )}
            >
              <n.icon size={15} aria-hidden />
              {n.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
