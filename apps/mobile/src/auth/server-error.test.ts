import { ERROR_EMAIL_ALREADY_ASSOCIATED } from './copy'
import { EmailAlreadyAssociated, SignInFailed } from './errors'
import { errorFromAuthServer } from './server-error'

describe('errorFromAuthServer', () => {
  it('keeps the email-already-associated copy generic', () => {
    expect(() =>
      errorFromAuthServer({
        status: 400,
        message: ERROR_EMAIL_ALREADY_ASSOCIATED,
      }),
    ).toThrow(EmailAlreadyAssociated)
    expect(ERROR_EMAIL_ALREADY_ASSOCIATED).not.toMatch(/google|apple|another/i)
  })

  it('hides every other server failure behind the generic sign-in error', () => {
    expect(() =>
      errorFromAuthServer({ status: 401, message: 'id token is not valid' }),
    ).toThrow(SignInFailed)
  })
})
