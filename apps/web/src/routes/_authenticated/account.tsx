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
import { authClient } from '@/lib/auth-client'
import { useSignOut } from '@/hooks/use-sign-out'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute('/_authenticated/account')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      context.trpc.plan.current.queryOptions(),
    ),
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
}: {
  user: { name: string; email: string }
  plan: PlanId
  subscription: CurrentSubscription | null
  onExport: () => Promise<void>
  onDelete: () => Promise<void>
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
            This cannot be undone. Export a copy first — that is the last chance
            to read what we hold.
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
                  This cannot be undone. Export a copy first if you still want
                  one. Deleting removes:
                </DialogDescription>
              </DialogHeader>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                <li>Your account and sign-in sessions</li>
                <li>
                  Your Coffees, Brews, Grinders, Brewing Devices, and the rest
                  of the library
                </li>
                <li>
                  A live Subscription, cancelled now so nothing keeps billing.
                  Unused prepaid time is not refunded.
                </li>
              </ul>
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
