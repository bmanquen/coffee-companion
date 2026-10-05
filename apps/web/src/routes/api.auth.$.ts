import { createFileRoute } from '@tanstack/react-router'
import { auth } from '@coffee-companion/api/lib/auth'
import { db } from '@coffee-companion/api/db'
import { e2eBypassSession } from '@coffee-companion/api/lib/e2e-auth'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        // In test builds, short-circuit get-session for the bypass test user so
        // authenticated pages render without a real login.
        if (new URL(request.url).pathname.endsWith('/get-session')) {
          const session = e2eBypassSession(request.headers)
          if (session) {
            const row = await db.query.user.findFirst({
              where: { id: session.user.id },
              columns: { deletedAt: true },
            })
            return Response.json({
              ...session,
              user: { ...session.user, deletedAt: row?.deletedAt ?? null },
            })
          }
        }
        return await auth.handler(request)
      },
      POST: async ({ request }: { request: Request }) => {
        return await auth.handler(request)
      },
    },
  },
})
