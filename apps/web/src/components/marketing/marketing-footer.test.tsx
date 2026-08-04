import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarketingFooter } from './marketing-footer'
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

describe('MarketingFooter', () => {
  it('names the site and links to both public pages', () => {
    render(<MarketingFooter />)

    expect(screen.getByText('Coffee Companion')).toBeTruthy()

    const nav = within(screen.getByRole('navigation', { name: 'Footer' }))
    expect(nav.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/')
    expect(nav.getByRole('link', { name: 'Pricing' }).getAttribute('href')).toBe(
      '/pricing',
    )
  })
})
