import { ERROR_EMAIL_ALREADY_ASSOCIATED } from './copy'
import { EmailAlreadyAssociated, SignInFailed } from './errors'
import { authErrorMessage } from './log'

export function errorFromAuthServer(error: unknown): never {
  if (authErrorMessage(error) === ERROR_EMAIL_ALREADY_ASSOCIATED) {
    throw new EmailAlreadyAssociated()
  }
  throw new SignInFailed()
}
