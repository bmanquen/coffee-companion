import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { restoreDeadline } from '@coffee-companion/api/lib/account-restore-window'
import { planName } from '@coffee-companion/api/lib/plan'
import type {
  CurrentGrant,
  CurrentSubscription,
  EndedGrant,
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
import { loadPersonDeleteConfigured } from '@/lib/person-delete-configured'
import { authClient } from '@/lib/auth-client'
import { useSignOut } from '@/hooks/use-sign-out'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute('/_authenticated/account')({
  loader: async ({ context }) => {
    void context.queryClient.ensureQueryData(
      context.trpc.plan.current.queryOptions(),
    )
    return {
      personDeleteConfigured: await loadPersonDeleteConfigured(),
    }
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
      grant={current.grant}
      endedGrant={current.endedGrant}
      restoreBy={restoreDeadline(new Date())}
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

function day(date: Date) {
  return format(date, 'PPP')
}

function grantLiveCopy(grant: CurrentGrant) {
  const name = planName[grant.plan]
  const added =
    "This plan was added to your account, so there's no billing to manage."
  return grant.endsAt
    ? `You're on ${name} until ${day(grant.endsAt)}. ${added}`
    : `You're on ${name}. ${added}`
}

function grantEndedCopy(ended: EndedGrant) {
  return `Your ${planName[ended.plan]} plan ended on ${day(ended.endedAt)}.`
}

function grantRestoreCopy(grant: CurrentGrant, restoreBy: Date) {
  const name = planName[grant.plan]
  const before = day(restoreBy)
  return grant.endsAt
    ? `If you restore your account before ${before}, your ${name} plan comes back with it, as long as it hasn't ended by then.`
    : `If you restore your account before ${before}, your ${name} plan comes back with it.`
}

export function AccountScreen({
  user,
  plan,
  subscription,
  grant = null,
  endedGrant = null,
  restoreBy,
  onExport,
  onDelete,
  personDeleteConfigured = false,
}: {
  user: { name: string; email: string }
  plan: PlanId
  subscription: CurrentSubscription | null
  grant?: CurrentGrant | null
  endedGrant?: EndedGrant | null
  restoreBy?: Date
  onExport: () => Promise<void>
  onDelete: () => Promise<void>
  personDeleteConfigured?: boolean
}) {
  const restoreDate = restoreBy ?? restoreDeadline(new Date())
  const grantLine = grant ? grantRestoreCopy(grant, restoreDate) : null
  const cancelLine =
    "Your Subscription is cancelled now, and any time you've already paid for will not be refunded."

  let subscriptionCopy: string
  let subscriptionAction: 'manage' | 'plans' | null
  if (subscription) {
    subscriptionCopy = subscription.endsAt
      ? `${planName[subscription.plan]} until ${day(subscription.endsAt)}`
      : `${planName[subscription.plan]}, renewing`
    subscriptionAction = 'manage'
  } else if (grant) {
    subscriptionCopy = grantLiveCopy(grant)
    subscriptionAction = null
  } else if (endedGrant) {
    subscriptionCopy = grantEndedCopy(endedGrant)
    subscriptionAction = 'plans'
  } else {
    subscriptionCopy = "You don't have a subscription."
    subscriptionAction = 'plans'
  }
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
          <CardDescription>{subscriptionCopy}</CardDescription>
        </CardHeader>
        {subscriptionAction ? (
          <CardContent>
            {subscriptionAction === 'manage' ? (
              <Button variant="outline" onClick={manage}>
                Manage subscription
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link to="/pricing">See plans</Link>
              </Button>
            )}
          </CardContent>
        ) : null}
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
          <CardDescription className="flex flex-col gap-2">
            <span>
              Export a copy first. Your account data is kept for 30 days, then
              deleted.
            </span>
            {grantLine ? <span>{grantLine}</span> : null}
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
                  Your account data is kept for 30 days, then deleted. You can
                  restore it during that time.
                  {subscription ? ` ${cancelLine}` : null}
                  {grantLine ? ` ${grantLine}` : null}
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
