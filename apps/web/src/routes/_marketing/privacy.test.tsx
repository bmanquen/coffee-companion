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

  it('links out to each recipient own policy', () => {
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
})
