import { Link } from '@tanstack/react-router'
import { Bean, Coffee, Home, Wrench } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

const tabs = [
  { to: '/', label: 'Home', icon: Home, exact: true },
  { to: '/coffees', label: 'Coffee', icon: Bean, exact: false },
  { to: '/brews', label: 'Brews', icon: Coffee, exact: false },
  { to: '/equipment', label: 'Equipment', icon: Wrench, exact: false },
] as const

export default function BottomNav() {
  const { data: session } = authClient.useSession()

  if (!session) return null

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex items-stretch justify-around">
        {tabs.map(({ to, label, icon: Icon, exact }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              activeOptions={{ exact }}
              className="group flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-muted-foreground transition-colors data-[status=active]:text-primary"
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="text-[11px] font-medium leading-none group-data-[status=active]:font-semibold">
                {label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
