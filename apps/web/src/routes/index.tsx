import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type {
  DashboardMethod,
  MethodFeed,
} from '@/components/dashboard/methods'
import { authClient } from '@/lib/auth-client'
import { getForwardedHeaders } from '@/lib/request-headers'
import { Button } from '@/components/ui/button'
import { H1 } from '@/components/typography/h1'
import { EspressoBrewFeed } from '@/components/dashboard/espresso-brew-feed'
import { PouroverBrewFeed } from '@/components/dashboard/pourover-brew-feed'
import { FrenchpressBrewFeed } from '@/components/dashboard/frenchpress-brew-feed'
import { AeropressBrewFeed } from '@/components/dashboard/aeropress-brew-feed'
import { ColdBrewBrewFeed } from '@/components/dashboard/cold-brew-brew-feed'
import { MethodPicker } from '@/components/dashboard/method-picker'
import {
  isDashboardMethod,
  resolveSelectedMethod,
} from '@/components/dashboard/methods'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute('/')({
  // The selected method lives in the URL so it survives reload/back and can be
  // deep-linked. Anything not a known method is dropped, so a stale or malformed
  // link falls back to the most-recent default rather than a broken screen.
  validateSearch: (
    search: Record<string, unknown>,
  ): { method?: DashboardMethod } => {
    const method =
      typeof search.method === 'string' ? search.method : undefined
    return isDashboardMethod(method) ? { method } : {}
  },
  beforeLoad: async () => {
    const headers = await getForwardedHeaders()
    const { data: session } = await authClient.getSession({
      fetchOptions: { headers },
    })
    return { session }
  },
  // Warm every method's full brew history so any tab renders server-side
  // instead of flashing a spinner when selected. Each feed reads its own with
  // useSuspenseQuery.
  loader: async ({ context }) => {
    if (!context.session) return
    await Promise.all([
      context.queryClient.ensureQueryData(
        context.trpc.espressoShot.getAll.queryOptions(),
      ),
      context.queryClient.ensureQueryData(
        context.trpc.pouroverBrew.getAll.queryOptions(),
      ),
      context.queryClient.ensureQueryData(
        context.trpc.frenchpressBrew.getAll.queryOptions(),
      ),
      context.queryClient.ensureQueryData(
        context.trpc.aeropressBrew.getAll.queryOptions(),
      ),
      context.queryClient.ensureQueryData(
        context.trpc.coldBrewBrew.getAll.queryOptions(),
      ),
    ])
  },
  component: Home,
})

function Home() {
  const { session } = Route.useRouteContext()

  if (!session) {
    return <LandingPage />
  }

  return <DashboardContainer />
}

export function LandingPage() {
  const handleSignIn = () => {
    authClient.signIn.social({ provider: 'google' })
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <h1 className="text-4xl font-bold tracking-tight">Coffee Companion</h1>
      <p className="text-muted-foreground text-lg">
        Track your coffees and dial in your espresso.
      </p>
      <Button size="lg" onClick={handleSignIn}>
        Sign in with Google
      </Button>
    </div>
  )
}

// Router-aware wiring for the dashboard: reads the selected method from the URL
// (falling back to the most-recent Brew), and writes it back on selection. Owns
// the search param so the Dashboard component below stays router-free and easy
// to test. The per-method feeds are warmed in the loader; the queries here just
// supply the recency fallback when no method is in the URL.
function DashboardContainer() {
  const trpc = useTRPC()
  const { data: espresso } = useSuspenseQuery(
    trpc.espressoShot.getAll.queryOptions(),
  )
  const { data: pourover } = useSuspenseQuery(
    trpc.pouroverBrew.getAll.queryOptions(),
  )
  const { data: frenchpress } = useSuspenseQuery(
    trpc.frenchpressBrew.getAll.queryOptions(),
  )
  const { data: aeropress } = useSuspenseQuery(
    trpc.aeropressBrew.getAll.queryOptions(),
  )
  const { data: coldbrew } = useSuspenseQuery(
    trpc.coldBrewBrew.getAll.queryOptions(),
  )

  const { method } = Route.useSearch()
  const navigate = Route.useNavigate()

  const feeds: Array<MethodFeed> = [
    { method: 'espresso', brews: espresso },
    { method: 'pourover', brews: pourover },
    { method: 'frenchpress', brews: frenchpress },
    { method: 'aeropress', brews: aeropress },
    { method: 'coldbrew', brews: coldbrew },
  ]

  const selectedMethod = resolveSelectedMethod(method, feeds)

  return (
    <Dashboard
      selectedMethod={selectedMethod}
      onSelectMethod={(next) => navigate({ search: { method: next } })}
      feeds={feeds}
      now={new Date()}
    />
  )
}

// The dashboard is method-first: a picker over one per-method Brew feed. The
// picker lists every method (see MethodPicker), and the selected one renders its
// own method's reference-only feed. Driven entirely by props — the selected
// method, a callback to change it, the feeds behind the picker rows, and `now`
// for relative times — so it holds no router or query state and renders bare in
// tests.
export function Dashboard({
  selectedMethod,
  onSelectMethod,
  feeds,
  now,
}: {
  selectedMethod: DashboardMethod
  onSelectMethod: (method: DashboardMethod) => void
  feeds: Array<MethodFeed>
  now: Date
}) {
  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto gap-8 py-6">
      <H1>Dashboard</H1>
      <div className="flex flex-col w-full gap-3">
        <MethodPicker
          selectedMethod={selectedMethod}
          onSelectMethod={onSelectMethod}
          feeds={feeds}
          now={now}
        />
        {selectedMethod === 'espresso' && <EspressoBrewFeed />}
        {selectedMethod === 'pourover' && <PouroverBrewFeed />}
        {selectedMethod === 'frenchpress' && <FrenchpressBrewFeed />}
        {selectedMethod === 'aeropress' && <AeropressBrewFeed />}
        {selectedMethod === 'coldbrew' && <ColdBrewBrewFeed />}
      </div>
    </div>
  )
}
