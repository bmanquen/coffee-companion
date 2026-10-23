import { useState } from 'react'
import { appleSignInAvailable, signInWithApple } from './apple'
import { authClient } from './auth-client'
import {
  ERROR_EMAIL_ALREADY_ASSOCIATED,
  ERROR_PLAY_SERVICES,
  ERROR_SIGN_IN_FAILED,
  ERROR_SIGN_IN_UNAVAILABLE,
} from './copy'
import {
  EmailAlreadyAssociated,
  PlayServicesMissing,
  SignInCancelled,
  SignInUnavailable,
} from './errors'
import { signInWithGoogle, signOutGoogle } from './google'
import { clearSessionStore } from './session-store'

export type AuthMode = 'sign-in' | 'sign-up'

export type AuthSession = {
  user: { name: string; email: string }
}

export type Auth = {
  session: AuthSession | null
  loading: boolean
  busy: boolean
  error: string | null
  mode: AuthMode
  showApple: boolean
  setMode: (mode: AuthMode) => void
  signInGoogle: () => Promise<void>
  signInApple: () => Promise<void>
  signOut: () => Promise<void>
}

export function useAuth(): Auth {
  // expoClient's 1.6.26 types collapse useSession; the runtime payload is fine.
  const session = authClient.useSession() as {
    data: AuthSession | null
    isPending: boolean
  }
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (caught) {
      if (caught instanceof SignInCancelled) return
      if (caught instanceof SignInUnavailable) {
        setError(ERROR_SIGN_IN_UNAVAILABLE)
        return
      }
      if (caught instanceof PlayServicesMissing) {
        setError(ERROR_PLAY_SERVICES)
        return
      }
      if (caught instanceof EmailAlreadyAssociated) {
        setError(ERROR_EMAIL_ALREADY_ASSOCIATED)
        return
      }
      setError(ERROR_SIGN_IN_FAILED)
    } finally {
      setBusy(false)
    }
  }

  return {
    session: session.data,
    loading: session.isPending,
    busy,
    error,
    mode,
    showApple: appleSignInAvailable(),
    setMode,
    signInGoogle: () => run(signInWithGoogle),
    signInApple: () => run(signInWithApple),
    signOut: async () => {
      try {
        try {
          await signOutGoogle()
        } catch {
          // Google's client can throw while offline; the server session
          // still has to be revoked.
        }
        await authClient.signOut()
      } finally {
        await clearSessionStore()
      }
    },
  }
}
