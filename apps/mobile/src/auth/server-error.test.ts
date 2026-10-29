import {
  EMAIL_ALREADY_ASSOCIATED_CODE,
  OAUTH_LINK_ERROR_CODE,
  SignInConflict,
  SignInFailed,
} from './errors'
import { errorFromAuthServer } from './server-error'

describe('errorFromAuthServer', () => {
  it('matches every sign-in conflict by server code, not the message text', () => {
    expect(() =>
      errorFromAuthServer({
        status: 400,
        code: EMAIL_ALREADY_ASSOCIATED_CODE,
        message: "We couldn't sign you in. Try again.",
      }),
    ).toThrow(SignInConflict)

    expect(() =>
      errorFromAuthServer({
        status: 401,
        code: OAUTH_LINK_ERROR_CODE,
        message: 'account not linked',
      }),
    ).toThrow(SignInConflict)

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
