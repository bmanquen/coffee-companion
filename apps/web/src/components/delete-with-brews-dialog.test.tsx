import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestProviders } from '@/test/providers'
import { trpcSuccess } from '@/test/trpc-response'
import { DeleteWithBrewsDialog } from './delete-with-brews-dialog'

afterEach(() => vi.restoreAllMocks())

// The server's reply to this opening's brewCount fetch.
const replyWith = (reply: () => Promise<Response>) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(reply)
const replyCount = (count: number) =>
  replyWith(() => Promise.resolve(trpcSuccess(count)))

// cachedCount stands in for a count fetched on an earlier opening.
function openDialog({
  noun,
  cachedCount,
}: {
  noun: string
  cachedCount?: number
}) {
  const { queryClient, trpc, Wrapper } = createTestProviders()
  if (cachedCount !== undefined) {
    queryClient.setQueryData(trpc.coffee.brewCount.queryKey('id1'), cachedCount)
  }
  const onDelete = vi.fn()
  render(
    <DeleteWithBrewsDialog
      noun={noun}
      name="Ethiopia Guji"
      brewCountOptions={trpc.coffee.brewCount.queryOptions('id1')}
      onDelete={onDelete}
      isPending={false}
    />,
    { wrapper: Wrapper },
  )
  fireEvent.click(screen.getByRole('button', { name: `Delete ${noun}` }))
  return { dialog: within(screen.getByRole('dialog')), onDelete }
}

const everyBrewWarning =
  /This also permanently deletes every brew made with it, including any you marked as dialed in\./

describe('DeleteWithBrewsDialog', () => {
  it('names how many brews go, dialed-in ones included', async () => {
    replyCount(14)
    const { dialog, onDelete } = openDialog({ noun: 'coffee' })

    const confirm = await dialog.findByRole('button', {
      name: 'Delete coffee and 14 brews',
    })
    expect(
      dialog.getByText(
        'Are you sure you want to delete "Ethiopia Guji"? This also permanently deletes 14 brews made with it, including any you marked as dialed in. This cannot be undone.',
      ),
    ).toBeTruthy()
    fireEvent.click(confirm)
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('says one brew in the singular', async () => {
    replyCount(1)
    const { dialog } = openDialog({ noun: 'grinder' })

    expect(
      await dialog.findByRole('button', { name: 'Delete grinder and 1 brew' }),
    ).toBeTruthy()
    expect(
      dialog.getByText(/permanently deletes 1 brew made with it, including/),
    ).toBeTruthy()
  })

  it('says no brews go when there are none', async () => {
    replyCount(0)
    const { dialog } = openDialog({ noun: 'brewing device' })

    expect(await dialog.findByText(/No brews were made with it\./)).toBeTruthy()
    expect(dialog.queryByText(/permanently deletes/)).toBeNull()
    expect(dialog.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  // A brew logged since the last opening would make an old zero a lie.
  it('does not trust a count from an earlier opening while it refetches', () => {
    replyWith(() => new Promise(() => {}))
    const { dialog } = openDialog({ noun: 'coffee', cachedCount: 0 })

    expect(dialog.getByText(everyBrewWarning)).toBeTruthy()
    expect(dialog.queryByText(/No brews were made/)).toBeNull()
    expect(dialog.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('does not trust a count from an earlier opening when the refetch fails', async () => {
    replyWith(() => Promise.reject(new Error('offline')))
    const { dialog } = openDialog({ noun: 'coffee', cachedCount: 0 })

    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(dialog.getByText(everyBrewWarning)).toBeTruthy()
    expect(dialog.queryByText(/No brews were made/)).toBeNull()
  })
})
