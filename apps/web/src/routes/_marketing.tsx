import { Outlet, createFileRoute } from '@tanstack/react-router'
import { MarketingFooter } from '@/components/marketing/marketing-footer'
import { MarketingHeader } from '@/components/marketing/marketing-header'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/_marketing')({
  component: MarketingLayout,
})

// The public site's shell. It carries no session guard: /pricing has to stay
// reachable for a signed-in user who wants to upgrade, and the one page that
// does turn signed-in visitors away (/) does it in its own beforeLoad.
function MarketingLayout() {
  const { data: session } = authClient.useSession()

  const handleSignIn = () => {
    authClient.signIn.social({ provider: 'google' })
  }

  return (
    <>
      <MarketingHeader signedIn={Boolean(session)} onSignIn={handleSignIn} />
      <main className="mx-auto w-full max-w-5xl px-4">
        <Outlet />
      </main>
      <MarketingFooter />
    </>
  )
}
