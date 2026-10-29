import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin'
import { authClient } from './auth-client'
import { googleIosClientId, googleWebClientId } from './config'
import {
  GOOGLE_PLAY_SERVICES_NOT_AVAILABLE,
  GOOGLE_SIGN_IN_CANCELLED,
  PlayServicesMissing,
  SignInCancelled,
  SignInConflict,
  SignInFailed,
  SignInUnavailable,
  errorCode,
} from './errors'
import {
  logAuthFailure,
  nativeFailureDetail,
  serverFailureDetail,
} from './log'
import { errorFromAuthServer } from './server-error'

let configured = false

export function configureGoogleSignIn() {
  const webClientId = googleWebClientId()
  if (!webClientId) return
  GoogleSignin.configure({
    webClientId,
    iosClientId: googleIosClientId() || undefined,
  })
  configured = true
}

function asGoogleFailure(error: unknown): never {
  const code = errorCode(error)
  if (
    code === GOOGLE_SIGN_IN_CANCELLED ||
    (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED)
  ) {
    throw new SignInCancelled()
  }
  if (
    code === GOOGLE_PLAY_SERVICES_NOT_AVAILABLE ||
    (isErrorWithCode(error) &&
      error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE)
  ) {
    throw new PlayServicesMissing()
  }
  throw new SignInFailed()
}

export async function signInWithGoogle() {
  if (!googleWebClientId()) throw new SignInUnavailable()
  if (!configured) configureGoogleSignIn()

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
    const response = await GoogleSignin.signIn()
    if (isCancelledResponse(response)) throw new SignInCancelled()
    if (!isSuccessResponse(response) || !response.data.idToken) {
      logAuthFailure('google', { code: 'missing_id_token' })
      throw new SignInFailed()
    }
    const { error } = await authClient.signIn.social({
      provider: 'google',
      idToken: { token: response.data.idToken },
    })
    if (error) {
      logAuthFailure('google-server', serverFailureDetail(error))
      errorFromAuthServer(error)
    }
  } catch (error) {
    if (
      error instanceof SignInCancelled ||
      error instanceof SignInFailed ||
      error instanceof SignInUnavailable ||
      error instanceof PlayServicesMissing ||
      error instanceof SignInConflict
    ) {
      throw error
    }
    logAuthFailure('google', nativeFailureDetail(error))
    asGoogleFailure(error)
  }
}

export async function signOutGoogle() {
  try {
    await GoogleSignin.signOut()
  } catch {
    // Already signed out of Google, or Play services are gone.
  }
}
