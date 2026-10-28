import { describe, expect, it } from 'vitest'
import { legacyOAuthEncryptionReport } from './oauth-token-legacy'

describe('legacyOAuthEncryptionReport', () => {
  it('names how many rows changed and never includes a token value', () => {
    expect(
      legacyOAuthEncryptionReport({ updated: 0, skippedUndecryptable: 0 }),
    ).toBe('No plaintext OAuth tokens to encrypt.')
    expect(
      legacyOAuthEncryptionReport({ updated: 2, skippedUndecryptable: 0 }),
    ).toBe('Encrypted 2 legacy OAuth account row(s).')
    expect(
      legacyOAuthEncryptionReport({ updated: 2, skippedUndecryptable: 3 }),
    ).toBe(
      'Encrypted 2 legacy OAuth account row(s). skipped_undecryptable=3',
    )
    expect(
      legacyOAuthEncryptionReport({ updated: 0, skippedUndecryptable: 3 }),
    ).toBe(
      'No plaintext OAuth tokens to encrypt. skipped_undecryptable=3',
    )
    expect(
      legacyOAuthEncryptionReport({ updated: 2, skippedUndecryptable: 3 }),
    ).not.toMatch(/ya29\.|1\/\/|eyJ|\$ba\$|refresh|access/i)
  })
})
