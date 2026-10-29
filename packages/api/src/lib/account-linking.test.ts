import { describe, expect, it } from 'vitest'
import {
  GOOGLE_PROVIDER_ID,
  accountLinking,
  accountOptions,
} from './account-linking'

describe('accountLinking', () => {
  it('links a Google sign-in only when the stored email is already verified', () => {
    expect(accountLinking.enabled).toBe(true)
    expect(accountLinking.requireLocalEmailVerified).toBe(true)
    expect(accountLinking.trustedProviders).not.toContain(GOOGLE_PROVIDER_ID)
  })

  it('encrypts OAuth tokens before they reach the account row', () => {
    expect(accountOptions.encryptOAuthTokens).toBe(true)
  })
})
