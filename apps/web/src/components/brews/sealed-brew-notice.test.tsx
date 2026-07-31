import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SealedBrewNotice } from './sealed-brew-notice'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

describe('SealedBrewNotice', () => {
  it('says the brew is kept, not lost, and offers the way back to it', () => {
    render(<SealedBrewNotice />)

    const notice = screen.getByRole('note')
    expect(notice.textContent).toMatch(/sealed/i)
    // ADR-0004: nothing is ever deleted, and the copy has to say so.
    expect(notice.textContent).toMatch(/still (yours|stored)/i)
    expect(
      screen.getByRole('link', { name: /plans/i }).getAttribute('href'),
    ).toBe('/pricing')
  })
})
