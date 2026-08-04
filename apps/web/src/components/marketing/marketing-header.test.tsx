import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarketingHeader } from './marketing-header'
import type * as ReactRouter from '@tanstack/react-router'

// Link needs router context; swap it for a plain anchor for unit rendering.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>()
  return {
    ...actual,
    Link: ({
      to,
      children,
      ...props
    }: {
      to: string
      children: React.ReactNode
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

describe('MarketingHeader', () => {
  it('offers the wordmark, pricing, and signing in — and nothing that needs an account', () => {
    render(<MarketingHeader onSignIn={vi.fn()} />)

    const nav = within(screen.getByRole('navigation', { name: 'Marketing' }))
    expect(
      screen.getByRole('link', { name: 'Coffee Companion' }).getAttribute('href'),
    ).toBe('/')
    expect(nav.getByRole('link', { name: 'Pricing' }).getAttribute('href')).toBe(
      '/pricing',
    )

    // A visitor has no account, so the signed-in app's destinations must not
    // appear here (see the note on the component).
    expect(screen.queryByRole('link', { name: /dashboard/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull()
  })

  it('reports a sign-in rather than navigating to one itself', () => {
    const onSignIn = vi.fn()
    render(<MarketingHeader onSignIn={onSignIn} />)

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(onSignIn).toHaveBeenCalledTimes(1)
  })
})
