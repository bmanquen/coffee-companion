import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { useAppForm } from '@/hooks/form'

function Harness() {
  const form = useAppForm({ defaultValues: { notes: '' } })
  return (
    <form.AppField name="notes">
      {(field) => <field.TextArea label="Notes" placeholder="Tasting notes" />}
    </form.AppField>
  )
}

function ValidatedHarness() {
  const form = useAppForm({ defaultValues: { notes: 'x' } })
  return (
    <form.AppField
      name="notes"
      validators={{ onChange: z.string().min(1, 'Notes are required') }}
    >
      {(field) => <field.TextArea label="Notes" placeholder="Tasting notes" />}
    </form.AppField>
  )
}

describe('TextArea', () => {
  it('renders the label and textarea', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Notes')).toBeTruthy()
    expect(screen.getByPlaceholderText('Tasting notes')).toBeTruthy()
  })

  it('updates the field value on change', async () => {
    render(<Harness />)
    const textarea =
      screen.getByPlaceholderText<HTMLTextAreaElement>('Tasting notes')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Floral and bright' } })
    })
    expect(textarea.value).toBe('Floral and bright')
  })

  it('shows a validation error once touched and invalid', async () => {
    render(<ValidatedHarness />)
    const textarea = screen.getByPlaceholderText('Tasting notes')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '' } })
      fireEvent.blur(textarea)
    })
    expect(screen.getByText('Notes are required')).toBeTruthy()
  })
})
