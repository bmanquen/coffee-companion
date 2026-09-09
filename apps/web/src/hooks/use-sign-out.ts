import { useNavigate } from '@tanstack/react-router'
import { resetAnalytics } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'

export function useSignOut() {
  const navigate = useNavigate()
  return async () => {
    resetAnalytics()
    await authClient.signOut()
    navigate({ to: '/' })
  }
}
