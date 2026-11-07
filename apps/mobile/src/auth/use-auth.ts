import { useRef, useState } from 'react'
import { appleSignInAvailable, signInWithApple } from './apple'
import { authClient, clearClientSession, refetchClientSession } from './auth-client'
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
  failureMessage,
} from './errors'
import { signInWithGoogle, signOutGoogle } from './google'
import { logAuthFailure, serverFailureDetail } from './log'
import { e2eSignInUser } from './e2e'
import {
  clearSessionStore,
  readSessionCookie,
  restoreSessionCookie,
  writeE2EAuthCookie,
} from './session-store'

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
  const inFlight = useRef(false)

  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true
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
      const message = failureMessage(caught)
      logAuthFailure('sign-in', { ...serverFailureDetail(caught), message })
      setError({
        title: ERROR_SIGN_IN_FAILED,
        ...(__DEV__ ? { body: message } : {}),
      })
    } finally {
      inFlight.current = false
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
        const priorCookie = readSessionCookie()
        writeE2EAuthCookie(user)
        try {
          const data = await refetchClientSession()
          if (!data?.user) {
            throw new Error('E2E get-session returned no session')
          }
        } catch (failed) {
          try {
            await restoreSessionCookie(priorCookie)
          } catch (restoreFailed) {
            logAuthFailure('sign-in', {
              ...serverFailureDetail(restoreFailed),
              message: failureMessage(restoreFailed),
            })
          }
          throw failed
        }
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
        try {
          await clearSessionStore()
        } finally {
          clearClientSession()
        }
      }
    },
  }
}
