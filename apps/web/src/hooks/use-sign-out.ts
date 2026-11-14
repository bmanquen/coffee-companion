import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { resetAnalytics } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'
import { setSentryUser } from '@/lib/sentry-client'

export const SIGN_OUT_FAILED = "We couldn't sign you out. Try again."

export function useSignOut() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return async () => {
    resetAnalytics()
    // Awaited: clearing is a dynamic import away, and an error thrown after
    // sign-out must not still carry the id. Swallowed because signing out is
    // what the user pressed — a chunk that will not load must not strand them.
    await setSentryUser(null)?.catch(() => {})
    const { error } = await authClient.signOut()
    if (error) throw error
    queryClient.clear()
    navigate({ to: '/' })
  }
}
