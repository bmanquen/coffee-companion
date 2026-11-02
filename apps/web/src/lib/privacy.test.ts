import { describe, expect, it } from 'vitest'
import { posthogPersonRetention, recipients } from './privacy'

const IMMEDIATE_APPLE_REVOKE =
  /(?<!not )revok(e|es|ed)\b.{0,80}(?<!not )immediately(?! at purge after 30 days)|(?<!not )immediat(e|ely).{0,80}(?<!not )(revok(e|es|ed)|revocation)\b(?! at purge after 30 days)|(?<!not )revocation\b.{0,80}(?<!not )immediat(e|ely)(?! at purge after 30 days)/i
const ON_DELETE_APPLE_REVOKE =
  /(?<!not(?: \w+)? )(revok(e|es|ed)|revocation)\b.{0,80}(?<!not )(on delete|when you delete|as soon as you delete|upon account deletion|upon deletion)|(?<!not )(on delete|when you delete|as soon as you delete|upon account deletion|upon deletion).{0,80}(?<!not(?: \w+)? )(revok(e|es|ed)|revocation)\b(?! at purge after 30 days)/i
const EARLY_APPLE_DELETE =
  /(?<!not )(deleted|purged|revoked)\b.{0,40}after ([1-9]|[12]\d)(?!\d) days?/i

const IMMEDIATELY_REVOKED_CLAIM = 'the Apple token is immediately revoked'
const DELETING_IMMEDIATELY_REVOKES_CLAIM =
  'deleting immediately revokes the Apple token'
const IMMEDIATE_REVOCATION_CLAIM = 'immediate revocation'
const DELETED_AFTER_SEVEN_DAYS_CLAIM = 'the token is deleted after 7 days'
const REVOKED_AT_PURGE_AFTER_THIRTY_DAYS =
  'the token is revoked at purge after 30 days'
const NEGATED_ON_DELETE_CLAIM =
  'The token is revoked at purge after 30 days, not when you delete your account'
const AFFIRMATIVE_ON_DELETE_CLAIM = 'revoked when you delete'
const NOT_IMMEDIATELY_REVOKED_CLAIM = 'not immediately revoked'
const NOT_REVOKED_IMMEDIATELY_CLAIM = 'not revoked immediately'
const NOT_REVOKED_WHEN_YOU_DELETE_CLAIM = 'not revoked when you delete'
const IMMEDIATE_REVOKE_AT_PURGE_CLAIM =
  'The token is revoked immediately at purge after 30 days'
const IMMEDIATE_ON_DELETE_AND_PURGE_CLAIM =
  'The token is revoked immediately when you delete; it is revoked at purge after 30 days'
const DELETE_THEN_REVOKE_CLAIM =
  'When you delete your account, Apple revokes the refresh token'
const DELETE_THEN_TOKEN_REVOKED_CLAIM =
  'when you delete your account the token is revoked'
const DELETE_THEN_REVOKE_AT_PURGE_CLAIM =
  'When you delete your account we keep the token 30 days; it is revoked at purge after 30 days'
const NOT_DELETED_AFTER_SEVEN_DAYS_CLAIM = 'not deleted after 7 days'
const NOT_IMMEDIATELY_REVOKED_WHEN_YOU_DELETE_CLAIM =
  'The token is not immediately revoked when you delete your account'
const NOT_IMMEDIATELY_REVOKED_ON_DELETE_CLAIM =
  'not immediately revoked when you delete'
const REVOCATION_IS_IMMEDIATE_CLAIM = 'revocation is immediate'
const APPLE_REVOCATION_IS_IMMEDIATE_CLAIM =
  "The Apple token's revocation is immediate upon account deletion"
const REVOKED_UPON_ACCOUNT_DELETION_CLAIM = 'revoked upon account deletion'
const REVOCATION_UPON_ACCOUNT_DELETION_CLAIM =
  'revocation upon account deletion'
const UPON_ACCOUNT_DELETION_THEN_REVOKED_CLAIM =
  'Upon account deletion, the token is revoked'
const UPON_DELETION_THEN_REVOKED_CLAIM = 'upon deletion the token is revoked'

describe('recipients', () => {
  it('names every third party the app sends data to', () => {
    expect(recipients.map((recipient) => recipient.name)).toEqual([
      'Sentry',
      'PostHog',
      'Google',
      'Apple',
      'Stripe',
      'Resend',
    ])
  })

  it('states a purpose, a retention period and a lawful basis for each', () => {
    for (const recipient of recipients) {
      expect(recipient.purpose).toBeTruthy()
      expect(recipient.retention).toBeTruthy()
      expect(recipient.lawfulBasis).toBeTruthy()
      expect(recipient.policyUrl.startsWith('https://')).toBe(true)
    }
  })

  it('lists what each one receives and what it never receives', () => {
    for (const recipient of recipients) {
      expect(recipient.receives.length).toBeGreaterThan(0)
      expect(recipient.neverReceives.length).toBeGreaterThan(0)
    }
  })

  // The slug is the anchor a section is labelled by, so a duplicate or a space
  // silently breaks the heading link and the accessible name.
  it('gives each one a unique slug safe to use as a fragment', () => {
    const slugs = recipients.map((recipient) => recipient.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/)
  })

  // ADR 0012 allows exactly one thing about a user to reach Sentry. A page that
  // stopped saying so, or that started claiming nothing does, should fail.
  it('says Sentry receives the account id, and nothing else about a user', () => {
    const sentry = recipients.find((recipient) => recipient.slug === 'sentry')!
    expect(
      sentry.receives.filter((item) => /id for your account/i.test(item)),
    ).toHaveLength(1)
    expect(sentry.neverReceives.some((item) => /your name/i.test(item))).toBe(
      true,
    )
  })

  // ADR 0009 and ADR 0012 both turn on the monitoring vendors never being told
  // who a user is beyond that id. A claim added here that contradicts them
  // should fail.
  it('claims neither monitoring vendor receives a name or an email', () => {
    const monitoring = recipients.filter((recipient) =>
      ['sentry', 'posthog'].includes(recipient.slug),
    )
    expect(monitoring).toHaveLength(2)
    for (const recipient of monitoring) {
      for (const item of recipient.receives) {
        expect(item).not.toMatch(/\bemail\b|\bname of\b/i)
      }
    }
  })

  it('does not promise a PostHog person delete that a missing key would skip', () => {
    const posthog = recipients.find(
      (recipient) => recipient.slug === 'posthog',
    )!
    expect(posthog.retention).toMatch(
      /no expiry until it is deleted in PostHog/i,
    )
  })

  it('says the PostHog profile is deleted at the end of the window when that call will run', () => {
    expect(posthogPersonRetention(true)).toMatch(
      /deleted when those 30 days end/i,
    )
  })

  // Soft-delete keeps the token for the restore window. Immediate or
  // on-delete wording would be false; purge-after-30-days would not.
  it('does not claim the Apple token is revoked immediately on delete', () => {
    const apple = recipients.find((recipient) => recipient.slug === 'apple')!
    expect(apple.retention).not.toMatch(IMMEDIATE_APPLE_REVOKE)
    expect(apple.retention).not.toMatch(ON_DELETE_APPLE_REVOKE)
    expect(apple.retention).not.toMatch(EARLY_APPLE_DELETE)
    expect(apple.retention).toMatch(
      /refresh token for as long as the account exists, and for 30 days after you delete it/i,
    )
  })

  // Reverse order and the noun form are the same false claim as
  // "revoked immediately". A hold shorter than 30 days contradicts restore.
  it('rejects reverse-order, noun-form, and early-delete Apple claims', () => {
    expect(IMMEDIATELY_REVOKED_CLAIM).toMatch(IMMEDIATE_APPLE_REVOKE)
    expect(DELETING_IMMEDIATELY_REVOKES_CLAIM).toMatch(IMMEDIATE_APPLE_REVOKE)
    expect(IMMEDIATE_REVOCATION_CLAIM).toMatch(IMMEDIATE_APPLE_REVOKE)
    expect(REVOCATION_IS_IMMEDIATE_CLAIM).toMatch(IMMEDIATE_APPLE_REVOKE)
    expect(APPLE_REVOCATION_IS_IMMEDIATE_CLAIM).toMatch(IMMEDIATE_APPLE_REVOKE)
    expect(DELETED_AFTER_SEVEN_DAYS_CLAIM).toMatch(EARLY_APPLE_DELETE)
    expect(REVOKED_AT_PURGE_AFTER_THIRTY_DAYS).not.toMatch(IMMEDIATE_APPLE_REVOKE)
    expect(REVOKED_AT_PURGE_AFTER_THIRTY_DAYS).not.toMatch(ON_DELETE_APPLE_REVOKE)
    expect(REVOKED_AT_PURGE_AFTER_THIRTY_DAYS).not.toMatch(EARLY_APPLE_DELETE)
  })

  // Negation before the revoke verb is the restore hold, not a false claim.
  it('allows negated Apple revoke claims and still flags affirmative ones', () => {
    expect(NOT_IMMEDIATELY_REVOKED_CLAIM).not.toMatch(IMMEDIATE_APPLE_REVOKE)
    expect(NOT_REVOKED_IMMEDIATELY_CLAIM).not.toMatch(IMMEDIATE_APPLE_REVOKE)
    expect(NOT_REVOKED_WHEN_YOU_DELETE_CLAIM).not.toMatch(ON_DELETE_APPLE_REVOKE)
    expect(NOT_IMMEDIATELY_REVOKED_WHEN_YOU_DELETE_CLAIM).not.toMatch(
      ON_DELETE_APPLE_REVOKE,
    )
    expect(NOT_IMMEDIATELY_REVOKED_ON_DELETE_CLAIM).not.toMatch(
      ON_DELETE_APPLE_REVOKE,
    )
    expect(NEGATED_ON_DELETE_CLAIM).not.toMatch(ON_DELETE_APPLE_REVOKE)
    expect(IMMEDIATELY_REVOKED_CLAIM).toMatch(IMMEDIATE_APPLE_REVOKE)
    expect(AFFIRMATIVE_ON_DELETE_CLAIM).toMatch(ON_DELETE_APPLE_REVOKE)
  })

  // Immediate-at-purge is the restore window ending, not an on-delete revoke.
  it('allows immediate revocation at purge and still flags immediate-on-delete', () => {
    expect(IMMEDIATE_REVOKE_AT_PURGE_CLAIM).not.toMatch(IMMEDIATE_APPLE_REVOKE)
    expect(IMMEDIATELY_REVOKED_CLAIM).toMatch(IMMEDIATE_APPLE_REVOKE)
    expect(IMMEDIATE_ON_DELETE_AND_PURGE_CLAIM).toMatch(IMMEDIATE_APPLE_REVOKE)
  })

  // Deletion-first wording is the same false claim; revoke-at-purge after
  // mentioning delete is the restore hold.
  it('rejects deletion-first Apple revoke claims without treating purge-after-delete as on-delete', () => {
    expect(DELETE_THEN_REVOKE_CLAIM).toMatch(ON_DELETE_APPLE_REVOKE)
    expect(DELETE_THEN_TOKEN_REVOKED_CLAIM).toMatch(ON_DELETE_APPLE_REVOKE)
    expect(DELETE_THEN_REVOKE_AT_PURGE_CLAIM).not.toMatch(ON_DELETE_APPLE_REVOKE)
    expect(REVOKED_AT_PURGE_AFTER_THIRTY_DAYS).not.toMatch(ON_DELETE_APPLE_REVOKE)
  })

  // "Upon account deletion" is the same false claim as "when you delete".
  it('rejects revocation upon account deletion as an on-delete claim', () => {
    expect(REVOKED_UPON_ACCOUNT_DELETION_CLAIM).toMatch(ON_DELETE_APPLE_REVOKE)
    expect(REVOCATION_UPON_ACCOUNT_DELETION_CLAIM).toMatch(
      ON_DELETE_APPLE_REVOKE,
    )
    expect(UPON_ACCOUNT_DELETION_THEN_REVOKED_CLAIM).toMatch(
      ON_DELETE_APPLE_REVOKE,
    )
    expect(UPON_DELETION_THEN_REVOKED_CLAIM).toMatch(ON_DELETE_APPLE_REVOKE)
    expect(REVOKED_AT_PURGE_AFTER_THIRTY_DAYS).not.toMatch(ON_DELETE_APPLE_REVOKE)
  })

  // Denying an early purge is accurate; "deleted after 7 days" is not.
  it('allows a negated early-delete Apple claim', () => {
    expect(NOT_DELETED_AFTER_SEVEN_DAYS_CLAIM).not.toMatch(EARLY_APPLE_DELETE)
    expect(DELETED_AFTER_SEVEN_DAYS_CLAIM).toMatch(EARLY_APPLE_DELETE)
  })
})
