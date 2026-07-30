import { Link } from '@tanstack/react-router'

export function PlanLimitNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-md border border-border bg-muted/50 p-3 text-sm"
    >
      <p className="text-muted-foreground">{message}</p>
      <Link to="/pricing" className="font-medium underline underline-offset-4">
        See plans
      </Link>
    </div>
  )
}
