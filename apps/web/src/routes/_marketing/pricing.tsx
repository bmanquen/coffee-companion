import { createFileRoute } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useState } from 'react'
import type { BillingPeriod, PlanId } from '@/lib/plans'
import { H1 } from '@/components/typography/h1'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  formatPrice,
  planFeatures,
  planIncludes,
  plans,
  priceSuffix,
} from '@/lib/plans'
import { marketingHead } from '@/lib/marketing-head'

const TITLE = 'Pricing — Coffee Companion'
const DESCRIPTION =
  'Free keeps your five most-recently-brewed Coffees. Pro keeps everything, searchable, on as much gear as you own. Logging is never limited on any plan.'

export const Route = createFileRoute('/_marketing/pricing')({
  head: () =>
    marketingHead({ title: TITLE, description: DESCRIPTION, path: '/pricing' }),
  component: PricingRoute,
})

// Both seams throw rather than no-op. No payment provider has been chosen and
// no waitlist exists yet, so a button that quietly did nothing would look
// shipped; this makes an unwired call to action impossible to miss.
function notImplemented(action: string) {
  return (planId: PlanId): never => {
    throw new Error(`${action} is not implemented yet (plan: ${planId})`)
  }
}

function PricingRoute() {
  return (
    <PricingPage
      onCheckout={notImplemented('Checkout')}
      onNotify={notImplemented('Interest registration')}
    />
  )
}

const faq: Array<{ question: string; answer: string }> = [
  {
    question: 'What happens to my old Brews on the Free plan?',
    answer:
      'Free reads the Brews of your five most-recently-brewed Coffees — your Shelf. When a Coffee drops off the Shelf, the Brews it holds at that moment are Sealed: still yours, still stored, but not readable until you upgrade. Nothing is ever deleted, and upgrading reopens all of it.',
  },
  {
    question: 'Can I still brew a Coffee that has fallen off the Shelf?',
    answer:
      'Yes. A Coffee off the Shelf stays fully usable — you can log new Brews against it whenever you like, and those Brews are readable straight away. What Free withholds is the past, not the Coffee.',
  },
  {
    question: 'Does sealing ever undo itself?',
    answer:
      'Not on Free. Brewing a Coffee again records new, readable Brews, but the ones sealed earlier stay sealed until you subscribe. Reading your own history back is the main thing a subscription buys.',
  },
  {
    question: 'Is there a limit on how much I can log?',
    answer:
      'No. Every plan logs unlimited Coffees and unlimited Brews across every Brewing Method. Free limits what you can read back, never what you can record.',
  },
  {
    question: 'What happens to my extra Grinders if I downgrade?',
    answer:
      'You keep them. Equipment limits only stop you adding more while you are over them — nothing you already own is removed or hidden, because your existing Brews reference it.',
  },
]

// The pricing page. Driven entirely by props — one callback for buying, one for
// registering interest in a Plan that is not sellable yet — so it renders bare
// in tests with no router and no network. Everything about the Plans
// themselves comes from the catalogue, not from this file.
export function PricingPage({
  onCheckout,
  onNotify,
}: {
  onCheckout: (planId: PlanId) => void
  onNotify: (planId: PlanId) => void
}) {
  const [period, setPeriod] = useState<BillingPeriod>('monthly')

  return (
    <div className="flex flex-col gap-16 py-12">
      <section className="flex flex-col items-center gap-6 text-center">
        <H1 className="text-4xl sm:text-5xl">Keep your history</H1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Logging is unlimited on every plan. What you pay for is reading your
          past back — the dial-ins you worked out months ago, still there when
          the same bag comes round again.
        </p>
        <BillingToggle period={period} onChange={setPeriod} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} className="flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                {!plan.sellable && <Badge variant="secondary">Coming soon</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{plan.tagline}</p>
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight">
                {formatPrice(plan.price[period])}
              </span>
              <span className="text-sm text-muted-foreground">
                {priceSuffix(period)}
              </span>
            </div>

            <Button
              className="w-full"
              variant={plan.sellable ? 'default' : 'outline'}
              onClick={() =>
                plan.sellable ? onCheckout(plan.id) : onNotify(plan.id)
              }
            >
              {plan.cta}
            </Button>

            <dl className="flex flex-col gap-3 border-t border-border pt-4">
              {planFeatures.map((feature) => (
                <div key={feature.label} className="flex flex-col gap-0.5">
                  <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {feature.label}
                    {feature.comingSoon && (
                      <Badge variant="outline" className="font-normal normal-case">
                        Coming soon
                      </Badge>
                    )}
                  </dt>
                  <dd className="text-sm">{feature.values[plan.id]}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold tracking-tight">
          On every plan, including Free
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {planIncludes.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Prices in USD, excluding any tax.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Questions</h2>
        <Accordion type="single" collapsible className="w-full">
          {faq.map(({ question, answer }) => (
            <AccordionItem key={question} value={question}>
              <AccordionTrigger>{question}</AccordionTrigger>
              <AccordionContent>{answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  )
}

function BillingToggle({
  period,
  onChange,
}: {
  period: BillingPeriod
  onChange: (period: BillingPeriod) => void
}) {
  const options: Array<{ value: BillingPeriod; label: string }> = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'annual', label: 'Annual' },
  ]

  return (
    <div
      role="group"
      aria-label="Billing period"
      className="inline-flex rounded-md border border-border p-1"
    >
      {options.map(({ value, label }) => (
        <Button
          key={value}
          size="sm"
          variant={period === value ? 'default' : 'ghost'}
          aria-pressed={period === value}
          onClick={() => onChange(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  )
}
