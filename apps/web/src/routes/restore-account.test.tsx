import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RestoreAccountScreen } from './restore-account'

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError },
}))

describe('RestoreAccountScreen', () => {
  beforeEach(() => {
    mocks.toastError.mockClear()
  })

  it('says restoring does not restart billing', async () => {
    render(
      <RestoreAccountScreen
        deletedAt={new Date('2026-10-05T12:00:00.000Z')}
        onRestore={vi.fn()}
      />,
    )

    expect(
      await screen.findByText(
        /Restore your account before .+ to keep it\. Your account data will be deleted on or after that day\./,
      ),
    ).toBeTruthy()
    expect(screen.getByText(/Subscription stays cancelled/)).toBeTruthy()
    expect(
      screen.getByText(/does not start a new one.*will not be refunded/i),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Restore account' }),
    ).toBeTruthy()
  })

  it('restores when asked', async () => {
    const onRestore = vi.fn().mockResolvedValue(undefined)
    render(
      <RestoreAccountScreen
        deletedAt={new Date('2026-10-05T12:00:00.000Z')}
        onRestore={onRestore}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restore account' }))

    await waitFor(() => expect(onRestore).toHaveBeenCalled())
  })

  it('says so when restore fails', async () => {
    const onRestore = vi.fn().mockRejectedValue(new Error('unavailable'))
    render(
      <RestoreAccountScreen
        deletedAt={new Date('2026-10-05T12:00:00.000Z')}
        onRestore={onRestore}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restore account' }))

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'We could not restore your account',
        expect.objectContaining({ description: 'Please try again.' }),
      ),
    )
  })
})
