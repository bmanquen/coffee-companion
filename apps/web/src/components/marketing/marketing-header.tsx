import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

// The public site's header. Deliberately unrelated to the signed-in app's
// Navigation/MobileHeader: even a signed-in visitor is only passing through, so
// the way back to the app is one link rather than the app's own navigation.
export function MarketingHeader({
  signedIn = false,
  onSignIn,
}: {
  signedIn?: boolean
  onSignIn: () => void
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link to="/" className="font-semibold tracking-tight">
          Coffee Companion
        </Link>
        <nav className="flex items-center gap-2" aria-label="Marketing">
          <Link
            to="/pricing"
            className="rounded-md px-3 py-2 text-sm hover:bg-primary/10 data-[status=active]:font-medium"
          >
            Pricing
          </Link>
          {signedIn ? (
            <Button size="sm" asChild>
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <Button size="sm" onClick={onSignIn}>
              Sign in
            </Button>
          )}
        </nav>
      </div>
    </header>
  )
}
