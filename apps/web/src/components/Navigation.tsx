import { Link, useNavigate } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { Avatar, AvatarImage } from './ui/avatar'
import { Button } from './ui/button'
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet'
import { authClient } from '@/lib/auth-client'

interface NavigationProps {
  open: boolean
  setOpen: (open: boolean) => void
}

export default function Navigation({ open, setOpen }: NavigationProps) {
  const { data: session } = authClient.useSession()
  const navigate = useNavigate()

  const handleSignIn = () => {
    authClient.signIn.social({ provider: 'google' })
  }

  const handleSignOut = async () => {
    await authClient.signOut()
    navigate({ to: '/' })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen} modal={false}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          className="hidden md:inline-flex"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-64 px-2 shadow-lg"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <nav className="flex flex-col gap-2 mt-10 h-full">
          <Link
            className="rounded-md px-3 py-2 hover:bg-primary/40 data-[status=active]:bg-primary data-[status=active]:text-white data-[status=active]:font-medium"
            to="/"
            activeOptions={{ exact: true }}
          >
            Home
          </Link>
          {session && (
            <>
              <Link
                className="rounded-md px-3 py-2 hover:bg-primary/40 data-[status=active]:bg-primary data-[status=active]:text-white data-[status=active]:font-medium"
                to="/coffees"
              >
                Coffee
              </Link>
              <Link
                className="rounded-md px-3 py-2 hover:bg-primary/40 data-[status=active]:bg-primary data-[status=active]:text-white data-[status=active]:font-medium"
                to="/espresso"
              >
                Espresso
              </Link>
              <Link
                className="rounded-md px-3 py-2 hover:bg-primary/40 data-[status=active]:bg-primary data-[status=active]:text-white data-[status=active]:font-medium"
                to="/equipment"
              >
                Equipment
              </Link>
            </>
          )}
          {session ? (
            <div className="flex justify-between items-center gap-2 mt-auto mb-4">
              <Avatar>
                {session.user.image ? (
                  <AvatarImage src={session.user.image} />
                ) : null}
              </Avatar>
              <div className="text-sm">{session.user.name}</div>
              <Button variant="outline" onClick={handleSignOut}>
                Sign Out
              </Button>
            </div>
          ) : (
            <Button className="mt-auto mb-4" onClick={handleSignIn}>
              Sign in with Google
            </Button>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
