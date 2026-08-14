import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RenewalFailedNotice } from './renewal-failed-notice'

describe('RenewalFailedNotice', () => {
  it('says the payment failed while the card can still be fixed', () => {
    render(<RenewalFailedNotice />)

    const alert = screen.getByRole('alert').textContent ?? ''
    expect(alert).toMatch(/payment/i)
    // The reassurance is the point: nothing has been taken away yet, so the
    // notice must not read as an ending.
    expect(alert).toMatch(/still/i)
  })

  it('sends the user to Link, which is where the card lives', () => {
    render(<RenewalFailedNotice />)

    const link = screen.getByRole('link', { name: /card/i })
    expect(link.getAttribute('href')).toBe('https://link.com')
    // Leaves the app rather than replacing it.
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })
})
