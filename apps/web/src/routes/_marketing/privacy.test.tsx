import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PrivacyPage } from './privacy'
import { recipients } from '@/lib/privacy'

describe('PrivacyPage', () => {
  it('gives every recipient a section naming it', () => {
    render(<PrivacyPage />)

    for (const { name } of recipients) {
      expect(screen.getByRole('heading', { name, level: 2 })).toBeTruthy()
    }
  })

  it('states what each recipient receives, keeps, and never gets', () => {
    render(<PrivacyPage />)

    for (const recipient of recipients) {
      const section = within(
        screen.getByRole('region', { name: recipient.name }),
      )
      expect(section.getByText(recipient.retention)).toBeTruthy()
      expect(section.getByText(recipient.lawfulBasis)).toBeTruthy()
      for (const item of [...recipient.receives, ...recipient.neverReceives]) {
        expect(section.getByText(item)).toBeTruthy()
      }
    }
  })

  it("links out to each recipient's own policy", () => {
    render(<PrivacyPage />)

    for (const recipient of recipients) {
      const link = within(
        screen.getByRole('region', { name: recipient.name }),
      ).getByRole('link', { name: `${recipient.name}'s privacy policy` })
      expect(link.getAttribute('href')).toBe(recipient.policyUrl)
      expect(link.getAttribute('rel')).toContain('noreferrer')
    }
  })

  // The claim that carries the most weight, and the one most easily lost in an
  // edit: a replay exists only because something broke (ADR 0010).
  it('says a replay is masked and only ever follows an error', () => {
    render(<PrivacyPage />)

    const replay = within(
      screen.getByRole('region', { name: 'Session replay' }),
    )
    expect(replay.getByText(/only when the app throws an error/i)).toBeTruthy()
    expect(replay.getByText(/never for an ordinary visit/i)).toBeTruthy()
    expect(replay.getByText(/every piece of text .* is masked/i)).toBeTruthy()
  })

  // ADR 0011: no banner. Strictly necessary writes are the session and the
  // one-shot router reload after a deploy; the monitoring SDKs stay in memory.
  it('says the device holds only strictly necessary writes', () => {
    render(<PrivacyPage />)

    const storage = within(
      screen.getByRole('region', { name: 'Cookies and device storage' }),
    )
    expect(storage.getByText(/sign-in session you asked for/i)).toBeTruthy()
    expect(
      storage.getByText(/fails to load after we ship a new version/i),
    ).toBeTruthy()
    expect(storage.getByText(/posthog and sentry/i)).toBeTruthy()
    expect(storage.getByText(/no consent banner/i)).toBeTruthy()
  })

  // A privacy page may only promise a right the app can actually honour.
  it('describes the account-page path to export and delete', () => {
    render(<PrivacyPage />)

    const own = within(screen.getByRole('region', { name: 'Your own data' }))
    expect(own.getByText(/exported from your account page/i)).toBeTruthy()
    expect(
      own.getByText(/delete the account from that same page/i),
    ).toBeTruthy()
    expect(own.getByText(/export is the last chance/i)).toBeTruthy()
    expect(own.getByText(/unused prepaid time is not refunded/i)).toBeTruthy()
    expect(
      own.getByText(
        /ask PostHog to delete the person .* when that call is configured/i,
      ),
    ).toBeTruthy()
    expect(own.getByText(/if it is not, the profile stays/i)).toBeTruthy()
    expect(own.queryByText(/deletes the PostHog person/i)).toBeNull()
    expect(own.queryByText(/no button that deletes your account/i)).toBeNull()
    expect(own.queryByText(/write to us/i)).toBeNull()
  })
})
