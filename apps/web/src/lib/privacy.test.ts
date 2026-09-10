import { describe, expect, it } from 'vitest'
import { recipients } from './privacy'

describe('recipients', () => {
  it('names both third parties the app sends data to', () => {
    expect(recipients.map((recipient) => recipient.name)).toEqual([
      'Sentry',
      'PostHog',
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

  // ADR 0009 and ADR 0010 both turn on the app never sending a name or an
  // email. A recipient added here that claims to receive one contradicts them.
  it('claims no recipient receives a name or an email', () => {
    for (const recipient of recipients) {
      for (const item of recipient.receives) {
        expect(item).not.toMatch(/\bemail\b|\bname of\b/i)
      }
    }
  })
})
