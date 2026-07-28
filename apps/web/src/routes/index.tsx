import { createFileRoute, redirect } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'
import { getForwardedHeaders } from '@/lib/request-headers'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const headers = await getForwardedHeaders()
    const { data: session } = await authClient.getSession({
      fetchOptions: { headers },
    })
    // Signed-in users have no use for the public page — send them to the app
    // rather than making them read a pitch for something they already use.
    if (session) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: LandingPage,
})

export function LandingPage() {
  const handleSignIn = () => {
    authClient.signIn.social({ provider: 'google' })
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-3">
      <h1 className="text-4xl font-bold tracking-tight">Coffee Companion</h1>
      <p className="text-muted-foreground text-lg">
        Track your coffees and dial in your espresso.
      </p>
      <Button size="lg" onClick={handleSignIn}>
        Sign in with Google
      </Button>
    </main>
  )
}
