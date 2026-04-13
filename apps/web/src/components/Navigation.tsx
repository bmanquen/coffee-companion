import { authClient } from '@/lib/auth-client'
import { Link, useNavigate } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { Avatar, AvatarImage } from './ui/avatar'
import { Button } from './ui/button'
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet'

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
        <Button variant="ghost" size="icon">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 px-2 shadow-lg">
        <nav className="flex flex-col gap-2 mt-10 h-full">
          <Link className="hover:bg-primary p-2 rounded-sm" to="/">
            Home
          </Link>
          {session && (
            <>
              <Link className="hover:bg-primary p-2 rounded-sm" to="/coffees">
                Coffees
              </Link>
              <Link className="hover:bg-primary p-2 rounded-sm" to="/espresso">
                Espresso
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
