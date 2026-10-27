import * as AppleAuthentication from 'expo-apple-authentication'
import { Platform } from 'react-native'
import { authClient } from './auth-client'
import {
  APPLE_ERR_REQUEST_CANCELED,
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

export function appleSignInAvailable() {
  return Platform.OS === 'ios'
}

export async function signInWithApple() {
  if (!appleSignInAvailable()) throw new SignInUnavailable()

  try {
    const available = await AppleAuthentication.isAvailableAsync()
    if (!available) throw new SignInUnavailable()

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    })
    if (!credential.identityToken || !credential.authorizationCode) {
      logAuthFailure('apple', { code: 'missing_identity' })
      throw new SignInFailed()
    }

    const { error } = await authClient.$fetch('/sign-in/apple-native', {
      method: 'POST',
      body: {
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
        email: credential.email,
        fullName: credential.fullName
          ? {
              givenName: credential.fullName.givenName,
              familyName: credential.fullName.familyName,
            }
          : null,
      },
    })
    if (error) {
      logAuthFailure('apple-server', serverFailureDetail(error))
      errorFromAuthServer(error)
    }
  } catch (error) {
    if (
      error instanceof SignInCancelled ||
      error instanceof SignInFailed ||
      error instanceof SignInUnavailable ||
      error instanceof SignInConflict
    ) {
      throw error
    }
    if (errorCode(error) === APPLE_ERR_REQUEST_CANCELED) {
      throw new SignInCancelled()
    }
    logAuthFailure('apple', nativeFailureDetail(error))
    throw new SignInFailed()
  }
}
