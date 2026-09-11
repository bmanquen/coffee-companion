import { useNavigate } from '@tanstack/react-router'
import { resetAnalytics } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'
import { setSentryUser } from '@/lib/sentry-client'

export function useSignOut() {
  const navigate = useNavigate()
  return async () => {
    resetAnalytics()
    setSentryUser(undefined)
    await authClient.signOut()
    navigate({ to: '/' })
  }
}
