import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarketingHome } from './index'
import type * as ReactRouter from '@tanstack/react-router'

// Link needs router context; swap it for a plain anchor for unit rendering.
// Mirrors the dashboard tests.
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

function renderHome() {
  const onSignIn = vi.fn()
  const utils = render(<MarketingHome onSignIn={onSignIn} />)
  return { ...utils, onSignIn }
}

describe('MarketingHome', () => {
  it('leads with what the product is for', () => {
    renderHome()
    expect(
      screen.getByRole('heading', { level: 1, name: /dialed it in/i }),
    ).toBeTruthy()
  })

  it('offers a sign-up call to action that reports the intent', () => {
    const { onSignIn } = renderHome()

    const ctas = screen.getAllByRole('button', { name: /start logging/i })
    expect(ctas.length).toBeGreaterThan(0)

    fireEvent.click(ctas[0])
    expect(onSignIn).toHaveBeenCalledTimes(1)
  })

  it('links to the pricing page', () => {
    renderHome()
    expect(
      screen.getByRole('link', { name: /see pricing/i }).getAttribute('href'),
    ).toBe('/pricing')
  })

  it('names every Brewing Method the app supports', () => {
    renderHome()
    for (const label of [
      'Espresso',
      'Pour Over',
      'French Press',
      'AeroPress',
      'Cold Brew',
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('explains what a Brew captures', () => {
    renderHome()
    expect(
      screen.getByRole('heading', { name: /what a Brew captures/i }),
    ).toBeTruthy()
    // The dial-in levers, in the glossary's terms.
    expect(screen.getByText(/dose in, yield out/i)).toBeTruthy()
    expect(screen.getByText(/Grinder setting/i)).toBeTruthy()
  })

  it('explains what Dialed-in means', () => {
    renderHome()
    expect(
      screen.getByRole('heading', { name: /mark the one that worked/i }),
    ).toBeTruthy()
    expect(screen.getByText('Dialed-in')).toBeTruthy()
    expect(screen.getByText(/reference for that Coffee/i)).toBeTruthy()
  })

  it('shows the product itself, with a Dialed-in Brew highlighted', () => {
    renderHome()

    // The hero renders the app's real table with sample Shots — the dial-in
    // summary columns and the reference marker, not a screenshot.
    const table = within(screen.getByRole('table'))
    expect(table.getAllByText('Ethiopia Guji').length).toBeGreaterThan(0)
    expect(table.getByText('Grind')).toBeTruthy()
    expect(table.getByText('Yield')).toBeTruthy()
    expect(table.getByLabelText('Dialed in')).toBeTruthy()
  })

  it('renders none of the authenticated app chrome', () => {
    const { container } = renderHome()
    // The signed-in bottom tab bar is labelled "Primary"; the drawer trigger is
    // "Open menu". Neither belongs on a page for people without accounts.
    expect(container.querySelector('[aria-label="Primary"]')).toBeNull()
    expect(screen.queryByRole('button', { name: /open menu/i })).toBeNull()
  })
})
