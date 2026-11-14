import { createElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSignOut } from './use-sign-out'
import type { ReactNode } from 'react'

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(async () => ({})),
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

function renderSignOut(queryClient = new QueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  return { queryClient, ...renderHook(() => useSignOut(), { wrapper }) }
}

describe('useSignOut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setSentryUser.mockReturnValue(Promise.resolve())
  })

  it('clears the analytics and Sentry identities before signing out', async () => {
    const { result } = renderSignOut()

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

    const { result } = renderSignOut()

    await result.current()

    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/' })
  })

  it('clears cached queries after sign-out and before navigating', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['coffee.getAll'], [{ id: 'c1', name: 'Kept' }])
    const clear = vi.spyOn(queryClient, 'clear')
    const { result } = renderSignOut(queryClient)

    await result.current()

    expect(clear).toHaveBeenCalledOnce()
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      clear.mock.invocationCallOrder[0],
    )
    expect(clear.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.navigate.mock.invocationCallOrder[0],
    )
    expect(queryClient.getQueryData(['coffee.getAll'])).toBeUndefined()
  })

  // On the server there is no window, so the seam returns nothing to await.
  it('signs out when there is no browser Sentry to clear', async () => {
    mocks.setSentryUser.mockReturnValue(undefined)

    const { result } = renderSignOut()

    await result.current()

    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/' })
  })

  it('throws before clearing queries when sign-out returns an error', async () => {
    mocks.signOut.mockResolvedValueOnce({ error: { message: 'nope' } })
    const queryClient = new QueryClient()
    queryClient.setQueryData(['coffee.getAll'], [{ id: 'c1', name: 'Kept' }])
    const clear = vi.spyOn(queryClient, 'clear')
    const { result } = renderSignOut(queryClient)

    await expect(result.current()).rejects.toEqual({ message: 'nope' })

    expect(clear).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(['coffee.getAll'])).toEqual([
      { id: 'c1', name: 'Kept' },
    ])
  })
})
