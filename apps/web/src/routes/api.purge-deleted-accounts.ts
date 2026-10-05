import { createFileRoute } from '@tanstack/react-router'
import { purgeDeletedAccountsResponse } from '@/lib/purge-deleted-accounts'

function handler({ request }: { request: Request }) {
  return purgeDeletedAccountsResponse(request)
}

export const Route = createFileRoute('/api/purge-deleted-accounts')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
})
