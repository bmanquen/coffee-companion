import { useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { isPendingDeletion } from '@/lib/pending-deletion'
import { getForwardedHeaders } from '@/lib/request-headers'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute('/restore-account')({
  beforeLoad: async () => {
    const headers = await getForwardedHeaders()
    const { data: session } = await authClient.getSession({
      fetchOptions: { headers },
    })
    if (!session) {
      throw redirect({ to: '/' })
    }
    if (!isPendingDeletion(session.user)) {
      throw redirect({ to: '/dashboard' })
    }
    return { session }
  },
  component: RestoreAccountRoute,
})

function RestoreAccountRoute() {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const restore = useMutation(trpc.account.restore.mutationOptions())

  const onRestore = async () => {
    await restore.mutateAsync()
    await navigate({ to: '/dashboard' })
  }

  return <RestoreAccountScreen onRestore={onRestore} />
}

export function RestoreAccountScreen({
  onRestore,
}: {
  onRestore: () => Promise<void>
}) {
  const [pending, setPending] = useState(false)

  const confirm = async () => {
    setPending(true)
    try {
      await onRestore()
    } catch {
      toast.error('We could not restore your account', {
        description: 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <H1>Restore account</H1>
      <Card>
        <CardHeader>
          <CardTitle>Your account is waiting to be restored</CardTitle>
          <CardDescription>
            Your Subscription stays cancelled. Restoring your account does not
            start a new one, and any time you've already paid for is still not
            refunded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled={pending} onClick={confirm}>
            Restore account
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
