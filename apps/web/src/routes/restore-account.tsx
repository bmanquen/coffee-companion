import { useEffect, useState } from 'react'
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
import { restoreDeadlineCopy } from '@/lib/restore-deadline'
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
  const { session } = Route.useRouteContext()
  const trpc = useTRPC()
  const navigate = useNavigate()
  const restore = useMutation(trpc.account.restore.mutationOptions())

  const onRestore = async () => {
    await restore.mutateAsync()
    await navigate({ to: '/dashboard' })
  }

  return (
    <RestoreAccountScreen
      deletedAt={deletedAtFrom(session.user)}
      onRestore={onRestore}
    />
  )
}

function deletedAtFrom(user: object): Date | string {
  if (!('deletedAt' in user)) {
    throw new Error('pending deletion is missing deletedAt')
  }
  const deletedAt = user.deletedAt
  if (deletedAt instanceof Date) return deletedAt
  if (typeof deletedAt === 'string' && deletedAt !== '') return deletedAt
  throw new Error('pending deletion is missing deletedAt')
}

export function RestoreAccountScreen({
  deletedAt,
  onRestore,
}: {
  deletedAt: Date | string
  onRestore: () => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [deadlineCopy, setDeadlineCopy] = useState<string | null>(null)

  // Format after mount so SSR (UTC) and the browser timezone cannot disagree.
  useEffect(() => {
    setDeadlineCopy(restoreDeadlineCopy(new Date(deletedAt)))
  }, [deletedAt])

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
          <CardDescription className="flex flex-col gap-2">
            {deadlineCopy ? <p>{deadlineCopy}</p> : null}
            <p>
              Your Subscription stays cancelled. Restoring your account does not
              start a new one, and any time you've already paid for is still not
              refunded.
            </p>
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
