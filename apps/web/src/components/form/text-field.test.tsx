import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { useAppForm } from '@/hooks/form'

function Harness() {
  const form = useAppForm({ defaultValues: { name: '' } })
  return (
    <form.AppField name="name">
      {(field) => (
        <field.TextField label="Coffee name" placeholder="Enter name" />
      )}
    </form.AppField>
  )
}

function ValidatedHarness() {
  const form = useAppForm({ defaultValues: { name: 'x' } })
  return (
    <form.AppField
      name="name"
      validators={{ onChange: z.string().min(1, 'Name is required') }}
    >
      {(field) => (
        <field.TextField label="Coffee name" placeholder="Enter name" />
      )}
    </form.AppField>
  )
}

describe('TextField', () => {
  it('renders the label and input', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Coffee name')).toBeTruthy()
    expect(screen.getByPlaceholderText('Enter name')).toBeTruthy()
  })

  it('updates the field value on change', async () => {
    render(<Harness />)
    const input = screen.getByPlaceholderText('Enter name') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Ethiopia' } })
    })
    expect(input.value).toBe('Ethiopia')
  })

  it('shows a validation error once touched and invalid', async () => {
    render(<ValidatedHarness />)
    const input = screen.getByPlaceholderText('Enter name')
    await act(async () => {
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.blur(input)
    })
    expect(screen.getByText('Name is required')).toBeTruthy()
  })
})
