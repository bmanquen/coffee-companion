import { db } from '../db'
import { auth } from './auth'
import { E2E_AUTH_HEADER, e2eBypassSession } from './e2e-auth'
import { log } from './log'

function shouldLogE2EGetSession() {
  return (
    process.env.E2E_BYPASS_AUTH === 'true' ||
    process.env.NODE_ENV !== 'production'
  )
}

export async function handleAuthGet(request: Request): Promise<Response> {
  // In test builds, short-circuit get-session for the bypass test user so
  // authenticated pages and native E2E sign-in render without a real login.
  if (new URL(request.url).pathname.endsWith('/get-session')) {
    const session = e2eBypassSession(request.headers)
    if (shouldLogE2EGetSession()) {
      log('info', 'e2e get-session', {
        e2eAuth: Boolean(request.headers.get(E2E_AUTH_HEADER)?.trim()),
        sessionUser: session?.user.id ?? null,
      })
    }
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
}

export async function handleAuthPost(request: Request): Promise<Response> {
  return await auth.handler(request)
}
