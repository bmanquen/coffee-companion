import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { SIGN_OUT_FAILED, useSignOut } from '@/hooks/use-sign-out'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

export default function MobileHeader() {
  const { data: session } = authClient.useSession()
  const signOut = useSignOut()
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  const handleSignIn = () => {
    authClient.signIn.social({ provider: 'google' })
  }

  const initial = session?.user.name.charAt(0).toUpperCase() ?? '?'

  return (
    <header className="sticky top-0 z-30 mb-4 flex h-14 items-center justify-between border-b border-border bg-background/95 px-3 backdrop-blur lg:hidden">
      <span className="font-semibold">Coffee Companion</span>
      {session ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar>
                {session.user.image ? (
                  <AvatarImage src={session.user.image} />
                ) : null}
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{session.user.name}</span>
                <span className="text-xs text-muted-foreground">
                  {session.user.email}
                </span>
              </div>
              <Button variant="outline" asChild>
                <Link to="/account">Account</Link>
              </Button>
              <Button
                variant="outline"
                // One attempt at a time, so an earlier failure cannot show while a
                // later attempt is still pending.
                disabled={signingOut}
                onClick={() => {
                  setSigningOut(true)
                  setSignOutError(null)
                  void signOut()
                    .catch(() => {
                      setSignOutError(SIGN_OUT_FAILED)
                    })
                    .finally(() => setSigningOut(false))
                }}
              >
                Sign Out
              </Button>
              {signOutError ? <p role="alert">{signOutError}</p> : null}
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <Button size="sm" onClick={handleSignIn}>
          Sign in
        </Button>
      )}
    </header>
  )
}
