import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountScreen } from './account'
import type * as ReactRouter from '@tanstack/react-router'

const mocks = vi.hoisted(() => ({
  billingPortal: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: { subscription: { billingPortal: mocks.billingPortal } },
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError },
}))

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

const user = { name: 'Ada Lovelace', email: 'ada@example.com' }

function renderAccount(
  props: Partial<Parameters<typeof AccountScreen>[0]> = {},
) {
  return render(
    <AccountScreen
      user={user}
      plan="pro"
      subscription={null}
      onExport={vi.fn()}
      {...props}
    />,
  )
}

describe('AccountScreen', () => {
  beforeEach(() => {
    mocks.billingPortal.mockReset()
    mocks.billingPortal.mockResolvedValue({ data: {}, error: null })
    mocks.toastError.mockClear()
  })

  it('shows who is signed in and the Plan they hold', () => {
    renderAccount()

    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
    expect(screen.getByText('ada@example.com')).toBeTruthy()
    expect(screen.getByText('Pro')).toBeTruthy()
  })

  it('offers a subscriber the chance to manage their Subscription', async () => {
    renderAccount({
      subscription: { plan: 'pro', endsAt: null },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Manage subscription' }))

    await waitFor(() =>
      expect(mocks.billingPortal).toHaveBeenCalledWith(
        expect.objectContaining({ returnUrl: '/account' }),
      ),
    )
  })

  it('says so when the portal could not be opened', async () => {
    mocks.billingPortal.mockResolvedValue({
      data: null,
      error: { message: 'Customer not found' },
    })
    renderAccount({
      subscription: { plan: 'pro', endsAt: null },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Manage subscription' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
  })

  it('points someone with no Subscription at the plans instead', () => {
    renderAccount()

    expect(
      screen.queryByRole('button', { name: 'Manage subscription' }),
    ).toBeNull()
    expect(screen.getByRole('link', { name: 'See plans' }).getAttribute('href')).toBe(
      '/pricing',
    )
  })

  it('says when access ends once a cancellation is pending', () => {
    renderAccount({
      subscription: {
        plan: 'pro',
        endsAt: new Date('2026-10-14T09:30:00.000Z'),
      },
    })

    expect(screen.getByText(/Pro until October 14(th)?, 2026/)).toBeTruthy()
  })

  it('does not speak of an ending while none is pending', () => {
    renderAccount({
      subscription: { plan: 'pro', endsAt: null },
    })

    expect(screen.queryByText(/until/)).toBeNull()
  })

  it('offers an export of account data', () => {
    renderAccount()

    expect(screen.getByRole('button', { name: 'Export data' })).toBeTruthy()
  })

  it('exports when asked', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined)
    renderAccount({ onExport })

    fireEvent.click(screen.getByRole('button', { name: 'Export data' }))

    await waitFor(() => expect(onExport).toHaveBeenCalled())
  })

  it('says so when the export could not be built', async () => {
    const onExport = vi.fn().mockRejectedValue(new Error('unavailable'))
    renderAccount({ onExport })

    fireEvent.click(screen.getByRole('button', { name: 'Export data' }))

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'We could not export your data',
        expect.objectContaining({ description: 'Please try again.' }),
      ),
    )
  })
})
