import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BottomNav from './BottomNav'
import type { ReactNode } from 'react'

const authState = vi.hoisted(() => ({
  session: null as { user: { name: string; image: string | null } } | null,
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: authState.session }),
  },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

describe('BottomNav', () => {
  it('renders nothing when signed out', () => {
    authState.session = null
    const { container } = render(<BottomNav />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the primary tabs with their routes when signed in', () => {
    authState.session = { user: { name: 'Test User', image: null } }
    render(<BottomNav />)

    const tabs: Array<[string, string]> = [
      ['Home', '/'],
      ['Coffee', '/coffees'],
      ['Espresso', '/espresso'],
      ['Equipment', '/equipment'],
    ]
    for (const [name, href] of tabs) {
      expect(screen.getByRole('link', { name }).getAttribute('href')).toBe(href)
    }
  })
})
