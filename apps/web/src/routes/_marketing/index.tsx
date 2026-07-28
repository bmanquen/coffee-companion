import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { Crosshair, Scale, Timer } from 'lucide-react'
import { HeroBrewTable } from '@/components/marketing/hero-brew-table'
import { dashboardMethods } from '@/components/dashboard/methods'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'
import { absoluteUrl } from '@/lib/site-url'
import { getForwardedHeaders } from '@/lib/request-headers'

const TITLE = 'Coffee Companion — remember how you dialed it in'
const DESCRIPTION =
  'Log every Brew across five Brewing Methods, mark the one that worked, and come back to it. A brewing logbook for people who want the same cup twice.'

export const Route = createFileRoute('/_marketing/')({
  head: () => {
    const url = absoluteUrl('/')
    const image = absoluteUrl('/og-default.svg')
    return {
      meta: [
        { title: TITLE },
        { name: 'description', content: DESCRIPTION },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: TITLE },
        { property: 'og:description', content: DESCRIPTION },
        { property: 'og:url', content: url },
        { property: 'og:image', content: image },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: TITLE },
        { name: 'twitter:description', content: DESCRIPTION },
        { name: 'twitter:image', content: image },
      ],
      links: [{ rel: 'canonical', href: url }],
    }
  },
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
    body: 'Dose in, yield out — the ratio that decides whether a cup is thin or syrupy.',
  },
  {
    icon: Timer,
    title: 'Grind and time',
    body: 'Your Grinder setting and how long it ran, on the Brewing Device you used.',
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
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Remember how you dialed it in
          </h1>
          <p className="text-lg text-muted-foreground">
            You pulled a great shot on Tuesday. By Friday the grind has moved,
            the bag is older, and you are guessing again. Coffee Companion keeps
            the Brew that worked so you can pull it back.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={onSignIn}>
              Start logging — free
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
            One logbook, every Brewing Method
          </h2>
          <p className="text-muted-foreground">
            Each Brewing Method records the settings that actually matter to it
            — a Cold Brew steeps for hours and has no shot time, an Espresso
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
          What a Brew captures
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
            <Crosshair className="h-7 w-7 shrink-0 text-primary" aria-hidden="true" />
            Mark the one that worked
          </h2>
          <p className="text-muted-foreground">
            When a Brew finally tastes right, mark it{' '}
            <strong className="font-semibold text-foreground">Dialed-in</strong>
            . It becomes the reference for that Coffee — the settings you
            reproduce next time, kept apart from the dozen attempts that got you
            there.
          </p>
        </div>
      </section>

      <section className="flex flex-col items-start gap-5 border-t border-border pt-12">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight">
          Stop re-learning the same coffee
        </h2>
        <Button size="lg" onClick={onSignIn}>
          Start logging — free
        </Button>
      </section>
    </div>
  )
}
