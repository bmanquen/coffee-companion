import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DeleteBrewDialog } from './delete-brew-dialog'

describe('DeleteBrewDialog', () => {
  it('opens a confirmation naming the coffee and noun, and fires onDelete', () => {
    const onDelete = vi.fn()
    render(
      <DeleteBrewDialog
        noun="brew"
        coffeeName="Ethiopia Guji"
        onDelete={onDelete}
        isPending={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete brew' }))

    const dialog = within(screen.getByRole('dialog'))
    expect(
      dialog.getByText(/Are you sure you want to delete this brew/i),
    ).toBeTruthy()
    expect(dialog.getByText(/Ethiopia Guji/)).toBeTruthy()

    fireEvent.click(dialog.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('disables the confirm button while pending', () => {
    render(
      <DeleteBrewDialog
        noun="shot"
        coffeeName="Ethiopia Guji"
        onDelete={() => {}}
        isPending
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete shot' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(
      dialog.getByRole('button', { name: 'Delete' }).hasAttribute('disabled'),
    ).toBe(true)
  })
})
