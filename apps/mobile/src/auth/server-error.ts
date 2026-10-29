import { SignInConflict, SignInFailed, isSignInConflictCode } from './errors'
import { authErrorCode } from './log'

export function errorFromAuthServer(error: unknown): never {
  if (isSignInConflictCode(authErrorCode(error))) {
    throw new SignInConflict()
  }
  throw new SignInFailed()
}
