import { useEffect } from 'react'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { H1 } from '@/components/typography/h1'
import { reportClientError } from '@/lib/sentry-client-report'

// Errors that land in a route error boundary are no longer unhandled, so
// Sentry will not see them unless we report them here. The page itself says
// nothing about the exception — that belongs in Sentry, not on the screen.
export function RootError({ error }: ErrorComponentProps) {
  useEffect(() => {
    reportClientError(error)
  }, [error])

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <H1>Something went wrong</H1>
      <p className="mt-3 text-muted-foreground">
        Try again, or come back in a moment.
      </p>
    </main>
  )
}
