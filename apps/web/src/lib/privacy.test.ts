import { describe, expect, it } from 'vitest'
import { posthogPersonRetention, recipients } from './privacy'

const IMMEDIATE_APPLE_REVOKE =
  /revok(e|es|ed)\b.{0,80}immediately|immediat(e|ely).{0,80}(revok(e|es|ed)|revocation)/i
const ON_DELETE_APPLE_REVOKE =
  /revok(e|es|ed)\b.{0,80}(?<!not )(on delete|when you delete|as soon as you delete)/i
const EARLY_APPLE_DELETE =
  /(deleted|purged|revoked)\b.{0,40}after ([1-9]|[12]\d)(?!\d) days?/i

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
    expect(DELETED_AFTER_SEVEN_DAYS_CLAIM).toMatch(EARLY_APPLE_DELETE)
    expect(REVOKED_AT_PURGE_AFTER_THIRTY_DAYS).not.toMatch(IMMEDIATE_APPLE_REVOKE)
    expect(REVOKED_AT_PURGE_AFTER_THIRTY_DAYS).not.toMatch(ON_DELETE_APPLE_REVOKE)
    expect(REVOKED_AT_PURGE_AFTER_THIRTY_DAYS).not.toMatch(EARLY_APPLE_DELETE)
  })

  // "not when you delete" is the restore hold, not an on-delete revoke.
  it('allows a negated on-delete Apple claim and still flags an affirmative one', () => {
    expect(NEGATED_ON_DELETE_CLAIM).not.toMatch(ON_DELETE_APPLE_REVOKE)
    expect(AFFIRMATIVE_ON_DELETE_CLAIM).toMatch(ON_DELETE_APPLE_REVOKE)
  })
})
