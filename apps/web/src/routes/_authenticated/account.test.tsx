import { QueryClient } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountScreen, finishAccountDeletion } from './account'
import type * as ReactRouter from '@tanstack/react-router'

const restoreBy = new Date('2026-11-07T12:00:00.000Z')
const grantEnds = new Date('2026-10-14T09:30:00.000Z')
const proPlusEnds = new Date('2026-11-01T18:00:00.000Z')

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
      plan="free"
      subscription={null}
      grant={null}
      endedGrant={null}
      restoreBy={restoreBy}
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
    renderAccount({ plan: 'pro', grant: { plan: 'pro', endsAt: null, afterThat: null } })

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

    expect(screen.getByText("You don't have a subscription.")).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Manage subscription' }),
    ).toBeNull()
    expect(
      screen.getByRole('link', { name: 'See plans' }).getAttribute('href'),
    ).toBe('/pricing')
  })

  it('says a Grant with no end date was added, with nothing to manage', () => {
    renderAccount({ plan: 'pro', grant: { plan: 'pro', endsAt: null, afterThat: null } })

    expect(
      screen.getByText(
        "You're on Pro. This plan was added to your account, so there's no billing to manage.",
      ),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Manage subscription' }),
    ).toBeNull()
    expect(screen.queryByRole('link', { name: 'See plans' })).toBeNull()
  })

  it('says when a Grant will end, with nothing to manage', () => {
    renderAccount({
      plan: 'pro',
      grant: { plan: 'pro', endsAt: grantEnds, afterThat: null },
    })

    expect(
      screen.getByText(
        /You're on Pro until October 14(th)?, 2026\. This plan was added to your account, so there's no billing to manage\./,
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'See plans' })).toBeNull()
  })

  it('says what continues after a dated Grant when a lesser Grant has no end', () => {
    renderAccount({
      plan: 'proPlus',
      grant: { plan: 'proPlus', endsAt: proPlusEnds, afterThat: 'pro' },
    })

    expect(
      screen.getByText(
        /You're on Pro\+ until November 1(st)?, 2026\. After that, you'll be on Pro\. This plan was added to your account, so there's no billing to manage\./,
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/^You're on Pro\./)).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Manage subscription' }),
    ).toBeNull()
    expect(screen.queryByRole('link', { name: 'See plans' })).toBeNull()
  })

  it('says when a Grant has ended and points at the plans', () => {
    renderAccount({
      endedGrant: { plan: 'pro', endedAt: grantEnds },
    })

    expect(
      screen.getByText(/Your Pro plan ended on October 14(th)?, 2026\./),
    ).toBeTruthy()
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

    expect(
      screen.getByText(
        /Export a copy first\. Your account data is kept for 30 days, then deleted\./,
      ),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toMatch(/account data is kept for 30 days/i)
    expect(dialog.textContent).toMatch(/restore it during that time/i)
    expect(dialog.textContent).not.toMatch(/Subscription is cancelled now/i)
    expect(dialog.textContent).not.toMatch(/will not be refunded/)
    expect(dialog.textContent).not.toMatch(/PostHog/)
    expect(dialog.textContent).not.toMatch(/cannot be undone/i)
  })

  it('keeps the Subscription cancel line for a subscriber', () => {
    renderAccount({
      plan: 'pro',
      subscription: { plan: 'pro', endsAt: null },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    expect(screen.getByRole('dialog').textContent).toMatch(
      /Subscription is cancelled now/,
    )
    expect(screen.getByRole('dialog').textContent).toMatch(
      /will not be refunded/,
    )
  })

  it('tells a Grant holder the Plan comes back on restore', () => {
    renderAccount({
      plan: 'pro',
      grant: { plan: 'pro', endsAt: null, afterThat: null },
    })

    expect(
      screen.getByText(
        /Export a copy first\. Your account data is kept for 30 days, then deleted\./,
      ),
    ).toBeTruthy()
    expect(
      screen.queryByText(/If you restore your account before/),
    ).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toMatch(
      /If you restore your account before November 7(th)?, 2026, your Pro plan comes back with it\./,
    )
    expect(dialog.textContent).not.toMatch(/Subscription is cancelled now/)
    expect(dialog.textContent).not.toMatch(/will not be refunded/)
  })

  it('says a stacked Grant comes back until its end, then moves to the lesser Plan', () => {
    renderAccount({
      plan: 'proPlus',
      grant: { plan: 'proPlus', endsAt: proPlusEnds, afterThat: 'pro' },
    })

    expect(
      screen.getByText(/You're on Pro\+ until November 1(st)?, 2026\./),
    ).toBeTruthy()
    expect(
      screen.queryByText(/If you restore your account before/),
    ).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toMatch(
      /If you restore your account before November 7(th)?, 2026, your Pro\+ plan comes back with it until November 1(st)?, 2026, and then you'll move to Pro\./,
    )
    expect(dialog.textContent).not.toMatch(/hasn't ended by then/)
    expect(dialog.textContent).not.toMatch(/Subscription is cancelled now/)
  })

  it('says a dated Grant only comes back if it has not ended', () => {
    renderAccount({
      plan: 'pro',
      grant: { plan: 'pro', endsAt: grantEnds, afterThat: null },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    expect(screen.getByRole('dialog').textContent).toMatch(
      /If you restore your account before November 7(th)?, 2026, your Pro plan comes back with it, as long as it hasn't ended by then\./,
    )
    expect(screen.getByRole('dialog').textContent).not.toMatch(
      /Subscription is cancelled now/,
    )
  })

  it('keeps the cancel line and adds the Grant line when both apply', () => {
    renderAccount({
      plan: 'pro',
      subscription: { plan: 'pro', endsAt: null },
      grant: { plan: 'pro', endsAt: null, afterThat: null },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toMatch(/Subscription is cancelled now/)
    expect(dialog.textContent).toMatch(/will not be refunded/)
    expect(dialog.textContent).toMatch(
      /If you restore your account before November 7(th)?, 2026, your Pro plan comes back with it\./,
    )
  })

  it('mentions a PostHog delete only when that call will run', () => {
    renderAccount({ personDeleteConfigured: true })

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    expect(screen.getByRole('dialog').textContent).toMatch(
      /PostHog profile is deleted when those 30 days end/i,
    )
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

describe('finishAccountDeletion', () => {
  it('leaves the query cache in place when sign-out succeeds', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['coffee.getAll'], [{ id: 'c1', name: 'Kept' }])
    const clear = vi.spyOn(queryClient, 'clear')
    const goHome = vi.fn()

    await finishAccountDeletion(async () => {}, queryClient, goHome)

    expect(clear).not.toHaveBeenCalled()
    expect(goHome).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(['coffee.getAll'])).toEqual([
      { id: 'c1', name: 'Kept' },
    ])
  })

  it('clears the query cache before going home when sign-out fails', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['coffee.getAll'], [{ id: 'c1', name: 'Kept' }])
    const clear = vi.spyOn(queryClient, 'clear')
    const goHome = vi.fn()

    await finishAccountDeletion(
      async () => {
        throw new Error('network')
      },
      queryClient,
      goHome,
    )

    expect(clear).toHaveBeenCalledOnce()
    expect(goHome).toHaveBeenCalledOnce()
    expect(clear.mock.invocationCallOrder[0]).toBeLessThan(
      goHome.mock.invocationCallOrder[0],
    )
    expect(queryClient.getQueryData(['coffee.getAll'])).toBeUndefined()
  })
})
