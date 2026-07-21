import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { getForwardedHeaders } from '@/lib/request-headers'
import { Button } from '@/components/ui/button'
import { H1 } from '@/components/typography/h1'
import { EspressoBrewFeed } from '@/components/dashboard/espresso-brew-feed'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const headers = await getForwardedHeaders()
    const { data: session } = await authClient.getSession({
      fetchOptions: { headers },
    })
    return { session }
  },
  // Warm the selected method's full brew history so the first tab renders
  // server-side instead of flashing a spinner. The feed reads it with
  // useSuspenseQuery.
  loader: async ({ context }) => {
    if (!context.session) return
    await context.queryClient.ensureQueryData(
      context.trpc.espressoShot.getAll.queryOptions(),
    )
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

// The dashboard is method-first: a switcher over one per-method Brew feed.
// The switcher only lists methods that are wired, so for now that's Espresso
// alone; the remaining methods arrive in a follow-up ticket.
type DashboardMethod =
  | 'espresso'
  | 'pourover'
  | 'frenchpress'
  | 'aeropress'
  | 'coldbrew'

const dashboardMethods: Array<{ value: DashboardMethod; label: string }> = [
  { value: 'espresso', label: 'Espresso' },
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
      </div>
    </div>
  )
}
