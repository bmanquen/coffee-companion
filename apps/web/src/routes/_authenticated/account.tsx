import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { posthogPersonConfig } from '@/lib/posthog-person'
import { authClient } from '@/lib/auth-client'
import { useSignOut } from '@/hooks/use-sign-out'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute('/_authenticated/account')({
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(
      context.trpc.plan.current.queryOptions(),
    )
    return { personDeleteConfigured: posthogPersonConfig() !== null }
  },
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
  const navigate = useNavigate()
  const signOut = useSignOut()
  const { personDeleteConfigured } = Route.useLoaderData()
  const { data: current } = useSuspenseQuery(trpc.plan.current.queryOptions())
  const deleteAccount = useMutation(trpc.account.delete.mutationOptions())

  const onExport = async () => {
    const data = await queryClient.fetchQuery(
      trpc.account.export.queryOptions(),
    )
    downloadJson('coffee-companion-export.json', data)
  }

  const onDelete = async () => {
    await deleteAccount.mutateAsync()
    try {
      await signOut()
    } catch {
      navigate({ to: '/' })
    }
  }

  return (
    <AccountScreen
      user={session.user}
      plan={current.plan}
      subscription={current.subscription}
      onExport={onExport}
      onDelete={onDelete}
      personDeleteConfigured={personDeleteConfigured}
    />
  )
}

function deleteFailureDescription(error: unknown) {
  if (
    error instanceof Error &&
    (error as { data?: { code?: string } }).data?.code === 'PRECONDITION_FAILED'
  ) {
    return error.message
  }
  return 'Please try again.'
}

export function AccountScreen({
  user,
  plan,
  subscription,
  onExport,
  onDelete,
  personDeleteConfigured = false,
}: {
  user: { name: string; email: string }
  plan: PlanId
  subscription: CurrentSubscription | null
  onExport: () => Promise<void>
  onDelete: () => Promise<void>
  personDeleteConfigured?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [exporting, setExporting] = useState(false)
  const busy = pending || exporting

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
    setExporting(true)
    try {
      await onExport()
    } catch {
      toast.error('We could not export your data', {
        description: 'Please try again.',
      })
    } finally {
      setExporting(false)
    }
  }

  const confirmDelete = async () => {
    setPending(true)
    try {
      await onDelete()
      setConfirming(false)
    } catch (error) {
      toast.error('We could not delete your account', {
        description: deleteFailureDescription(error),
      })
    } finally {
      setPending(false)
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
          <Button variant="outline" disabled={busy} onClick={exportData}>
            Export data
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Export a copy first. Your account and library are kept for 30 days,
            then deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={confirming} onOpenChange={setConfirming}>
            <DialogTrigger asChild>
              <Button variant="destructive" disabled={busy}>
                Delete account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete account</DialogTitle>
                <DialogDescription>
                  Your account and library are kept for 30 days, then deleted.
                  You can restore them during that time. Your Subscription is
                  cancelled now, and any time you've already paid for is not
                  refunded.
                  {personDeleteConfigured
                    ? ' Your PostHog profile is deleted when those 30 days end.'
                    : null}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" disabled={busy} onClick={exportData}>
                  Export data
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={confirmDelete}
                >
                  Delete account
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}
