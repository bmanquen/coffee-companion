import { Link } from '@tanstack/react-router'

export function RenewalFailedNotice() {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm"
    >
      <p>
        Your Subscription payment did not go through. Nothing has changed yet —
        your history is still open while the card is retried.
      </p>
      <Link to="/account" className="font-medium underline underline-offset-4">
        Update your card
      </Link>
    </div>
  )
}
