import { Link } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Stands where the edit and delete controls would be on a Sealed row: a Brew
// nobody can read is not one they can meaningfully change. The row itself is
// greyed by sealedRowClass, so this carries the reason and the way out.
export function SealedRowNotice() {
  return (
    <div className="flex w-full items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Sealed — Subscribe to Pro to read this brew
      </span>
      {/* An anchor wearing a button: navigation, so it still opens in a new tab
          and shows its destination on hover. */}
      <Button
        asChild
        size="sm"
        variant="default"
        className="bg-primary/50 hover:bg-primary"
      >
        <Link
          to="/pricing"
          // The row itself is inert; this is not.
          onClick={(event) => event.stopPropagation()}
        >
          Unlock
        </Link>
      </Button>
    </div>
  )
}

// Reads as disabled without touching the row's background: the settings are
// there, just not for this Plan.
export const sealedRowClass =
  'text-muted-foreground opacity-70 bg-muted hover:bg-muted'
