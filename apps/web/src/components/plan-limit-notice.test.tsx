import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlanLimitNotice } from './plan-limit-notice'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

describe('PlanLimitNotice', () => {
  it('shows the refusal and offers the way past it', () => {
    render(
      <PlanLimitNotice message="Free holds 1 grinder. Subscribe to add more." />,
    )

    expect(screen.getByRole('alert').textContent).toContain(
      'Free holds 1 grinder. Subscribe to add more.',
    )
    expect(
      screen.getByRole('link', { name: /plans/i }).getAttribute('href'),
    ).toBe('/pricing')
  })
})
