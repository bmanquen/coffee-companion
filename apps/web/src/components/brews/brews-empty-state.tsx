import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'

// The empty state for a /brews method section — "No X yet. Log your first …."
// Shared by every method's section (espresso/aeropress/pourover/frenchpress/
// cold brew), which differ only in the message, the new-brew route, and the
// call-to-action label.
export function BrewsEmptyState({
  message,
  to,
  linkLabel,
}: {
  message: string
  to: LinkProps['to']
  linkLabel: string
}) {
  return (
    <p className="text-sm text-muted-foreground">
      {message}{' '}
      <Link to={to} className="underline">
        {linkLabel}
      </Link>
      .
    </p>
  )
}
