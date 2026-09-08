import { Link, createFileRoute } from '@tanstack/react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { planName } from '@coffee-companion/api/lib/plan'
import type {
  CurrentSubscription,
  PlanId,
} from '@coffee-companion/api/lib/plan'
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

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function AccountContainer() {
  const { session } = Route.useRouteContext()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { data: current } = useSuspenseQuery(trpc.plan.current.queryOptions())

  const onExport = async () => {
    const data = await queryClient.fetchQuery(
      trpc.account.export.queryOptions(),
    )
    downloadJson('coffee-companion-export.json', data)
  }

  return (
    <AccountScreen
      user={session.user}
      plan={current.plan}
      subscription={current.subscription}
      onExport={onExport}
    />
  )
}

export function AccountScreen({
  user,
  plan,
  subscription,
  onExport,
}: {
  user: { name: string; email: string }
  plan: PlanId
  subscription: CurrentSubscription | null
  onExport: () => Promise<void>
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

  const exportData = async () => {
    try {
      await onExport()
    } catch {
      toast.error('We could not export your data', {
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

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>
            A copy of your account, Coffees, and Brews, including Sealed Brews.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={exportData}>
            Export data
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
