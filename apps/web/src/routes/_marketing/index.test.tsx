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
  it('leads with a single headline', () => {
    renderHome()
    expect(screen.getAllByRole('heading', { level: 1 }).length).toBe(1)
  })

  it('offers two identically worded calls to action, each reporting the intent', () => {
    const { onSignIn } = renderHome()

    const ctas = screen.getAllByRole('button')
    expect(ctas.length).toBe(2)
    expect(new Set(ctas.map((cta) => cta.textContent)).size).toBe(1)

    for (const cta of ctas) fireEvent.click(cta)
    expect(onSignIn).toHaveBeenCalledTimes(ctas.length)
  })

  it('links to the pricing page', () => {
    renderHome()
    expect(
      screen.getByRole('link', { name: /pricing/i }).getAttribute('href'),
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

  it('proves which variables a brew captures', () => {
    renderHome()

    const cards = screen.getAllByRole('heading', { level: 3 })
    expect(cards.length).toBe(3)

    const captured = cards
      .map((heading) => heading.closest('[data-slot="card"]')?.textContent)
      .join(' ')
    expect(captured).toMatch(/dose/i)
    expect(captured).toMatch(/grind/i)
    expect(captured).toMatch(/tast/i)
  })

  it('explains what Dialed-in means', () => {
    renderHome()

    const explanation = screen.getByText('Dialed-in').closest('p')?.textContent
    expect(explanation).toMatch(/reference/i)
    expect(explanation).toMatch(/coffee/i)
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
})
