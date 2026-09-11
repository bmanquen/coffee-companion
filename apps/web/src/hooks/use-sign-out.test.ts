import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSignOut } from './use-sign-out'

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  navigate: vi.fn(),
  resetAnalytics: vi.fn(),
  setSentryUser: vi.fn(),
}))

vi.mock('@/lib/analytics', () => ({ resetAnalytics: mocks.resetAnalytics }))
vi.mock('@/lib/sentry-client', () => ({ setSentryUser: mocks.setSentryUser }))
vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: mocks.signOut },
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

describe('useSignOut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setSentryUser.mockReturnValue(Promise.resolve())
  })

  it('clears the analytics and Sentry identities before signing out', async () => {
    const { result } = renderHook(() => useSignOut())

    await result.current()

    expect(mocks.resetAnalytics).toHaveBeenCalledOnce()
    expect(mocks.setSentryUser).toHaveBeenCalledWith(null)
    expect(mocks.setSentryUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signOut.mock.invocationCallOrder[0],
    )
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/' })
  })

  // Clearing Sentry is a dynamic import away, so a chunk that will not load
  // rejects here. Signing out is the thing the user pressed; it has to happen
  // anyway, or a failed telemetry call leaves them signed in.
  it('still signs out when clearing the Sentry identity rejects', async () => {
    mocks.setSentryUser.mockReturnValue(Promise.reject(new Error('chunk')))

    const { result } = renderHook(() => useSignOut())

    await result.current()

    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/' })
  })

  // On the server there is no window, so the seam returns nothing to await.
  it('signs out when there is no browser Sentry to clear', async () => {
    mocks.setSentryUser.mockReturnValue(undefined)

    const { result } = renderHook(() => useSignOut())

    await result.current()

    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/' })
  })
})
