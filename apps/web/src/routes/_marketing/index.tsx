import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { Crosshair, Scale, Timer } from 'lucide-react'
import { dashboardMethods } from '@/components/dashboard/methods'
import { HeroBrewTable } from '@/components/marketing/hero-brew-table'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'
import { marketingHead } from '@/lib/marketing-head'
import { getForwardedHeaders } from '@/lib/request-headers'

const TITLE = 'Coffee Companion — coffee brew log and dial-in tracker'
const DESCRIPTION =
  'Log every brew across espresso, pour over, French press, AeroPress and cold brew. Save the grind, dose and time that worked, so the next bag starts where the last one ended.'

export const Route = createFileRoute('/_marketing/')({
  head: () =>
    marketingHead({ title: TITLE, description: DESCRIPTION, path: '/' }),
  beforeLoad: async () => {
    const headers = await getForwardedHeaders()
    const { data: session } = await authClient.getSession({
      fetchOptions: { headers },
    })
    // Signed-in users have no use for the public page — send them to the app
    // rather than making them read a pitch for something they already use.
    if (session) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: MarketingHomeRoute,
})

function MarketingHomeRoute() {
  return (
    <MarketingHome
      onSignIn={() => authClient.signIn.social({ provider: 'google' })}
    />
  )
}

// What a Brew records, in the language of the glossary. These are the fields
// every method captures regardless of how it brews.
const brewCaptures = [
  {
    icon: Scale,
    title: 'The weights',
    body: 'Dose in, yield out — the real numbers, as you weighed them, not a figure derived from them.',
  },
  {
    icon: Timer,
    title: 'Grind and time',
    body: 'Your grinder setting and how long it ran, on the brewing device you used.',
  },
  {
    icon: Crosshair,
    title: 'What it tasted like',
    body: 'Notes while it is still in your mouth, against the numbers that produced it.',
  },
]

// The public home page. Driven entirely by props — a single sign-in callback —
// so it renders bare in tests with no router, no session and no network.
export function MarketingHome({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="flex flex-col gap-24 py-12">
      <section className="flex flex-col gap-8">
        <div className="flex max-w-2xl flex-col gap-5">
          <H1 className="text-4xl sm:text-5xl">
            Dial it in once. Never guess again.
          </H1>
          <p className="text-lg text-muted-foreground">
            Working out a new bag costs you a week of mornings and the beans
            that went down the sink — then you buy it again and start over.
            Coffee Companion holds the grind, dose, time and yield of the brew
            that worked, so the second bag starts where the first one ended.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={onSignIn}>
              Save your first brew — free
            </Button>
            <Link
              to="/pricing"
              className="rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/10"
            >
              See pricing
            </Link>
          </div>
        </div>
        <HeroBrewTable />
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex max-w-2xl flex-col gap-3">
          <h2 className="text-3xl font-bold tracking-tight">
            One place for every brewing method
          </h2>
          <p className="text-muted-foreground">
            Each brewing method records the settings that actually matter to it
            — a cold brew steeps for hours and has no shot time, an espresso
            lives and dies by a two-second window. No lowest common denominator.
          </p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {dashboardMethods.map(({ value, label }) => (
            <li
              key={value}
              className="rounded-full border border-border px-4 py-2 text-sm font-medium"
            >
              {label}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight">
          The variables you would otherwise be trying to remember
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {brewCaptures.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="flex flex-col gap-2 p-5">
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex max-w-2xl flex-col gap-3">
          <h2 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Crosshair
              className="h-7 w-7 shrink-0 text-primary"
              aria-hidden="true"
            />
            Mark the one that worked
          </h2>
          <p className="text-muted-foreground">
            When a brew finally tastes right, mark it{' '}
            <strong className="font-semibold text-foreground">Dialed-in</strong>
            . It becomes the reference for that coffee — the settings you
            reproduce next time, kept apart from the dozen attempts that got you
            there.
          </p>
        </div>
      </section>

      <section className="flex flex-col items-start gap-5 border-t border-border pt-12">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight">
          Stop learning the same coffee twice
        </h2>
        <p className="max-w-2xl text-muted-foreground">
          Every bag you work out from scratch costs you the same week of
          mornings and the same handful of throwaway cups. You only have to pay
          that once.
        </p>
        <Button size="lg" onClick={onSignIn}>
          Save your first brew — free
        </Button>
      </section>
    </div>
  )
}
