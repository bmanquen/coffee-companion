import { createFileRoute } from '@tanstack/react-router'
import { purgeDeletedAccountsResponse } from '@/lib/purge-deleted-accounts'

export const Route = createFileRoute('/api/purge-deleted-accounts')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) =>
        purgeDeletedAccountsResponse(request),
    },
  },
})
