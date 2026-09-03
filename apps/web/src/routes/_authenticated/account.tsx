import { Link, createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { planName } from '@coffee-companion/api/lib/plan'
import type { PlanId } from '@coffee-companion/api/lib/plan'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute('/_authenticated/account')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(context.trpc.plan.current.queryOptions()),
  component: AccountContainer,
})

function AccountContainer() {
  const { session } = Route.useRouteContext()
  const trpc = useTRPC()
  const { data: held } = useSuspenseQuery(trpc.plan.current.queryOptions())

  return (
    <AccountScreen
      user={session.user}
      plan={held.plan}
      subscription={held.subscription}
    />
  )
}

export function AccountScreen({
  user,
  plan,
  subscription,
}: {
  user: { name: string; email: string }
  plan: PlanId
  subscription: { plan: PlanId; endsAt: Date | null } | null
}) {
  const manage = async () => {
    const { error } = await authClient.subscription.billingPortal({
      returnUrl: '/account',
    })
    if (error) {
      toast.error('We could not open your billing settings', {
        description: 'Please try again.',
      })
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <H1>Account</H1>

      <Card>
        <CardHeader>
          <CardTitle>{user.name}</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <span className="text-muted-foreground">Plan</span>{' '}
          <span className="font-medium">{planName[plan]}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          {subscription ? (
            <CardDescription>
              {subscription.endsAt
                ? `${planName[subscription.plan]} until ${format(subscription.endsAt, 'PPP')}`
                : `${planName[subscription.plan]}, renewing`}
            </CardDescription>
          ) : (
            <CardDescription>You have no Subscription.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {subscription ? (
            <Button variant="outline" onClick={manage}>
              Manage subscription
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link to="/pricing">See plans</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
