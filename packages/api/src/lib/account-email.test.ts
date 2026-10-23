import { describe, expect, it } from 'vitest'
import {
  EMAIL_ALREADY_ASSOCIATED,
  UNVERIFIED_EMAIL_HOLDER_DOMAIN,
  emailFromJwtPayload,
  emailFromSocialIdToken,
  unverifiedEmailPlaceholder,
} from './account-email'

function jwtWithEmail(email: string) {
  const payload = Buffer.from(JSON.stringify({ email })).toString('base64url')
  return `header.${payload}.sig`
}

describe('EMAIL_ALREADY_ASSOCIATED', () => {
  it('names the collision without saying which account or provider holds it', () => {
    expect(EMAIL_ALREADY_ASSOCIATED).toBe(
      'This email is already associated with an account.',
    )
    expect(EMAIL_ALREADY_ASSOCIATED).not.toMatch(/google|apple|another/i)
  })
})

describe('unverifiedEmailPlaceholder', () => {
  it('keeps the released address off the public email unique key', () => {
    expect(unverifiedEmailPlaceholder('user-1')).toBe(
      `user-1@${UNVERIFIED_EMAIL_HOLDER_DOMAIN}`,
    )
  })
})

describe('emailFromSocialIdToken', () => {
  it('reads a lowercased email from a Google id token body', () => {
    expect(
      emailFromSocialIdToken({
        provider: 'google',
        idToken: { token: jwtWithEmail('Ada@Example.COM') },
      }),
    ).toBe('ada@example.com')
  })

  it('ignores a body that is not a social id token', () => {
    expect(emailFromSocialIdToken({ provider: 'google' })).toBeNull()
    expect(emailFromJwtPayload('not-a-jwt')).toBeNull()
    expect(emailFromJwtPayload('aaa.%%% .bbb')).toBeNull()
  })
})
