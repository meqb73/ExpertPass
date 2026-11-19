import { Sidebar } from '@/components/Sidebar'
import { StyleGuard } from '@/components/StyleGuard'
import { Topbar } from '@/components/Topbar'
import { Card } from '@/components/ui'
import { Dashboard } from '@/pages/Dashboard'
import { Home } from '@/pages/Home'
import { MyTickets } from '@/pages/MyTickets'
import { SessionDetail } from '@/pages/SessionDetail'
import { SessionForm } from '@/pages/SessionForm'
import { ExpertProfile } from '@/pages/ExpertProfile'
import { CHAIN_ERROR, EXPERT_PASS_ADDRESS, NETWORK_NAME } from '@/lib/constants'
import { Link, matchPath, usePath } from '@/lib/router'

function parseId(raw: string | undefined): bigint | null {
  return raw && /^\d{1,12}$/.test(raw) ? BigInt(raw) : null
}

function Routes() {
  const path = usePath()
  if (path === '/') return <Home />
  if (path === '/tickets') return <MyTickets />
  if (path === '/dashboard') return <Dashboard />
  if (path === '/dashboard/new') return <SessionForm editId={null} />

  const session = matchPath('/session/:id', path)
  const sid = parseId(session?.id)
  if (sid !== null) return <SessionDetail id={sid} />

  const expert = matchPath('/expert/:address', path)
  if (expert?.address) return <ExpertProfile address={expert.address} />

  const edit = matchPath('/dashboard/edit/:id', path)
  const eid = parseId(edit?.id)
  if (eid !== null) return <SessionForm editId={eid} />

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="display text-3xl font-semibold">Page not found</h1>
      <Link to="/" className="btn btn-primary mt-6">
        Back to sessions
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <div className="min-h-dvh">
      <StyleGuard />
      <Sidebar />
      <div className="flex min-h-dvh flex-col xl:pl-[272px]">
        <Topbar />
        <main className="flex-1">
          {CHAIN_ERROR ? (
            <div className="mx-auto max-w-lg px-4 py-24">
              <Card className="p-6 text-center">
                <h1 className="display text-xl font-semibold">Unsupported network setting</h1>
                <p className="mt-2 text-sm text-dim">{CHAIN_ERROR} Fix it in .env and restart the dev server.</p>
              </Card>
            </div>
          ) : EXPERT_PASS_ADDRESS ? (
            <Routes />
          ) : (
            <div className="mx-auto max-w-lg px-4 py-24">
              <Card className="p-6 text-center">
                <h1 className="display text-xl font-semibold">Contract address missing</h1>
                <p className="mt-2 text-sm text-dim">Set VITE_EXPERTPASS_ADDRESS to the deployed ExpertPass contract and restart the dev server.</p>
              </Card>
            </div>
          )}
        </main>
        <footer className="border-t border-line px-5 py-8 pb-24 text-sm text-dim sm:px-8">
          Live expert sessions with NFT tickets, paid in USDC on {NETWORK_NAME}.
        </footer>
      </div>
    </div>
  )
}
