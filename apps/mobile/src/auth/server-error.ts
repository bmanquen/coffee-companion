import {
  EMAIL_ALREADY_ASSOCIATED_CODE,
  EmailAlreadyAssociated,
  SignInFailed,
} from './errors'
import { authErrorCode } from './log'

export function errorFromAuthServer(error: unknown): never {
  if (authErrorCode(error) === EMAIL_ALREADY_ASSOCIATED_CODE) {
    throw new EmailAlreadyAssociated()
  }
  throw new SignInFailed()
}
