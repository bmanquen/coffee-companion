import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { BillingPeriod, PlanId, PlanPrice } from '@/lib/plans'
import { H1 } from '@/components/typography/h1'
import { authClient } from '@/lib/auth-client'
import { useTRPC } from '@/integrations/trpc/react'
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
  annualSavingPercent,
  formatPrice,
  isPaid,
  isSellable,
  planFeatures,
  planIncludes,
  plans,
  priceFor,
  priceSuffix,
} from '@/lib/plans'
import { pressFromSearch, returnLink } from '@/lib/pricing-press'
import { marketingHead } from '@/lib/marketing-head'

const TITLE = 'Pricing — Coffee Companion'
const DESCRIPTION =
  'Free keeps your five most-recently-brewed coffees. Pro keeps everything, searchable, on as much gear as you own. Logging is never limited on any plan.'

export const Route = createFileRoute('/_marketing/pricing')({
  head: () =>
    marketingHead({ title: TITLE, description: DESCRIPTION, path: '/pricing' }),
  validateSearch: pressFromSearch,
  // Awaited so the price is in the server-rendered HTML rather than appearing
  // after hydration.
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      context.trpc.plan.prices.queryOptions(),
    ),
  component: PricingRoute,
})

const planName = (planId: PlanId) =>
  plans.find((plan) => plan.id === planId)?.name ?? planId

function PricingRoute() {
  const { interest, checkout, period } = Route.useSearch()
  const navigate = Route.useNavigate()
  // Taken once, then dropped from the URL: it is the tail of one visitor's
  // press, not a link that buys or registers interest for whoever opens it.
  const [pressed] = useState({ interest, checkout, period })

  useEffect(() => {
    if (interest || checkout || period)
      void navigate({ search: {}, replace: true })
  }, [interest, checkout, period, navigate])

  return (
    <PricingScreen
      pendingInterest={pressed.interest}
      pendingCheckout={
        pressed.checkout && {
          planId: pressed.checkout,
          period: pressed.period ?? 'annual',
        }
      }
    />
  )
}

// Owns the search param's consequences and the network, so PricingPage below
// stays router-free and rendered bare in tests.
export function PricingScreen({
  pendingInterest,
  pendingCheckout,
}: {
  pendingInterest?: PlanId
  // A purchase pressed before signing in, reopened on arrival at the same Plan
  // and period, so the press survives the trip to the identity provider.
  pendingCheckout?: { planId: PlanId; period: BillingPeriod }
}) {
  const { data: session } = authClient.useSession()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const interest = useMutation(
    trpc.planInterest.register.mutationOptions({
      // So a return visit reads Registered rather than offering the press
      // again, which would mail nobody and claim otherwise.
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.planInterest.list.queryKey(),
        }),
    }),
  )
  const registered = useQuery({
    ...trpc.planInterest.list.queryOptions(),
    // Public page: only a signed-in visitor has interests to read.
    enabled: Boolean(session),
  })
  // What they are already on, so the page never tries to sell it to them.
  const held = useQuery({
    ...trpc.plan.current.queryOptions(),
    enabled: Boolean(session),
  })
  const prices = useQuery({
    ...trpc.plan.prices.queryOptions(),
    // What the loader fetched is what renders: prices change on the order of
    // months, and the server holds its own answer for fifteen minutes anyway.
    staleTime: 15 * 60 * 1000,
  })

  const registeredPlans = registered.data?.map(({ planId }) => planId) ?? []

  const registerInterest = async (planId: PlanId) => {
    if (!session) {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: returnLink({ interest: planId }),
        errorCallbackURL: '/pricing',
      })
      return 'signing-in' as const
    }

    await interest.mutateAsync({ planId })
    return 'recorded' as const
  }

  // Acted on only once what they already registered is known, so an old link
  // cannot re-register a Plan that is already on record.
  const carriedBack =
    pendingInterest &&
    session &&
    registered.isSuccess &&
    !registeredPlans.includes(pendingInterest)
      ? pendingInterest
      : undefined

  // Free is a call to action, not a purchase — it opens the app. Everything
  // else leaves for Checkout, where the price is chosen from the Plan and the
  // period and the tax is added on top.
  const startCheckout = async (planId: PlanId, period: BillingPeriod) => {
    if (!session) {
      await authClient.signIn.social({
        provider: 'google',
        // Free has nowhere to come back to — signing in is the whole of it.
        ...(planId === 'free'
          ? {}
          : { callbackURL: returnLink({ checkout: planId, period }) }),
        // Abandoned or refused at Google, the visitor lands back on the page
        // they pressed from rather than on the auth library's error page.
        errorCallbackURL: '/pricing',
      })
      return
    }

    if (planId === 'free') {
      window.location.href = '/dashboard'
      return
    }

    // Already theirs: the seller refuses to sell it a second time, and asking
    // them to try again would be asking for the same refusal.
    if (planId === held.data?.plan) {
      toast.success(`You are already on ${planName(planId)}`, {
        description: 'Nothing has been charged.',
      })
      return
    }

    const { error } = await authClient.subscription.upgrade({
      plan: planId,
      annual: period === 'annual',
      successUrl: '/dashboard',
      cancelUrl: '/pricing',
    })

    if (error) {
      toast.error('We could not open checkout', {
        description: 'You have not been charged. Please try again.',
      })
    }
  }

  // Only for a sellable Plan and a visitor who came back signed in: a hand-made
  // link cannot open checkout, and an abandoned sign-in is not retried. Held
  // last, so a Plan still unknown reopens nothing rather than sells twice.
  const reopened = useRef(false)
  useEffect(() => {
    if (!pendingCheckout || !session || reopened.current) return
    if (!isSellable(pendingCheckout.planId) || !held.isSuccess) return
    reopened.current = true
    void startCheckout(pendingCheckout.planId, pendingCheckout.period)
  }, [pendingCheckout, session, held.isSuccess])

  return (
    <PricingPage
      onCheckout={(planId, period) => void startCheckout(planId, period)}
      onNotify={registerInterest}
      registeredPlans={registeredPlans}
      heldPlan={held.data?.plan}
      pendingInterest={carriedBack}
      // Shown whether or not checkout reopens, so a visitor who came back
      // logged out still sees the period they chose.
      initialPeriod={pendingCheckout?.period}
      prices={prices.data ?? undefined}
    />
  )
}

const faq: Array<{ question: string; answer: string }> = [
  {
    question: 'What happens to my old brews on the Free plan?',
    answer:
      'Free reads the brews of your five most-recently-brewed coffees — your Shelf. When a coffee drops off the Shelf, the brews it holds at that moment are Sealed: still yours, still stored, but not readable until you upgrade. Nothing is ever deleted, and upgrading reopens all of it.',
  },
  {
    question: 'Can I still brew a coffee that has fallen off the Shelf?',
    answer:
      'Yes. A coffee off the Shelf stays fully usable — you can log new brews against it whenever you like, and those brews are readable straight away. What Free withholds is the past, not the coffee.',
  },
  {
    question: 'Does sealing ever undo itself?',
    answer:
      'Not on Free. Brewing a coffee again records new, readable brews, but the ones Sealed earlier stay Sealed until you subscribe. Reading your own history back is the main thing a subscription buys.',
  },
  {
    question: 'Is there a limit on how much I can log?',
    answer:
      'No. Every plan logs unlimited coffees and unlimited brews across every brewing method. Free limits what you can read back, never what you can record.',
  },
  {
    question: 'What happens if I cancel?',
    answer:
      'You keep reading everything until the period you have paid for runs out — cancelling takes effect at the end, not the moment you press it. After that your Shelf goes back to five coffees and what falls off is Sealed. Nothing is deleted: it all stays stored, and resubscribing reopens all of it. If a renewal payment fails, nothing is Sealed while your card is being retried; we tell you in the app so you can fix it first.',
  },
  {
    question: 'What happens to my extra grinders if I downgrade?',
    answer:
      'You keep them. Equipment limits only stop you adding more while you are over them — nothing you already own is removed or hidden, because your existing brews reference it.',
  },
  {
    question: 'Why will my card statement say Link?',
    answer:
      'Because Link is the merchant of record: you buy through Link, and Link handles the payment, the tax and any refund or dispute. Your card statement will read LINK.COM, receipts and subscription emails come from Link, and checkout says “Sold through Link”. If you see that name against this price, it is your subscription here.',
  },
  {
    question: 'Will I be charged in my own currency?',
    answer:
      'Yes. At checkout the price is converted into your own currency and that is what your card is charged, so the figure on your statement is the one you agreed to.',
  },
  {
    question: 'Is tax included in the price?',
    answer:
      'No. The prices shown exclude tax. Tax is added at checkout, calculated for your country, so the total you see there before you confirm is the total you pay.',
  },
]

// The pricing page. Driven entirely by props — one callback for buying, one for
// registering interest in a Plan that is not sellable yet — so it renders bare
// in tests with no router and no network. Everything about the Plans
// themselves comes from the catalogue, not from this file.
export function PricingPage({
  onCheckout,
  onNotify,
  registeredPlans = [],
  heldPlan,
  pendingInterest,
  initialPeriod = 'annual',
  prices,
}: {
  onCheckout: (planId: PlanId, period: BillingPeriod) => void
  onNotify: (planId: PlanId) => Promise<'recorded' | 'signing-in'>
  registeredPlans?: Array<PlanId>
  // What the visitor is already on, so the page stops offering to sell it.
  heldPlan?: PlanId
  // A Plan whose call to action was pressed before signing in, registered on
  // arrival so the press survives the trip to the identity provider.
  pendingInterest?: PlanId
  // The period to open on, so a selection made before signing in is still the
  // one on screen — and the one a second press would buy — on the way back.
  initialPeriod?: BillingPeriod
  // What the seller will charge. Absent for a Plan nobody can buy, and for all
  // of them when the seller cannot be reached; the catalogue covers those.
  prices?: Array<PlanPrice>
}) {
  const [period, setPeriod] = useState<BillingPeriod>(initialPeriod)
  const [justRegistered, setJustRegistered] = useState<Array<PlanId>>([])
  // More than one only if the seller charges in a currency the catalogue's
  // fallback amounts are not in, in which case no single one can be named.
  const currencies = [
    ...new Set(plans.map((plan) => priceFor(plan, period, prices).currency)),
  ]
  const registered = new Set([...registeredPlans, ...justRegistered])

  const registerInterest = async (planId: PlanId) => {
    const name = planName(planId)
    try {
      if ((await onNotify(planId)) === 'recorded') {
        setJustRegistered((already) => [...already, planId])
        toast.success(`Noted — you want ${name}`, {
          description: `${name} is not on sale yet, and you have not been charged.`,
        })
      }
    } catch {
      toast.error('That did not save', {
        description: 'Nothing has been charged. Please try again.',
      })
    }
  }

  const arrived = useRef(false)
  useEffect(() => {
    if (!pendingInterest || arrived.current) return
    arrived.current = true
    void registerInterest(pendingInterest)
  }, [pendingInterest])

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
        {plans.map((plan) => {
          // Only ever the state of a call to action that registers interest.
          // A sellable Plan keeps its purchase path whatever is on record.
          const isRegistered = !plan.sellable && registered.has(plan.id)
          const isSubscribed = plan.id === heldPlan && isPaid(plan.id)
          const cta = isSubscribed
            ? 'Subscribed'
            : isRegistered
              ? 'Registered'
              : plan.cta
          const { amount, currency } = priceFor(plan, period, prices)
          const saving =
            period === 'annual' ? annualSavingPercent(plan, prices) : null

          return (
            <Card key={plan.id} className="flex flex-col gap-5 p-6">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">{plan.name}</h2>
                  {!plan.sellable && (
                    <Badge variant="secondary">Coming soon</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{plan.tagline}</p>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight">
                    {formatPrice(amount, currency)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {priceSuffix(period)}
                  </span>
                </div>
                {/* Always laid out, so the toggle moves nothing below it. */}
                <p className="min-h-5 text-sm text-muted-foreground">
                  {saving !== null && `${saving}% less than paying monthly`}
                </p>
              </div>

              <Button
                className="w-full"
                variant={plan.sellable ? 'default' : 'outline'}
                disabled={isSubscribed || isRegistered}
                onClick={() => {
                  if (plan.sellable) onCheckout(plan.id, period)
                  else void registerInterest(plan.id)
                }}
              >
                {cta}
              </Button>

              <dl className="flex flex-col gap-3 border-t border-border pt-4">
                {planFeatures.map((feature) => (
                  <div key={feature.label} className="flex flex-col gap-0.5">
                    <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {feature.label}
                      {feature.comingSoon && (
                        <Badge
                          variant="outline"
                          className="font-normal normal-case"
                        >
                          Coming soon
                        </Badge>
                      )}
                    </dt>
                    <dd className="text-sm">{feature.values[plan.id]}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )
        })}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold tracking-tight">
          On every plan, including Free
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {planIncludes.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm">
              <Check
                className="h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          {currencies.length === 1
            ? `Prices in ${currencies[0]}, excluding any tax.`
            : 'Prices exclude any tax.'}
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
