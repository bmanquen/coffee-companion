import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Navigation from './Navigation'
import type { ReactNode } from 'react'

const authState = vi.hoisted(() => ({
  session: null as { user: { name: string; image: string | null } } | null,
}))
const mocks = vi.hoisted(() => ({
  signInSocial: vi.fn(),
  signOut: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: authState.session }),
    signIn: { social: mocks.signInSocial },
    signOut: mocks.signOut,
  },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mocks.navigate,
}))

// Mock the Radix Sheet so its content renders inline (no browser-only APIs).
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SheetContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AvatarImage: ({ src }: { src?: string }) => <img alt="" src={src} />,
}))

describe('Navigation', () => {
  it('shows authenticated links and the user, and signs out', async () => {
    authState.session = { user: { name: 'Test User', image: null } }
    render(<Navigation open setOpen={() => {}} />)

    expect(screen.getByRole('link', { name: 'Coffee' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Brews' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Equipment' })).toBeTruthy()
    expect(screen.getByText('Test User')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }))
    })
    expect(mocks.signOut).toHaveBeenCalled()
  })

  it('closes the drawer when any nav link is selected', () => {
    authState.session = { user: { name: 'Test User', image: null } }
    const setOpen = vi.fn()
    render(<Navigation open setOpen={setOpen} />)

    for (const name of ['Home', 'Coffee', 'Brews', 'Equipment']) {
      fireEvent.click(screen.getByRole('link', { name }))
    }
    expect(setOpen).toHaveBeenCalledTimes(4)
    expect(setOpen).toHaveBeenCalledWith(false)
  })

  it('shows sign-in and no authenticated links when signed out', async () => {
    authState.session = null
    render(<Navigation open setOpen={() => {}} />)

    expect(screen.queryByRole('link', { name: 'Coffee' })).toBeNull()
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Sign in with Google' }),
      )
    })
    expect(mocks.signInSocial).toHaveBeenCalledWith({ provider: 'google' })
  })
})
