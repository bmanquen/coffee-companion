import { insertGrinderSchema } from '@coffee-companion/api/db/zod'
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

function DescribedHarness({ showLabel }: { showLabel?: boolean }) {
  const form = useAppForm({ defaultValues: { name: '' } })
  return (
    <form.AppField name="name">
      {(field) => (
        <field.TextField
          label="Coffee name"
          showLabel={showLabel}
          description="As printed on the bag"
          placeholder="Enter name"
        />
      )}
    </form.AppField>
  )
}

describe('TextField', () => {
  it('renders the label and input', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Coffee name')).toBeTruthy()
    expect(screen.getByPlaceholderText('Enter name')).toBeTruthy()
    expect(screen.getByPlaceholderText('Enter name').className).toContain(
      'placeholder:text-muted-foreground/40',
    )
  })

  it('updates the field value on change', async () => {
    render(<Harness />)
    const input = screen.getByPlaceholderText<HTMLInputElement>('Enter name')
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

  it('renders a description when one is given', () => {
    render(<DescribedHarness />)

    expect(screen.getByText('As printed on the bag')).toBeTruthy()
  })

  // showLabel={false} hides the label visually but must keep it for screen
  // readers — dropping it would leave the input unlabelled.
  it('keeps the label reachable when it is visually hidden', () => {
    render(<DescribedHarness showLabel={false} />)

    const label = screen.getByText('Coffee name')
    expect(label.closest('[data-slot="field-label"]')?.className).toContain(
      'sr-only',
    )
    expect(screen.getByLabelText('Coffee name')).toBeTruthy()
  })

  it('marks the control required when the form schema blocks an empty value', () => {
    function SchemaHarness() {
      const form = useAppForm({
        defaultValues: { name: '', brand: '' },
        validators: { onChange: insertGrinderSchema },
      })
      return (
        <form.AppField name="name">
          {(field) => <field.TextField label="Name" />}
        </form.AppField>
      )
    }

    render(<SchemaHarness />)
    const input = screen.getByLabelText('Name')
    expect(input.getAttribute('aria-required')).toBe('true')
    expect(screen.getByText('*').getAttribute('aria-hidden')).toBe('true')
  })

  it('leaves optional fields unmarked even when the form has a schema', () => {
    function OptionalHarness() {
      const form = useAppForm({
        defaultValues: { notes: null as string | null },
        validators: {
          onChange: z.object({ notes: z.string().nullish() }),
        },
      })
      return (
        <form.AppField name="notes">
          {(field) => <field.TextField label="Notes" />}
        </form.AppField>
      )
    }

    render(<OptionalHarness />)
    const input = screen.getByLabelText('Notes')
    expect(input.getAttribute('aria-required')).toBeNull()
    expect(screen.queryByText('*')).toBeNull()
  })
})
