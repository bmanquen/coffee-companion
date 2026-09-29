import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planLimits } from '@coffee-companion/api/lib/plan'
import { AuthenticatedLayout } from './_authenticated'
import type * as ReactRouter from '@tanstack/react-router'
import { setAnalyticsClient } from '@/lib/analytics'
import { createTestProviders } from '@/test/providers'

const mocks = vi.hoisted(() => ({
  identify: vi.fn(),
  setSentryUser: vi.fn(),
}))

vi.mock('@/lib/sentry-client', () => ({
  setSentryUser: mocks.setSentryUser,
}))

vi.mock('@/components/BottomNav', () => ({ default: () => null }))
vi.mock('@/components/MobileHeader', () => ({ default: () => null }))
vi.mock('@/components/Navigation', () => ({ default: () => null }))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>()
  return {
    ...actual,
    createFileRoute:
      () =>
      (opts: Record<string, unknown>) => ({
        ...opts,
        useRouteContext: () => ({
          session: { user: { id: 'user_123' } },
        }),
      }),
    Outlet: () => null,
  }
})

function renderLayout() {
  const providers = createTestProviders()
  const client = {
    capture: vi.fn(),
    identify: mocks.identify,
    reset: vi.fn(),
  }
  setAnalyticsClient(client)
  return { ...providers, client }
}

describe('AuthenticatedLayout identify-on-boot', () => {
  beforeEach(() => {
    mocks.identify.mockClear()
    mocks.setSentryUser.mockReturnValue(Promise.resolve())
  })

  afterEach(() => {
    setAnalyticsClient(undefined)
  })

  it('identifies the account while plan.current is pending', () => {
    const { queryClient, trpc, Wrapper } = renderLayout()
    void queryClient.prefetchQuery({
      queryKey: trpc.plan.current.queryKey(),
      queryFn: () => new Promise(() => {}),
    })

    render(<AuthenticatedLayout />, { wrapper: Wrapper })

    expect(mocks.identify).toHaveBeenCalledWith('user_123', undefined)
  })

  it('identifies the account when plan.current has failed', async () => {
    const { queryClient, trpc, Wrapper } = renderLayout()
    await queryClient
      .fetchQuery({
        queryKey: trpc.plan.current.queryKey(),
        queryFn: () => Promise.reject(new Error('plan.current failed')),
      })
      .catch(() => {})

    render(<AuthenticatedLayout />, { wrapper: Wrapper })

    expect(mocks.identify).toHaveBeenCalledWith('user_123', undefined)
  })

  it('attaches the plan once plan.current resolves', () => {
    const { queryClient, trpc, Wrapper } = renderLayout()
    queryClient.setQueryData(trpc.plan.current.queryKey(), {
      plan: 'pro',
      limits: planLimits.pro,
      renewalFailing: false,
      subscription: null,
    })

    render(<AuthenticatedLayout />, { wrapper: Wrapper })

    expect(mocks.identify).toHaveBeenCalledWith('user_123', { plan: 'pro' })
  })
})
