import { createFileRoute } from '@tanstack/react-router'
import {
  handleAuthGet,
  handleAuthPost,
} from '@coffee-companion/api/lib/auth-http'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => handleAuthGet(request),
      POST: ({ request }: { request: Request }) => handleAuthPost(request),
    },
  },
})
