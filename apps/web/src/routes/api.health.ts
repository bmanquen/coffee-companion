import { createFileRoute } from '@tanstack/react-router'
import { checkDatabase } from '@coffee-companion/api/lib/health'
import { healthResponse } from '@/lib/health'

async function handler() {
  return healthResponse(await checkDatabase())
}

export const Route = createFileRoute('/api/health')({
  server: { handlers: { GET: handler } },
})
