import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BrewsEmptyState } from './brews-empty-state'
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

describe('BrewsEmptyState', () => {
  it('renders the message and a link to the new-brew form', () => {
    render(
      <BrewsEmptyState
        message="No cold brews yet."
        to="/cold-brew/new"
        linkLabel="Log your first brew"
      />,
    )

    expect(screen.getByText(/No cold brews yet/i)).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Log your first brew' })
    expect(link.getAttribute('href')).toBe('/cold-brew/new')
  })
})
