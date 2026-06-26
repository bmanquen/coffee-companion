import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'
import { getForwardedHeaders } from '@/lib/request-headers'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    // Forward the cookie during SSR so the session resolves on direct loads of
    // authenticated routes (not just via client-side navigation).
    const headers = await getForwardedHeaders()
    const { data: session } = await authClient.getSession({
      fetchOptions: { headers },
    })
    if (!session) {
      throw redirect({ to: '/' })
    }
    return { session }
  },
  component: () => <Outlet />,
})
