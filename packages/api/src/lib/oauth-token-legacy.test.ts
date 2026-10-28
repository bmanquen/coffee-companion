import { describe, expect, it } from 'vitest'
import { legacyOAuthEncryptionReport } from './oauth-token-legacy'

describe('legacyOAuthEncryptionReport', () => {
  it('names how many rows changed and never includes a token value', () => {
    expect(legacyOAuthEncryptionReport(0)).toBe(
      'No plaintext OAuth tokens to encrypt.',
    )
    expect(legacyOAuthEncryptionReport(2)).toBe(
      'Encrypted 2 legacy OAuth account row(s).',
    )
    expect(legacyOAuthEncryptionReport(2)).not.toMatch(
      /ya29\.|1\/\/|eyJ|\$ba\$|refresh|access/i,
    )
  })
})
