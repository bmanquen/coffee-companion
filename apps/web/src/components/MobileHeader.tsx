import { useNavigate } from '@tanstack/react-router'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Button } from './ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover'
import { authClient } from '@/lib/auth-client'

export default function MobileHeader() {
  const { data: session } = authClient.useSession()
  const navigate = useNavigate()

  const handleSignIn = () => {
    authClient.signIn.social({ provider: 'google' })
  }

  const handleSignOut = async () => {
    await authClient.signOut()
    navigate({ to: '/' })
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
                <span className="text-sm font-medium">
                  {session.user.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {session.user.email}
                </span>
              </div>
              <Button variant="outline" onClick={handleSignOut}>
                Sign Out
              </Button>
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
