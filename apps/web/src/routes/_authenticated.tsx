import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import BottomNav from '@/components/BottomNav'
import MobileHeader from '@/components/MobileHeader'
import Navigation from '@/components/Navigation'
import { RenewalFailedNotice } from '@/components/renewal-failed-notice'
import { identifyUser, identityFrom } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'
import { getForwardedHeaders } from '@/lib/request-headers'
import { sentryUserFrom } from '@/lib/sentry'
import { setSentryUser } from '@/lib/sentry-client'
import { useTRPC } from '@/integrations/trpc/react'

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
  component: AuthenticatedLayout,
})

// The signed-in app's chrome. It hangs off this layout rather than the root
// shell so public routes never mount it — the root document is now bare, and
// each layout brings its own <main>. The nav drawer's open state lives here
// because it shifts the main column on desktop.
function AuthenticatedLayout() {
  const [navOpen, setNavOpen] = useState(false)
  const trpc = useTRPC()
  // Not suspended on: a failing renewal is worth saying wherever the user is,
  // but never worth holding the whole app up for.
  const { data: plan } = useQuery(trpc.plan.current.queryOptions())
  const { session } = Route.useRouteContext()
  const planId = plan?.plan
  // Keyed on the id, not the session object, which beforeLoad rebuilds on
  // every navigation.
  const { id: userId } = identityFrom(session)

  useEffect(() => {
    if (planId) identifyUser({ id: userId }, { plan: planId })
  }, [userId, planId])

  useEffect(() => {
    void setSentryUser(sentryUserFrom(session))
    // Leaving this layout is the other way to stop being signed in: an expired
    // session redirects out of it without going near the sign-out helper.
    return () => {
      void setSentryUser(null)
    }
  }, [userId])

  return (
    <>
      <Navigation open={navOpen} setOpen={setNavOpen} />
      <MobileHeader />
      <main
        className={`transition-all duration-300 ${navOpen ? 'lg:ml-64' : ''} px-3 pb-20 lg:pb-0`}
      >
        {plan?.renewalFailing && (
          <div className="pt-3">
            <RenewalFailedNotice />
          </div>
        )}
        <Outlet />
      </main>
      <BottomNav />
    </>
  )
}
