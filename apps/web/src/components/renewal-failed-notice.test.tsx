import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RenewalFailedNotice } from './renewal-failed-notice'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string
    children: ReactNode
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describe('RenewalFailedNotice', () => {
  it('says the payment failed while the card can still be fixed', () => {
    render(<RenewalFailedNotice />)

    const alert = screen.getByRole('alert').textContent
    expect(alert).toMatch(/payment/i)
    // The reassurance is the point: nothing has been taken away yet, so the
    // notice must not read as an ending.
    expect(alert).toMatch(/still/i)
  })

  it('sends the user to their account, where the card can be managed', () => {
    render(<RenewalFailedNotice />)

    const link = screen.getByRole('link', { name: /card/i })
    expect(link.getAttribute('href')).toBe('/account')
  })
})
