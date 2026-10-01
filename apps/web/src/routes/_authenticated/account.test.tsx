import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
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
      onDelete={vi.fn()}
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
    expect(
      screen.getByRole('link', { name: 'See plans' }).getAttribute('href'),
    ).toBe('/pricing')
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

  it('offers deletion behind a confirmation that names what is about to go', () => {
    renderAccount()

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toMatch(/Coffees/)
    expect(dialog.textContent).toMatch(/Brews/)
    expect(dialog.textContent).toMatch(/Subscription/)
    expect(dialog.textContent).toMatch(/not refunded/)
    expect(dialog.textContent).not.toMatch(/PostHog/)
    expect(dialog.textContent).toMatch(/cannot be undone/i)
  })

  it('puts the export in front of the irreversible step', () => {
    renderAccount()

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('button', { name: 'Export data' })).toBeTruthy()
    expect(dialog.getByRole('button', { name: 'Delete account' })).toBeTruthy()
  })

  it('does not delete until the confirmation is confirmed', async () => {
    const onDelete = vi.fn()
    renderAccount({ onDelete })

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    expect(onDelete).not.toHaveBeenCalled()
  })

  it('deletes when the confirmation is confirmed', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderAccount({ onDelete })

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete account',
      }),
    )

    await waitFor(() => expect(onDelete).toHaveBeenCalled())
  })

  it('exports from the confirmation without deleting', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined)
    const onDelete = vi.fn()
    renderAccount({ onExport, onDelete })

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Export data',
      }),
    )

    await waitFor(() => expect(onExport).toHaveBeenCalled())
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('says so when the account could not be deleted', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('unavailable'))
    renderAccount({ onDelete })

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete account',
      }),
    )

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'We could not delete your account',
        expect.objectContaining({ description: 'Please try again.' }),
      ),
    )
  })

  it('shows the Stripe failure reason when cancellation stopped the delete', async () => {
    const onDelete = vi
      .fn()
      .mockRejectedValue(
        Object.assign(
          new Error(
            'We could not cancel your Subscription, so your account was not deleted. Try again.',
          ),
          { data: { code: 'PRECONDITION_FAILED' } },
        ),
      )
    renderAccount({ onDelete })

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete account',
      }),
    )

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'We could not delete your account',
        expect.objectContaining({
          description:
            'We could not cancel your Subscription, so your account was not deleted. Try again.',
        }),
      ),
    )
  })

  it('does not let deletion start while an export is still running', async () => {
    let finish!: () => void
    const onExport = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const onDelete = vi.fn()
    renderAccount({ onExport, onDelete })

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: 'Export data' }))

    expect(
      dialog
        .getByRole('button', { name: 'Delete account' })
        .hasAttribute('disabled'),
    ).toBe(true)

    finish()

    await waitFor(() =>
      expect(
        dialog
          .getByRole('button', { name: 'Delete account' })
          .hasAttribute('disabled'),
      ).toBe(false),
    )
    expect(onDelete).not.toHaveBeenCalled()
  })
})
