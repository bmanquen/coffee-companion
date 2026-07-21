import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { getForwardedHeaders } from '@/lib/request-headers'
import { Button } from '@/components/ui/button'
import { H1 } from '@/components/typography/h1'
import { EspressoBrewFeed } from '@/components/dashboard/espresso-brew-feed'
import { PouroverBrewFeed } from '@/components/dashboard/pourover-brew-feed'
import { FrenchpressBrewFeed } from '@/components/dashboard/frenchpress-brew-feed'
import { AeropressBrewFeed } from '@/components/dashboard/aeropress-brew-feed'
import { ColdBrewBrewFeed } from '@/components/dashboard/cold-brew-brew-feed'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({
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

  return <Dashboard />
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

// The dashboard is method-first: a switcher over one per-method Brew feed. The
// tabs run in the agreed order — Espresso, Pour Over, French Press, AeroPress,
// Cold Brew — each rendering its own method's reference-only feed.
type DashboardMethod =
  | 'espresso'
  | 'pourover'
  | 'frenchpress'
  | 'aeropress'
  | 'coldbrew'

const dashboardMethods: Array<{ value: DashboardMethod; label: string }> = [
  { value: 'espresso', label: 'Espresso' },
  { value: 'pourover', label: 'Pour Over' },
  { value: 'frenchpress', label: 'French Press' },
  { value: 'aeropress', label: 'AeroPress' },
  { value: 'coldbrew', label: 'Cold Brew' },
]

export function Dashboard() {
  const [selectedMethod, setSelectedMethod] =
    useState<DashboardMethod>('espresso')

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto gap-8 py-6">
      <H1>Dashboard</H1>
      <div className="flex flex-col w-full">
        <div className="flex gap-1 pl-3 -mb-px" role="tablist">
          {dashboardMethods.map((method) => {
            const isActive = selectedMethod === method.value
            return (
              <button
                key={method.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedMethod(method.value)}
                className={cn(
                  'relative rounded-t-lg border px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'z-10 border-border border-b-transparent bg-white text-foreground shadow-sm'
                    : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {method.label}
              </button>
            )
          })}
        </div>
        {selectedMethod === 'espresso' && <EspressoBrewFeed />}
        {selectedMethod === 'pourover' && <PouroverBrewFeed />}
        {selectedMethod === 'frenchpress' && <FrenchpressBrewFeed />}
        {selectedMethod === 'aeropress' && <AeropressBrewFeed />}
        {selectedMethod === 'coldbrew' && <ColdBrewBrewFeed />}
      </div>
    </div>
  )
}
