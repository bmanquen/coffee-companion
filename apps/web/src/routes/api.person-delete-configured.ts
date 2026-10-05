import { createFileRoute } from '@tanstack/react-router'
import { personDeleteConfiguredResponse } from '@/lib/person-delete-configured'

export const Route = createFileRoute('/api/person-delete-configured')({
  server: {
    handlers: {
      GET: () => personDeleteConfiguredResponse(),
    },
  },
})
