import { useState } from 'react'
import { appleSignInAvailable, signInWithApple } from './apple'
import { authClient } from './auth-client'
import {
  ERROR_PLAY_SERVICES,
  ERROR_SIGN_IN_CONFLICT_BODY,
  ERROR_SIGN_IN_CONFLICT_TITLE,
  ERROR_SIGN_IN_FAILED,
  ERROR_SIGN_IN_UNAVAILABLE,
} from './copy'
import {
  PlayServicesMissing,
  SignInCancelled,
  SignInConflict,
  SignInUnavailable,
} from './errors'
import { signInWithGoogle, signOutGoogle } from './google'
import { e2eSignInUser } from './e2e'
import { clearSessionStore, writeE2EAuthCookie } from './session-store'

export type AuthMode = 'sign-in' | 'sign-up'

export type AuthSession = {
  user: { name: string; email: string }
}

export type AuthError = {
  title: string
  body?: string
}

export type Auth = {
  session: AuthSession | null
  loading: boolean
  busy: boolean
  error: AuthError | null
  mode: AuthMode
  showApple: boolean
  setMode: (mode: AuthMode) => void
  signInGoogle: () => Promise<void>
  signInApple: () => Promise<void>
  signInE2E: () => Promise<void>
  signOut: () => Promise<void>
}

export function useAuth(): Auth {
  // expoClient's 1.6.26 types collapse useSession; the runtime payload is fine.
  const session = authClient.useSession() as {
    data: AuthSession | null
    isPending: boolean
  }
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [error, setError] = useState<AuthError | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (caught) {
      if (caught instanceof SignInCancelled) return
      if (caught instanceof SignInUnavailable) {
        setError({ title: ERROR_SIGN_IN_UNAVAILABLE })
        return
      }
      if (caught instanceof PlayServicesMissing) {
        setError({ title: ERROR_PLAY_SERVICES })
        return
      }
      if (caught instanceof SignInConflict) {
        setError({
          title: ERROR_SIGN_IN_CONFLICT_TITLE,
          body: ERROR_SIGN_IN_CONFLICT_BODY,
        })
        return
      }
      setError({ title: ERROR_SIGN_IN_FAILED })
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
    signInE2E: () =>
      run(async () => {
        const user = e2eSignInUser()
        if (!user) return
        writeE2EAuthCookie(user)
        await authClient.getSession()
      }),
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
