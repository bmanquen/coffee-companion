import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MobileHeader from './MobileHeader'
import type { ReactNode } from 'react'

const authState = vi.hoisted(() => ({
  session: null as {
    user: { name: string; email: string; image: string | null }
  } | null,
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
  useNavigate: () => mocks.navigate,
}))

// Render the Radix Popover inline so its content is queryable in jsdom.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AvatarImage: ({ src }: { src?: string }) => <img alt="" src={src} />,
  AvatarFallback: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
}))

describe('MobileHeader', () => {
  it('shows the title, account details, and signs out when signed in', async () => {
    authState.session = {
      user: { name: 'Test User', email: 'test@example.com', image: null },
    }
    render(<MobileHeader />)

    expect(screen.getByText('Coffee Companion')).toBeTruthy()
    expect(screen.getByText('Test User')).toBeTruthy()
    expect(screen.getByText('test@example.com')).toBeTruthy()
    // Avatar fallback initial when there is no image.
    expect(screen.getByText('T')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }))
    })
    expect(mocks.signOut).toHaveBeenCalled()
  })

  it('shows a sign-in button and no account details when signed out', async () => {
    authState.session = null
    render(<MobileHeader />)

    expect(screen.getByText('Coffee Companion')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign Out' })).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    })
    expect(mocks.signInSocial).toHaveBeenCalledWith({ provider: 'google' })
  })
})
