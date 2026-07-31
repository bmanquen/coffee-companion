import { Link } from '@tanstack/react-router'

export function SealedBrewNotice() {
  return (
    <div
      role="note"
      className="flex flex-col gap-1 rounded-md border border-border bg-muted/50 p-3 text-sm"
    >
      <p className="text-muted-foreground">
        This Brew is Sealed. It is still yours and still stored — subscribing
        reopens it.
      </p>
      <Link to="/pricing" className="font-medium underline underline-offset-4">
        See plans
      </Link>
    </div>
  )
}
