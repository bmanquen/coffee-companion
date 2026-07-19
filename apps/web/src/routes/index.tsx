import { createFileRoute } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'
import { getForwardedHeaders } from '@/lib/request-headers'
import { Button } from '@/components/ui/button'
import { H1 } from '@/components/typography/h1'
import { RecentDialedInShots } from '@/components/recent-dialed-in-shots'
import { DialedInAeropressBrews } from '@/components/dialed-in-aeropress-brews'
import { DialedInPouroverBrews } from '@/components/dialed-in-pourover-brews'
import { DialedInFrenchpressBrews } from '@/components/dialed-in-frenchpress-brews'
import { DialedInColdBrewBrews } from '@/components/dialed-in-cold-brew-brews'
import {
  RecentEspressoShots,
  PAGE_SIZE as SHOT_PAGE_SIZE,
} from '@/components/recent-espresso-shots'
import {
  PAGE_SIZE as COFFEE_PAGE_SIZE,
  RecentCoffees,
} from '@/components/recent-coffees'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const headers = await getForwardedHeaders()
    const { data: session } = await authClient.getSession({
      fetchOptions: { headers },
    })
    return { session }
  },
  // The paginated dashboard tables use useQuery (not useSuspenseQuery), so warm
  // their first page here to keep it server-rendered instead of flashing a
  // spinner on load. RecentDialedInShots still suspends and hydrates on its own.
  loader: async ({ context }) => {
    if (!context.session) return
    await Promise.all([
      context.queryClient.ensureQueryData(
        context.trpc.espressoShot.getRecent.queryOptions({
          limit: SHOT_PAGE_SIZE,
          offset: 0,
        }),
      ),
      context.queryClient.ensureQueryData(
        context.trpc.coffee.getRecent.queryOptions({
          limit: COFFEE_PAGE_SIZE,
          offset: 0,
        }),
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

function LandingPage() {
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

function Dashboard() {
  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto gap-8 py-6">
      <H1>Dashboard</H1>
      <RecentDialedInShots />
      <DialedInAeropressBrews />
      <DialedInPouroverBrews />
      <DialedInFrenchpressBrews />
      <DialedInColdBrewBrews />
      <RecentEspressoShots />
      <RecentCoffees />
    </div>
  )
}
