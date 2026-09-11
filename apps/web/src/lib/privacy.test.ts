import { describe, expect, it } from 'vitest'
import { recipients } from './privacy'

describe('recipients', () => {
  it('names every third party the app sends data to', () => {
    expect(recipients.map((recipient) => recipient.name)).toEqual([
      'Sentry',
      'PostHog',
      'Google',
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
    expect(
      sentry.neverReceives.some((item) => /your name/i.test(item)),
    ).toBe(true)
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
})
