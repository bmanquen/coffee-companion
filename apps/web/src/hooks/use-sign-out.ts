import { useNavigate } from '@tanstack/react-router'
import { resetAnalytics } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'

// Forgets the PostHog person before the session ends, so the next sign-in on
// this browser starts a fresh one.
export function useSignOut() {
  const navigate = useNavigate()
  return async () => {
    resetAnalytics()
    await authClient.signOut()
    navigate({ to: '/' })
  }
}
