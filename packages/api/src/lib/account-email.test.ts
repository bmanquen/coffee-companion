import { describe, expect, it } from 'vitest'
import {
  EMAIL_ALREADY_ASSOCIATED,
  EMAIL_ALREADY_ASSOCIATED_CODE,
  UNVERIFIED_EMAIL_HOLDER_DOMAIN,
  emailIsUnverifiedHolderAddress,
  identityFromVerifiedJwt,
  legacyUnverifiedEmailPlaceholder,
  socialIdTokenFromBody,
  unverifiedEmailHoldPrefixPattern,
  unverifiedEmailPlaceholder,
} from './account-email'

function jwtWithEmail(email: string, emailVerified = true) {
  const payload = Buffer.from(
    JSON.stringify({ email, email_verified: emailVerified }),
  ).toString('base64url')
  return `header.${payload}.sig`
}

describe('EMAIL_ALREADY_ASSOCIATED', () => {
  it('uses a stable code and wording that does not say the email has an account', () => {
    expect(EMAIL_ALREADY_ASSOCIATED_CODE).toBe('EMAIL_ALREADY_ASSOCIATED')
    expect(EMAIL_ALREADY_ASSOCIATED).toBe("We couldn't sign you in. Try again.")
    expect(EMAIL_ALREADY_ASSOCIATED).not.toMatch(
      /associated|already|google|apple|account/i,
    )
  })
})

describe('unverifiedEmailPlaceholder', () => {
  it('keeps the released address off the public email unique key', () => {
    expect(unverifiedEmailPlaceholder('ada@example.com', 'user-1')).toBe(
      `YWRhQGV4YW1wbGUuY29t.user-1@${UNVERIFIED_EMAIL_HOLDER_DOMAIN}`,
    )
  })

  it('gives each holder of the same address a distinct stand-in', () => {
    expect(unverifiedEmailPlaceholder('ada@example.com', 'user-1')).not.toBe(
      unverifiedEmailPlaceholder('ada@example.com', 'user-2'),
    )
  })

  it('keeps an address-only stand-in off the public email unique key', () => {
    expect(legacyUnverifiedEmailPlaceholder('ada@example.com')).toBe(
      `YWRhQGV4YW1wbGUuY29t@${UNVERIFIED_EMAIL_HOLDER_DOMAIN}`,
    )
  })

  it('recognizes the reserved holder domain', () => {
    expect(emailIsUnverifiedHolderAddress('ada@example.com')).toBe(false)
    expect(
      emailIsUnverifiedHolderAddress(
        `YWRhQGV4YW1wbGUuY29t.user-1@${UNVERIFIED_EMAIL_HOLDER_DOMAIN}`,
      ),
    ).toBe(true)
  })

  it('escapes LIKE wildcards in the per-holder prefix so _ is literal', () => {
    expect(unverifiedEmailHoldPrefixPattern('???@x.com')).toBe(
      `Pz8\\_QHguY29t.%@${UNVERIFIED_EMAIL_HOLDER_DOMAIN}`,
    )
  })
})

describe('socialIdTokenFromBody', () => {
  it('reads the provider and token without trusting the payload', () => {
    const token = jwtWithEmail('Ada@Example.COM')
    expect(
      socialIdTokenFromBody({
        provider: 'google',
        idToken: { token, nonce: 'n1' },
      }),
    ).toEqual({ provider: 'google', token, nonce: 'n1' })
  })

  it('ignores a body that is not a social id token', () => {
    expect(socialIdTokenFromBody({ provider: 'google' })).toBeNull()
    expect(identityFromVerifiedJwt('not-a-jwt')).toBeNull()
    expect(identityFromVerifiedJwt('aaa.%%% .bbb')).toBeNull()
  })
})

describe('identityFromVerifiedJwt', () => {
  it('reads a lowercased email and the verified claim', () => {
    expect(identityFromVerifiedJwt(jwtWithEmail('Ada@Example.COM'))).toEqual({
      email: 'ada@example.com',
      emailVerified: true,
    })
    expect(
      identityFromVerifiedJwt(jwtWithEmail('ada@example.com', false)),
    ).toEqual({
      email: 'ada@example.com',
      emailVerified: false,
    })
  })
})
