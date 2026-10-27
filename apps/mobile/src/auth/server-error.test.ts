import {
  EMAIL_ALREADY_ASSOCIATED_CODE,
  EmailAlreadyAssociated,
  SignInFailed,
} from './errors'
import { errorFromAuthServer } from './server-error'

describe('errorFromAuthServer', () => {
  it('matches the server code, not the message text', () => {
    expect(() =>
      errorFromAuthServer({
        status: 400,
        code: EMAIL_ALREADY_ASSOCIATED_CODE,
        message: "We couldn't sign you in. Try again.",
      }),
    ).toThrow(EmailAlreadyAssociated)

    expect(() =>
      errorFromAuthServer({
        status: 400,
        message: 'This email is already associated with an account.',
      }),
    ).toThrow(SignInFailed)
  })

  it('hides every other server failure behind the generic sign-in error', () => {
    expect(() =>
      errorFromAuthServer({ status: 401, message: 'id token is not valid' }),
    ).toThrow(SignInFailed)
  })
})
